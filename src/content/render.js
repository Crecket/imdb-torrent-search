import { isSafeImageUrl, isSafeUrl } from "../shared/urls.js";

/**
 * Every node here is built with createElement and filled with textContent.
 * The MV2 implementation concatenated API and user strings into innerHTML,
 * which let an EZTV episode title or a user-supplied icon URL execute script
 * in the content-script context.
 */

const QUALITY_RANK = { "8K": 6, "4K": 5, "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1, "360p": 0 };

function el(tag, { text, className, attrs } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
    return node;
}

const SIZE_STEPS = ["B", "KB", "MB", "GB", "TB"];

/** Byte count as a short human string, for tooltips. */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    let value = bytes;
    let step = 0;
    while (value >= 1024 && step < SIZE_STEPS.length - 1) {
        value /= 1024;
        step += 1;
    }
    // One decimal only when it adds information: "1 KB", "1.5 MB", "2 GB".
    const rounded = value >= 10 || step === 0 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
    return `${rounded} ${SIZE_STEPS[step]}`;
}

/**
 * Tooltip text for a magnet link. A season can list "720p" three times over, so
 * the release name is the only thing that tells those entries apart.
 */
export function describeTorrent(torrent) {
    if (!torrent) return "";

    const parts = [];
    if (torrent.seeds) parts.push(`${torrent.seeds} seeder${torrent.seeds === 1 ? "" : "s"}`);

    const size = torrent.size || formatBytes(torrent.sizeBytes);
    if (size) parts.push(size);
    if (torrent.source) parts.push(torrent.source);

    const name = torrent.title || "";
    if (!name) return parts.join(" · ");
    return parts.length > 0 ? `${name}\n${parts.join(" · ")}` : name;
}

function magnetLink(magnet, iconUrl, label, tooltip) {
    if (!isSafeUrl(magnet)) return null;

    const attrs = { href: magnet, rel: "noopener noreferrer" };
    if (tooltip) attrs.title = tooltip;

    const anchor = el("a", { attrs });
    if (isSafeImageUrl(iconUrl)) {
        anchor.append(el("img", { className: "its-magnet", attrs: { src: iconUrl, alt: "" } }));
    }
    if (label) anchor.append(el("span", { text: label }));
    return anchor;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (value, noun) => `${value} ${noun}${value === 1 ? "" : "s"} ago`;

/** Human-readable age for a cached result. */
export function formatAge(ms) {
    if (!Number.isFinite(ms) || ms < MINUTE) return "just now";
    if (ms < HOUR) return plural(Math.floor(ms / MINUTE), "minute");
    if (ms < DAY) return plural(Math.floor(ms / HOUR), "hour");
    return plural(Math.floor(ms / DAY), "day");
}

/** A one-line status strip above the results (updating, cache age, refresh failure). */
export function renderStatus(text, tone = "info") {
    const node = el("div", { className: "its-status", text: text ?? "" });
    node.dataset.tone = tone;
    return node;
}

/** Releases shown per quality tier. Movies get one more than episodes: a film
 *  has a single row per release, where a season lists every episode. */
export const MOVIE_PER_QUALITY = 3;
export const EPISODE_PER_QUALITY = 2;

/**
 * Keep only the best-seeded few releases of each quality.
 *
 * Torrentio can return 50+ streams for one film and 60+ for one episode, most
 * of them near-duplicates at the same quality. Showing every one buries the
 * useful entries.
 */
export function limitPerQuality(torrents, max = EPISODE_PER_QUALITY) {
    const buckets = new Map();

    for (const torrent of torrents ?? []) {
        const key = torrent.quality ?? "unknown";
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(torrent);
    }

    const kept = new Set();
    for (const bucket of buckets.values()) {
        bucket.sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0));
        for (const torrent of bucket.slice(0, max)) kept.add(torrent);
    }

    // Preserve the incoming order (already sorted by quality) rather than
    // regrouping, so the table still reads best-quality-first.
    return (torrents ?? []).filter((torrent) => kept.has(torrent));
}

