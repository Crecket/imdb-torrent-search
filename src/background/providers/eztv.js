import { fetchJson } from "../http.js";
import { isSafeUrl } from "../../shared/urls.js";

/** eztv.re now 301s here; requesting the final host directly avoids the redirect. */
const EZTV_BASE = "https://eztvx.to/api/get-torrents";

const PAGE_SIZE = 100;

/**
 * Hard ceiling on pagination. The MV2 implementation recursed for as long as
 * pages came back full, with no upper bound and no reply on error.
 */
export const MAX_PAGES = 20;

const QUALITY = /\b(240p|360p|480p|720p|1080p|1440p|2160p|4K|8K)\b/i;

const CANONICAL = { "4k": "4K", "8k": "8K" };

const SOURCE = /\b(BluRay|BRRip|WEB[- ]?DL|WEBRip|WEB|HDTV|DVDRip|HDRip|REMUX)\b/i;

const SOURCE_LABELS = {
    bluray: "BluRay",
    brrip: "BRRip",
    webdl: "WEB-DL",
    "web-dl": "WEB-DL",
    "web dl": "WEB-DL",
    webrip: "WEBRip",
    web: "WEB",
    hdtv: "HDTV",
    dvdrip: "DVDRip",
    hdrip: "HDRip",
    remux: "REMUX",
};

/**
 * Release source (WEB, HDTV, BluRay...) pulled from the release name.
 * A season often lists the same quality several times over, so this is what
 * makes those entries distinguishable at a glance.
 */
export function parseSource(title) {
    if (typeof title !== "string") return null;
    const match = SOURCE.exec(title);
    if (!match) return null;
    return SOURCE_LABELS[match[1].toLowerCase().replace(/[- ]/g, "")] ?? match[1];
}

/** Pull a display quality out of a release title, or null when absent. */
export function parseQuality(title) {
    if (typeof title !== "string") return null;
    const match = QUALITY.exec(title);
    if (!match) return null;
    const raw = match[1].toLowerCase();
    return CANONICAL[raw] ?? raw;
}

function normalise(row) {
    return {
        season: Number(row.season) || 0,
        episode: Number(row.episode) || 0,
        title: typeof row.title === "string" ? row.title : "",
        quality: parseQuality(row.title),
        source: parseSource(row.title),
        magnet: row.magnet_url,
        seeds: Number(row.seeds) || 0,
        peers: Number(row.peers) || 0,
        sizeBytes: Number(row.size_bytes) || 0,
    };
}

/**
 * Fetch every episode torrent for a series, paging until a short page arrives
 * or MAX_PAGES is reached. Rejects on network failure so the caller can report
 * it rather than waiting forever.
 */
export async function fetchSeriesTorrents(imdbID, { fetchJsonImpl = fetchJson, maxPages = MAX_PAGES } = {}) {
    const numericId = String(imdbID).replace(/[^0-9]/g, "");
    const collected = [];

    for (let page = 1; page <= maxPages; page += 1) {
        const url = `${EZTV_BASE}?limit=${PAGE_SIZE}&imdb_id=${numericId}&page=${page}`;
        const payload = await fetchJsonImpl(url);
        const rows = Array.isArray(payload?.torrents) ? payload.torrents : [];

        for (const row of rows) {
            if (!isSafeUrl(row?.magnet_url)) continue;
            collected.push(normalise(row));
        }

        if (rows.length < PAGE_SIZE) break;
    }

    return collected;
}
