import { fetchJson } from "../http.js";

/**
 * Cinemeta is Stremio's metadata addon. It lists a series' episodes keyed by
 * IMDb id, which Torrentio needs because its series streams are addressed per
 * episode rather than per show.
 */
export const CINEMETA_BASE = "https://v3-cinemeta.strem.io";

/**
 * Every aired episode of a series as { season, episode }, in order. Specials
 * (season 0) and episodes with a future release date are left out: neither
 * has torrents worth a request.
 */
export async function fetchEpisodeList(imdbID, { fetchJsonImpl = fetchJson, now = Date.now() } = {}) {
    const url = `${CINEMETA_BASE}/meta/series/${encodeURIComponent(imdbID)}.json`;
    const payload = await fetchJsonImpl(url, { retries: 1, timeoutMs: 10000 });

    const videos = Array.isArray(payload?.meta?.videos) ? payload.meta.videos : [];
    const seen = new Set();
    const episodes = [];

    for (const video of videos) {
        const season = Number(video?.season);
        const episode = Number(video?.episode ?? video?.number);
        if (!Number.isInteger(season) || !Number.isInteger(episode) || season < 1 || episode < 1) continue;

        const released = Date.parse(video?.released ?? "");
        if (Number.isFinite(released) && released > now) continue;

        const key = `${season}:${episode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        episodes.push({ season, episode });
    }

    return episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
}