/** Qualities we could not parse out of a release name. */
const UNKNOWN_QUALITY = new Set(["unknown", "", undefined, null]);

export function isUnknownQuality(quality) {
    return UNKNOWN_QUALITY.has(quality);
}

/**
 * Hoverable info marker carrying the full release name.
 *
 * Shown when the quality could not be parsed, where the table would otherwise
 * say "unknown" with nothing to identify the release. Focusable so the tooltip
 * is reachable without a mouse.
 */
export function renderInfoIcon(text) {
    if (!text) return null;
    const node = el("span", {
        className: "its-info",
        text: "i",
        attrs: { title: text, "aria-label": text, tabindex: "0", role: "note" },
    });
    return node;
}

export function renderMessage(text) {
    return el("p", { className: "its-message", text });
}

/** Group a flat EZTV torrent list into seasons and episodes, numerically sorted. */
export function groupEpisodes(torrents) {
    const seasons = new Map();

    for (const torrent of torrents) {
        if (!isSafeUrl(torrent?.magnet)) continue;

        if (!seasons.has(torrent.season)) seasons.set(torrent.season, new Map());
        const episodes = seasons.get(torrent.season);

        if (!episodes.has(torrent.episode)) {
            episodes.set(torrent.episode, { season: torrent.season, episode: torrent.episode, torrents: [] });
        }
        episodes.get(torrent.episode).torrents.push(torrent);
    }

    return [...seasons.entries()]
        .sort(([a], [b]) => a - b)
        .map(([season, episodes]) => ({
            season,
            episodes: [...episodes.values()]
                .sort((a, b) => a.episode - b.episode)
                .map((entry) => ({
                    ...entry,
                    // Best quality first, best-seeded within a quality, then
                    // capped so one episode cannot list 60 near-identical releases.
                    torrents: limitPerQuality(
                        entry.torrents.sort(
                            (a, b) =>
                                (QUALITY_RANK[b.quality] ?? -1) - (QUALITY_RANK[a.quality] ?? -1) ||
                                (b.seeds ?? 0) - (a.seeds ?? 0),
                        ),
                    ),
                })),
        }));
}

export function renderMovieTable(allTorrents, { magnetIcon, perQuality = MOVIE_PER_QUALITY } = {}) {
    if (!allTorrents || allTorrents.length === 0) return renderMessage("No direct torrents were found.");

    const torrents = limitPerQuality(allTorrents, perQuality);
    const showSource = torrents.some((torrent) => torrent.source);

    const table = el("table", { className: "its-table its-movies" });
    const head = el("thead");
    const headRow = el("tr");
    for (const heading of ["Quality", "Size", "Seeds", ...(showSource ? ["Source"] : []), ""]) {
        headRow.append(el("th", { text: heading }));
    }
    head.append(headRow);

    const body = el("tbody");
    for (const torrent of torrents) {
        const row = el("tr");

        const qualityCell = el("td", { className: "its-quality" });
        qualityCell.append(el("span", { text: torrent.quality ?? "" }));
        if (isUnknownQuality(torrent.quality)) {
            const info = renderInfoIcon(torrent.title);
            if (info) qualityCell.append(info);
        }
        row.append(qualityCell);
        row.append(el("td", { text: torrent.size ?? "" }));

        const peersCell = el("td");
        peersCell.append(el("span", { className: "its-seeds", text: torrent.seeds ?? 0 }));
        if (torrent.peers) {
            peersCell.append(document.createTextNode(" / "));
            peersCell.append(el("span", { className: "its-peers", text: torrent.peers }));
        }
        row.append(peersCell);

        if (showSource) row.append(el("td", { className: "its-source", text: torrent.source ?? "" }));

        // A labelled button, not a bare 14px icon: the old icon-only cell was
        // effectively invisible against the panel background.
        const downloadCell = el("td", { className: "its-download" });
        const link = magnetLink(torrent.magnet, magnetIcon, "Magnet", describeTorrent(torrent));
        if (link) {
            link.classList.add("its-button");
            downloadCell.append(link);
        }
        row.append(downloadCell);

        body.append(row);
    }

    table.append(head, body);
    return table;
}

