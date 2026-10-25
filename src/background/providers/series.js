import { fetchSeriesTorrents as fromEztv } from "./eztv.js";
import { fetchEpisodeTorrents as fromTorrentio } from "./torrentio.js";
import logger from "../../shared/logger.js";

/**
 * Series episode lookups, EZTV first.
 *
 * EZTV returns a whole show in a few paged requests, but it is blocked outright
 * in some countries (HTTP 451) and misses some shows. Torrentio needs one
 * request per episode, so it is only consulted when EZTV fails or has nothing.
 */
export async function fetchSeriesTorrents(imdbID, { sources } = {}) {
    const providers = sources ?? [
        ["eztv", fromEztv],
        ["torrentio", fromTorrentio],
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

    if (failures.length === providers.length) {
        throw new Error(`Series lookup failed for ${imdbID} — ${failures.join("; ")}`);
    }

    return [];
}
