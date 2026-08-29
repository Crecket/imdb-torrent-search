import { fetchJson } from "../http.js";
import { toMagnet } from "../magnet.js";

/**
 * Torrentio (a Stremio addon) indexes many trackers keyed directly by IMDb id
 * and answers in ~100ms, where the surviving YTS mirror routinely takes 20s or
 * times out outright. It is the primary movie source for that reason.
 */
export const TORRENTIO_BASE = "https://torrentio.strem.fun";

const QUALITY_RANK = { "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1, "360p": 0, unknown: -1 };

const QUALITY = /\b(2160p|1440p|1080p|720p|480p|360p|4k|uhd)\b/i;

const SIZE_UNITS = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

function readQuality(text) {
    const match = QUALITY.exec(text ?? "");
    if (!match) return null;
    const raw = match[1].toLowerCase();
    // Torrentio labels 4K/UHD releases inconsistently; normalise to 2160p so
    // they sort and display alongside everything else.
    if (raw === "4k" || raw === "uhd") return "2160p";
    return raw;
}

function toBytes(size) {
    const match = /([\d.]+)\s*(KB|MB|GB|TB)/i.exec(size ?? "");
    if (!match) return 0;
    return Math.round(Number(match[1]) * (SIZE_UNITS[match[2].toUpperCase()] ?? 0));
}

/** Turn one Torrentio stream into the shared torrent shape, or null if unusable. */
export function parseStream(stream) {
    const magnet = toMagnet(stream?.infoHash, stream?.title?.split("\n")[0]);
    if (!magnet) return null;

    const title = stream.title ?? "";
    const [filename = ""] = title.split("\n");

    const seeds = Number(/👤\s*(\d+)/.exec(title)?.[1]) || 0;
    const size = /💾\s*([\d.]+\s*[KMGT]B)/i.exec(title)?.[1] ?? "";
    const source = /⚙️\s*([^\s\n]+)/.exec(title)?.[1] ?? "";

    return {
        // The release name is the only thing distinguishing entries whose
        // quality could not be parsed; it feeds the tooltip and info icon.
        title: filename,
        quality: readQuality(filename) ?? readQuality(stream.name) ?? "unknown",
        type: source,
        source,
        size,
        sizeBytes: toBytes(size),
        seeds,
        peers: 0, // Torrentio reports seeders only
        magnet,
    };
}

const EPISODE_MARKER = /S\d{1,2}\s*E\d{1,3}|\b\d{1,2}x\d{2}\b/i;
const SEASON_MARKER = /\bS\d{1,2}(?:\s*-\s*S?\d{1,2})?\b|\bSeason\s*\d{1,2}\b|\bComplete\b/i;

/**
 * True for a release covering a whole season rather than one episode.
 *
 * EZTV's per-IMDb endpoint returns no season packs at all, so Torrentio's
 * series endpoint is the only source for them. A pack names a season but no
 * individual episode.
 */
export function isSeasonPack(name) {
    if (typeof name !== "string" || name.trim() === "") return false;
    if (EPISODE_MARKER.test(name)) return false;
    return SEASON_MARKER.test(name);
}

/**
 * Season packs for one season. Torrentio keys series streams by episode, so we
 * ask for episode 1 and keep only the entries that cover the whole season.
 */
export async function fetchSeasonPacks(imdbID, season, { fetchJsonImpl = fetchJson } = {}) {
    const id = `${encodeURIComponent(imdbID)}:${Number(season)}:1`;
    const payload = await fetchJsonImpl(`${TORRENTIO_BASE}/stream/series/${id}.json`, {
        retries: 1,
        timeoutMs: 10000,
    });

    const streams = Array.isArray(payload?.streams) ? payload.streams : [];

    return streams
        .filter((stream) => isSeasonPack(stream?.title?.split("\n")[0]))
        .map(parseStream)
        .filter(Boolean)
        .sort((a, b) => (QUALITY_RANK[b.quality] ?? -1) - (QUALITY_RANK[a.quality] ?? -1) || b.seeds - a.seeds);
}

export async function fetchMovieTorrents(imdbID, { fetchJsonImpl = fetchJson } = {}) {
    const url = `${TORRENTIO_BASE}/stream/movie/${encodeURIComponent(imdbID)}.json`;
    const payload = await fetchJsonImpl(url, { retries: 1, timeoutMs: 10000 });

    const streams = Array.isArray(payload?.streams) ? payload.streams : [];

    return streams
        .map(parseStream)
        .filter(Boolean)
        .sort((a, b) => (QUALITY_RANK[b.quality] ?? -1) - (QUALITY_RANK[a.quality] ?? -1) || b.seeds - a.seeds);
}