/**
 * Every season the picker should offer.
 *
 * The episode index (EZTV) can miss a season entirely while a whole-season pack
 * still exists for it, so gaps are filled in rather than skipped: a season
 * absent from the dropdown is a season the viewer cannot reach at all.
 * `extraSeason` extends the range when the viewer asks for a season past the
 * last one with episodes. It is deliberately not read from IMDb's markup: the
 * season count only lives in their internal Next.js payload, which is theirs
 * to rename at will.
 */
export function seasonOptions(grouped, extraSeason) {
    const byNumber = new Map(grouped.map((entry) => [entry.season, entry]));

    const highest = Math.max(
        ...[...byNumber.keys()].filter((n) => Number.isFinite(n)),
        Number.isFinite(extraSeason) ? extraSeason : 0,
        0,
    );
    if (highest < 1) return grouped;

    const options = [];
    for (let season = 1; season <= highest; season += 1) {
        options.push(byNumber.get(season) ?? { season, episodes: [] });
    }

    // Keep any oddity the loop would drop, e.g. a season 0 of specials.
    for (const entry of grouped) {
        if (entry.season < 1) options.unshift(entry);
    }

    return options;
}

export function renderSeriesTable(torrents, { magnetIcon, defaultSeason, extraSeason } = {}) {
    const grouped = groupEpisodes(torrents ?? []);
    const seasons = seasonOptions(grouped, extraSeason);
    if (seasons.length === 0) return renderMessage("No direct torrents were found.");

    const container = el("div", { className: "its-series" });

    // A long-running show can carry thousands of torrents across 8+ seasons.
    // Rendering all of them at once is unusable, so one season is shown at a
    // time and the rest are a select away.
    const picker = el("div", { className: "its-season-picker" });
    const label = el("span", { className: "its-season-label", text: "Season" });

    const wrap = el("div", { className: "its-select-wrap" });
    const select = el("select", { className: "its-season-select", attrs: { "aria-label": "Season" } });

    for (const { season, episodes } of seasons) {
        select.append(
            el("option", {
                text:
                    episodes.length === 0
                        ? `${season} — season pack only`
                        : `${season} — ${episodes.length} episode${episodes.length === 1 ? "" : "s"}`,
                attrs: { value: String(season) },
            }),
        );
    }

    // Default to the most recent season that actually has episodes; falling on
    // an empty one would show a blank table for no reason.
    const withEpisodes = seasons.filter((entry) => entry.episodes.length > 0);
    const initial = seasons.some((entry) => entry.season === defaultSeason)
        ? defaultSeason
        : (withEpisodes[withEpisodes.length - 1] ?? seasons[seasons.length - 1]).season;
    select.value = String(initial);

    wrap.append(select);
    picker.append(label, wrap);

    // Seasons past the last indexed one are only reachable if the viewer can
    // ask for them: the episode index does not know they exist, and IMDb only
    // exposes the count in internal markup we will not depend on.
    const jump = el("form", { className: "its-season-jump" });
    const jumpInput = el("input", {
        className: "its-season-jump-input",
        attrs: {
            type: "number",
            min: "1",
            max: "99",
            step: "1",
            placeholder: "#",
            "aria-label": "Check another season",
        },
    });
    const jumpButton = el("button", { text: "Check", attrs: { type: "submit" } });
    jump.append(jumpInput, jumpButton);

    jump.addEventListener("submit", (event) => {
        event.preventDefault();
        const wanted = Number(jumpInput.value);
        if (!Number.isInteger(wanted) || wanted < 1 || wanted > 99) return;

        if (!seasons.some((entry) => entry.season === wanted)) {
            seasons.push({ season: wanted, episodes: [] });
            seasons.sort((a, b) => a.season - b.season);
            select.replaceChildren();
            for (const { season, episodes } of seasons) {
                select.append(
                    el("option", {
                        text:
                            episodes.length === 0
                                ? `${season} — season pack only`
                                : `${season} — ${episodes.length} episode${episodes.length === 1 ? "" : "s"}`,
                        attrs: { value: String(season) },
                    }),
                );
            }
        }

        select.value = String(wanted);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        jumpInput.value = "";
    });

    picker.append(jump);

    const total = seasons.reduce((sum, entry) => sum + entry.episodes.length, 0);
    picker.append(
        el("span", {
            className: "its-total",
            text: `${total} episodes across ${seasons.length} season${seasons.length === 1 ? "" : "s"}`,
        }),
    );

    const table = el("table", { className: "its-table" });
    const body = el("tbody");
    table.append(body);

    const paint = (season) => {
        const entry = seasons.find((candidate) => candidate.season === season) ?? seasons[0];
        const rows = [];

        if (entry.episodes.length === 0) {
            const row = el("tr", { className: "its-empty-season" });
            row.append(
                el("td", {
                    text: "No individual episodes indexed for this season. Any season pack is shown above.",
                    attrs: { colspan: "3" },
                }),
            );
            body.replaceChildren(row);
            return;
        }

        const headRow = el("tr", { className: "its-subhead" });
        for (const heading of ["Ep", "Title", "Quality"]) headRow.append(el("th", { text: heading }));
        rows.push(headRow);

        for (const episode of entry.episodes) {
            const row = el("tr");
            row.append(el("td", { text: episode.episode }));
            row.append(el("td", { text: episode.torrents[0]?.title ?? "" }));

            const qualityCell = el("td", { className: "its-qualities" });
            episode.torrents.forEach((torrent, index) => {
                const link = magnetLink(
                    torrent.magnet,
                    magnetIcon,
                    torrent.quality ?? "download",
                    describeTorrent(torrent),
                );
                if (!link) return;
                link.classList.add("its-button");
                if (torrent.source) link.append(el("span", { className: "its-src", text: torrent.source }));
                if (index > 0) qualityCell.append(document.createTextNode(" "));
                qualityCell.append(link);
            });
            row.append(qualityCell);

            rows.push(row);
        }

        body.replaceChildren(...rows);
    };

    select.addEventListener("change", (event) => paint(Number(event.target.value)));
    paint(initial);

    container.append(picker, table);
    return container;
}

