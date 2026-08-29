import { fetchJson } from "../http.js";

/**
 * Tried in order until one answers.
 *
 * movies-api.accel.li leads because it is the base that actually responds:
 * yts.mx fails to connect on many networks (EU ISP torrent-site blocks), and
 * putting a dead host first cost a full timeout before every lookup. yts.mx is
 * kept as a secondary since it works where it is not blocked.
 */
export const YTS_BASES = ["https://movies-api.accel.li/api/v2", "https://yts.mx/api/v2"];

/**
 * Per-base budget. Generous because accel.li can take well over 10s to answer,
 * but applied only once per base: the fallback loop is the retry, so retrying
 * inside fetchJson would multiply the wait on a blocked host.
 */
const BASE_TIMEOUT_MS = 25000;

const TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
];

const QUALITY_RANK = { "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1 };

/**
 * The API hands back a .torrent download URL, which a browser cannot act on
 * without a torrent client hook. The info hash is also present, so we build a
 * magnet URI from it instead.
 */
function toMagnet(hash, title) {
    const name = encodeURIComponent(title ?? "");
    const trackers = TRACKERS.map((tracker) => `tr=${encodeURIComponent(tracker)}`).join("&");
    return `magnet:?xt=urn:btih:${hash}&dn=${name}&${trackers}`;
}

function normalise(torrent, title) {
    return {
        quality: torrent.quality ?? "unknown",
        type: torrent.type ?? "",
        size: torrent.size ?? "",
        sizeBytes: Number(torrent.size_bytes) || 0,
        seeds: Number(torrent.seeds) || 0,
        peers: Number(torrent.peers) || 0,
        magnet: toMagnet(torrent.hash, title),
    };
}

/**
 * Look up movie torrents by IMDb id, trying each known API base in turn.
 * Resolves to an empty array when the movie is simply not indexed; throws only
 * when every base is unreachable.
 */
export async function fetchMovieTorrents(imdbID, { fetchJsonImpl = fetchJson, bases = YTS_BASES } = {}) {
    let lastError;

    for (const base of bases) {
        const url = `${base}/list_movies.json?query_term=${encodeURIComponent(imdbID)}`;
        try {
            const payload = await fetchJsonImpl(url, { retries: 0, timeoutMs: BASE_TIMEOUT_MS });
            const movie = payload?.data?.movies?.[0];
            if (!movie || !Array.isArray(movie.torrents)) return [];

            return movie.torrents
                .map((torrent) => normalise(torrent, movie.title))
                .sort((a, b) => (QUALITY_RANK[b.quality] ?? 0) - (QUALITY_RANK[a.quality] ?? 0));
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`YTS lookup failed for ${imdbID}: ${lastError?.message ?? "no API base reachable"}`);
}
