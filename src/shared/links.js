import { expandTemplate, isSafeUrl } from "./urls.js";

/**
 * Built-in search shortlinks.
 *
 * rarbg.to (shut down 2023), extratorrent, ibit.to and aiosearch.com were all
 * dropped: they no longer resolve. The Pirate Bay's /search/<term>/0/99/0 path
 * form was replaced by /search.php?q=.
 */
export const SEARCH_SITES = [
    {
        id: "tpb",
        label: "The Pirate Bay",
        icon: "img/tpb-favicon.png",
        build: ({ encodedTitle, year }) => `https://thepiratebay.org/search.php?q=${encodedTitle}%20${year}`,
    },
    {
        id: "1337x",
        label: "1337x",
        icon: "img/1337x-favicon.png",
        build: ({ encodedTitle, year }) => `https://1337x.to/search/${encodedTitle}+${year}/1/`,
    },
    {
        id: "yts",
        label: "YTS",
        build: ({ encodedTitle }) => `https://yts.mx/browse-movies/${encodedTitle}/all/all/0/latest/0/all`,
    },
    {
        id: "eztv",
        label: "EZTV",
        build: ({ imdbID }) => `https://eztvx.to/search/${imdbID}`,
    },
    {
        id: "knaben",
        label: "Knaben",
        // Meta-search across many trackers, so it covers sites we do not list.
        build: ({ encodedTitle, year }) => `https://knaben.org/search/${encodedTitle}%20${year}/0/1/seeders`,
    },
    {
        id: "torrentgalaxy",
        label: "TorrentGalaxy",
        build: ({ encodedTitle, year }) => `https://torrentgalaxy.one/search?q=${encodedTitle}+${year}`,
    },
];

/**
 * Build the full link list for a title: the built-in sites followed by the
 * user's own templates. Anything that does not expand to a safe URL is dropped
 * rather than rendered.
 */
export function buildSearchLinks(info, customUrls = []) {
    const encodedTitle = encodeURIComponent(
        String(info?.title ?? "")
            .replace(/[^0-9a-z ]/gi, "")
            .trim(),
    );
    const vars = { name: encodedTitle, year: info?.year ?? "", imdbID: info?.imdbID ?? "" };

    const links = [];

    for (const site of SEARCH_SITES) {
        const url = site.build({ encodedTitle, year: vars.year, imdbID: vars.imdbID });
        if (isSafeUrl(url)) links.push({ label: site.label, url, icon: site.icon });
    }

    for (const entry of customUrls ?? []) {
        if (!entry || typeof entry.urlTemplate !== "string") continue;

        const url = expandTemplate(entry.urlTemplate, vars);
        if (!isSafeUrl(url)) continue;

        const link = { label: hostLabel(url), url };
        if (isSafeUrl(entry.iconUrl)) link.iconUrl = entry.iconUrl;
        links.push(link);
    }

    return links;
}

function hostLabel(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}