/**
 * Season-pack row: a handful of whole-season downloads shown above the episode
 * table. EZTV carries no packs, so these come from Torrentio.
 */
export function renderSeasonPacks(packs, { magnetIcon, season, state = "ready" } = {}) {
    const box = el("div", { className: "its-packs" });
    box.dataset.state = state;

    box.append(el("span", { className: "its-packs-label", text: `Full season ${season ?? ""}`.trim() }));

    if (state === "loading") {
        box.append(el("span", { className: "its-packs-note", text: "Looking for season packs…" }));
        return box;
    }

    const usable = limitPerQuality(packs ?? [], 1);
    if (usable.length === 0) {
        box.append(el("span", { className: "its-packs-note", text: "No season packs found." }));
        return box;
    }

    for (const pack of usable) {
        const link = magnetLink(pack.magnet, magnetIcon, pack.quality ?? "download", describeTorrent(pack));
        if (!link) continue;
        link.classList.add("its-button");
        if (pack.size) link.append(el("span", { className: "its-src", text: pack.size }));
        box.append(link);
    }

    return box;
}

export function renderLinks(sites) {
    const container = el("div", { className: "its-links" });
    if (!sites || sites.length === 0) return container;

    container.append(el("b", { className: "its-links-label", text: "Search links:" }));

    for (const site of sites) {
        if (!site || !isSafeUrl(site.url)) continue;

        const anchor = el("a", {
            className: "its-pill",
            attrs: { href: site.url, target: "_blank", rel: "noopener noreferrer", title: site.label ?? "" },
        });

        if (isSafeImageUrl(site.iconUrl)) {
            anchor.append(el("img", { attrs: { src: site.iconUrl, alt: "" } }));
        }
        anchor.append(el("span", { text: site.label ?? site.url }));

        container.append(anchor);
    }

    return container;
}
