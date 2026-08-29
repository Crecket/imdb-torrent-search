import { isSafeUrl } from "../shared/urls.js";

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
    if (isSafeUrl(iconUrl)) {
        anchor.append(el("img", { className: "its-magnet", attrs: { src: iconUrl, alt: "magnet" } }));
    }
    if (label) anchor.append(el("span", { text: label }));
    return anchor;
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

    const table = el("table", { className: "its-table" });
    const head = el("thead");
    const headRow = el("tr");
    for (const label of ["", "Quality", "Size", "Seeds / Peers"]) headRow.append(el("th", { text: label }));
    head.append(headRow);

    const body = el("tbody");
    for (const torrent of torrents) {
        const row = el("tr");

        const downloadCell = el("td", { className: "its-download" });
        const link = magnetLink(torrent.magnet, magnetIcon);
        if (link) downloadCell.append(link);
        row.append(downloadCell);

        row.append(el("td", { text: torrent.quality ?? "" }));
        row.append(el("td", { text: torrent.size ?? "" }));

        const peersCell = el("td");
        peersCell.append(el("span", { className: "its-seeds", text: torrent.seeds ?? 0 }));
        peersCell.append(document.createTextNode(" / "));
        peersCell.append(el("span", { className: "its-peers", text: torrent.peers ?? 0 }));
        row.append(peersCell);

        body.append(row);
    }

    table.append(head, body);
    return table;
}

export function renderSeriesTable(torrents, { magnetIcon } = {}) {
    const seasons = groupEpisodes(torrents ?? []);
    if (seasons.length === 0) return renderMessage("No direct torrents were found.");

    const table = el("table", { className: "its-table" });
    const body = el("tbody");

    for (const { season, episodes } of seasons) {
        const seasonRow = el("tr", { className: "its-season" });
        seasonRow.append(el("th", { text: `Season ${season}`, attrs: { colspan: "3" } }));
        body.append(seasonRow);

        const headRow = el("tr", { className: "its-subhead" });
        for (const label of ["Ep", "Title", "Quality"]) headRow.append(el("th", { text: label }));
        body.append(headRow);

        for (const entry of episodes) {
            const row = el("tr");
            row.append(el("td", { text: entry.episode }));
            row.append(el("td", { text: entry.torrents[0]?.title ?? "" }));

            const qualityCell = el("td", { className: "its-qualities" });
            entry.torrents.forEach((torrent, index) => {
                const link = magnetLink(torrent.magnet, magnetIcon, torrent.quality ?? "download");
                if (!link) return;
                if (index > 0) qualityCell.append(document.createTextNode(" "));
                qualityCell.append(link);
            });
            row.append(qualityCell);

            body.append(row);
        }
    }

    table.append(body);
    return table;
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

        if (isSafeUrl(site.iconUrl)) {
            anchor.append(el("img", { attrs: { src: site.iconUrl, alt: "" } }));
        }
        anchor.append(el("span", { text: site.label ?? site.url }));

        container.append(anchor);
    }

    return container;
}
