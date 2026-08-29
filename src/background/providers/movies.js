import { fetchMovieTorrents as fromTorrentio } from "./torrentio.js";
import { fetchMovieTorrents as fromYts } from "./yts.js";
import logger from "../../shared/logger.js";

/**
 * Movie lookups, fastest usable source first.
 *
 * Torrentio answers in roughly 100ms and aggregates many trackers. YTS is kept
 * only as a fallback: its surviving mirror regularly takes 20s or times out, so
 * it is consulted just when Torrentio fails or genuinely has nothing.
 */
export async function fetchMovieTorrents(imdbID, { sources } = {}) {
    const providers = sources ?? [
        ["torrentio", fromTorrentio],
        ["yts", fromYts],
    ];

    const failures = [];

    for (const [name, provider] of providers) {
        try {
            const torrents = await provider(imdbID);
            if (torrents.length > 0) return torrents;
            logger.debug(`${name} returned no torrents for ${imdbID}`);
        } catch (error) {
            logger.debug(`${name} failed for ${imdbID}`, error);
            failures.push(`${name}: ${error.message}`);
        }
    }

    // Every source failing is an error; every source simply having nothing is
    // an empty result, which the UI renders as "no torrents found".
    if (failures.length === providers.length) {
        throw new Error(`Movie lookup failed for ${imdbID} — ${failures.join("; ")}`);
    }

    return [];
}
