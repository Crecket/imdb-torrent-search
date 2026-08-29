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

function magnetLink(magnet, iconUrl, label) {
    if (!isSafeUrl(magnet)) return null;

    const anchor = el("a", { attrs: { href: magnet, rel: "noopener noreferrer" } });
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
                    torrents: entry.torrents.sort(
                        (a, b) => (QUALITY_RANK[b.quality] ?? -1) - (QUALITY_RANK[a.quality] ?? -1),
                    ),
                })),
        }));
}

export function renderMovieTable(torrents, { magnetIcon } = {}) {
    if (!torrents || torrents.length === 0) return renderMessage("No direct torrents were found.");

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

        row.append(el("td", { className: "its-quality", text: torrent.quality ?? "" }));
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
        const link = magnetLink(torrent.magnet, magnetIcon, "Magnet");
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

export function renderSeriesTable(torrents, { magnetIcon, defaultSeason } = {}) {
    const seasons = groupEpisodes(torrents ?? []);
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
                text: `${season} — ${episodes.length} episode${episodes.length === 1 ? "" : "s"}`,
                attrs: { value: String(season) },
            }),
        );
    }

    // Default to the most recent season, which is what a viewer usually wants.
    const initial = seasons.some((entry) => entry.season === defaultSeason)
        ? defaultSeason
        : seasons[seasons.length - 1].season;
    select.value = String(initial);

    wrap.append(select);
    picker.append(label, wrap);

    const total = seasons.reduce((sum, entry) => sum + entry.episodes.length, 0);
    picker.append(el("span", { className: "its-total", text: `${total} episodes across ${seasons.length} seasons` }));

    const table = el("table", { className: "its-table" });
    const body = el("tbody");
    table.append(body);

    const paint = (season) => {
        const entry = seasons.find((candidate) => candidate.season === season) ?? seasons[0];
        const rows = [];

        const headRow = el("tr", { className: "its-subhead" });
        for (const heading of ["Ep", "Title", "Quality"]) headRow.append(el("th", { text: heading }));
        rows.push(headRow);

        for (const episode of entry.episodes) {
            const row = el("tr");
            row.append(el("td", { text: episode.episode }));
            row.append(el("td", { text: episode.torrents[0]?.title ?? "" }));

            const qualityCell = el("td", { className: "its-qualities" });
            episode.torrents.forEach((torrent, index) => {
                const link = magnetLink(torrent.magnet, magnetIcon, torrent.quality ?? "download");
                if (!link) return;
                link.classList.add("its-button");
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
