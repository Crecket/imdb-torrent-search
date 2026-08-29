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

export async function fetchMovieTorrents(imdbID, { fetchJsonImpl = fetchJson } = {}) {
    const url = `${TORRENTIO_BASE}/stream/movie/${encodeURIComponent(imdbID)}.json`;
    const payload = await fetchJsonImpl(url, { retries: 1, timeoutMs: 10000 });

    const streams = Array.isArray(payload?.streams) ? payload.streams : [];

    return streams
        .map(parseStream)
        .filter(Boolean)
        .sort((a, b) => (QUALITY_RANK[b.quality] ?? -1) - (QUALITY_RANK[a.quality] ?? -1) || b.seeds - a.seeds);
}
