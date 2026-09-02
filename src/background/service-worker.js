import { MESSAGE_TYPES, ok, fail } from "../shared/messages.js";
import { fetchMovieTorrents } from "./providers/movies.js";
import { fetchSeriesTorrents } from "./providers/eztv.js";
import { fetchSeasonPacks } from "./providers/torrentio.js";
import { cacheKey, isStale, readCache, writeCache } from "./cache.js";
import logger from "../shared/logger.js";
import "./diagnostics.js";

/**
 * Revalidations in progress, keyed by cache key. Two tabs opening the same
 * title — or the eager refresh below racing the content script's explicit
 * follow-up — must share one network request, not issue two.
 */
const inFlight = new Map();

function fetchFor(type, imdbID, season, episodeCount) {
    if (type === MESSAGE_TYPES.SERIES) return fetchSeriesTorrents(imdbID);
    if (type === MESSAGE_TYPES.SEASON) return fetchSeasonPacks(imdbID, season, { episodeCount });
    return fetchMovieTorrents(imdbID);
}

function revalidate(type, imdbID, key, season, episodeCount) {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = fetchFor(type, imdbID, season, episodeCount)
        .then((data) => writeCache(key, data))
        .finally(() => inFlight.delete(key));

    inFlight.set(key, promise);
    return promise;
}

async function handle(request) {
    if (!request || typeof request.imdbID !== "string") {
        throw new Error("Malformed request: missing imdbID");
    }

    const { type, imdbID, season } = request;
    // Only used to estimate season-pack sizes; a bad value is dropped, not fatal.
    const episodeCount =
        Number.isInteger(request.episodeCount) && request.episodeCount > 0 ? request.episodeCount : undefined;
    if (!Object.values(MESSAGE_TYPES).includes(type)) {
        throw new Error(`Unknown request type: ${type}`);
    }
    if (type === MESSAGE_TYPES.SEASON && !Number.isInteger(season)) {
        throw new Error("Season lookups require an integer season");
    }

    const key = type === MESSAGE_TYPES.SEASON ? cacheKey(type, `${imdbID}:${season}`) : cacheKey(type, imdbID);

    // Explicit refresh: the caller is already showing stale data and is willing
    // to wait for the network.
    if (request.revalidate) {
        const entry = await revalidate(type, imdbID, key, season, episodeCount);
        return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
    }

    const cached = await readCache(key);
    if (cached) {
        const stale = isStale(cached);

        // Start the refresh now rather than after the caller's round trip; the
        // caller's follow-up request will join this same promise.
        if (stale) revalidate(type, imdbID, key, season, episodeCount).catch(logger.error);

        return { data: cached.data, fetchedAt: cached.fetchedAt, stale };
    }

    const entry = await revalidate(type, imdbID, key, season, episodeCount);
    return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    logger.debug("request", request);

    // Every path calls sendResponse exactly once. The MV2 version left the
    // caller hanging on any failure, which showed up as a permanent "Loading…".
    handle(request)
        .then((payload) => sendResponse(ok(payload)))
        .catch((error) => {
            logger.error(error);
            sendResponse(fail(error));
        });

    return true; // keep the message channel open for the async reply
});
