import { fetchJson } from "../http.js";
import { toMagnet } from "../magnet.js";
import { formatBytes } from "../../shared/format.js";

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

const STATS_MARKER = /[\u{1F464}\u{1F4BE}\u2699]/u;

/**
 * A Torrentio title reads "<release>\n[<matched file>\n]<stats>...". The file
 * line appears only when the stream points at one file inside a multi-file
 * torrent, and 💾 then measures that file rather than the whole download.
 */
function splitTitle(title) {
    const lines = String(title ?? "").split("\n");
    const release = lines[0] ?? "";
    const second = lines[1] ?? "";
    return { release, file: second && !STATS_MARKER.test(second) ? second : "" };
}

/** Turn one Torrentio stream into the shared torrent shape, or null if unusable. */
export function parseStream(stream) {
    const { release, file } = splitTitle(stream?.title);

    const magnet = toMagnet(stream?.infoHash, release);
    if (!magnet) return null;

    const title = stream.title ?? "";

    const seeds = Number(/👤\s*(\d+)/.exec(title)?.[1]) || 0;
    const size = /💾\s*([\d.]+\s*[KMGT]B)/i.exec(title)?.[1] ?? "";
    const source = /⚙️\s*([^\s\n]+)/.exec(title)?.[1] ?? "";

    return {
        // The release name is the only thing distinguishing entries whose
        // quality could not be parsed; it feeds the tooltip and info icon.
        title: release,
        file,
        quality: readQuality(release) ?? readQuality(stream.name) ?? "unknown",
        type: source,
        source,
        size,
        sizeBytes: toBytes(size),
        sizeIsPerFile: Boolean(file),
        seeds,
        peers: 0, // Torrentio reports seeders only
        magnet,
    };
}

// "S02 [ E01 - 08 ]", "S01E01-E04", "Episodes 1-8". The leading E/EP keeps the
// year in "(2020-2021)" and the channel count in "5.1" out of the match.
const EPISODE_RANGE = /\b(?:EP?|Episodes?\s*)(\d{1,3})\s*(?:-|–|~|to)\s*(?:EP?)?(\d{1,3})\b/i;

/** How many episodes a release name claims to cover, or null when it says nothing. */
export function countEpisodes(name) {
    const match = EPISODE_RANGE.exec(name ?? "");
    if (!match) return null;
    const total = Number(match[2]) - Number(match[1]) + 1;
    return total >= 2 && total <= 200 ? total : null;
}

/**
 * Give a pack a size describing the download rather than one episode.
 *
 * Torrentio never reports a multi-file torrent's total, so the best available
 * figure is the matched episode multiplied by the season's episode count —
 * marked "~" because episodes are not all the same size. With no count to go
 * on, the per-episode figure is labelled as such rather than passed off as the
 * download size, which is what made a 1.51 GB label pull a whole 2160p season.
 */
function withPackSize(pack, episodeCount) {
    if (!pack.sizeIsPerFile) return pack;

    const episodes = countEpisodes(pack.title) ?? (episodeCount > 1 ? episodeCount : null);
    if (!episodes || pack.sizeBytes <= 0) {
        return { ...pack, size: pack.size ? `${pack.size}/ep` : "" };
    }

    const sizeBytes = pack.sizeBytes * episodes;
    return {
        ...pack,
        episodes,
        episodeSizeBytes: pack.sizeBytes,
        sizeBytes,
        size: `~${formatBytes(sizeBytes)}`,
        sizeIsPerFile: false,
        sizeIsEstimate: true,
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
export async function fetchSeasonPacks(imdbID, season, { fetchJsonImpl = fetchJson, episodeCount } = {}) {
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
        .map((pack) => withPackSize(pack, episodeCount))
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
