import { MESSAGE_TYPES, ok, fail } from "../shared/messages.js";
import { fetchMovieTorrents } from "./providers/movies.js";
import { fetchSeriesTorrents } from "./providers/eztv.js";
import { cacheKey, isStale, readCache, writeCache } from "./cache.js";
import logger from "../shared/logger.js";
import "./diagnostics.js";

/**
 * Revalidations in progress, keyed by cache key. Two tabs opening the same
 * title — or the eager refresh below racing the content script's explicit
 * follow-up — must share one network request, not issue two.
 */
const inFlight = new Map();

function fetchFor(type, imdbID) {
    return type === MESSAGE_TYPES.SERIES ? fetchSeriesTorrents(imdbID) : fetchMovieTorrents(imdbID);
}

function revalidate(type, imdbID, key) {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = fetchFor(type, imdbID)
        .then((data) => writeCache(key, data))
        .finally(() => inFlight.delete(key));

    inFlight.set(key, promise);
    return promise;
}

async function handle(request) {
    if (!request || typeof request.imdbID !== "string") {
        throw new Error("Malformed request: missing imdbID");
    }

    const { type, imdbID } = request;
    if (type !== MESSAGE_TYPES.MOVIE && type !== MESSAGE_TYPES.SERIES) {
        throw new Error(`Unknown request type: ${type}`);
    }

    const key = cacheKey(type, imdbID);

    // Explicit refresh: the caller is already showing stale data and is willing
    // to wait for the network.
    if (request.revalidate) {
        const entry = await revalidate(type, imdbID, key);
        return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
    }

    const cached = await readCache(key);
    if (cached) {
        const stale = isStale(cached);

        // Start the refresh now rather than after the caller's round trip; the
        // caller's follow-up request will join this same promise.
        if (stale) revalidate(type, imdbID, key).catch(logger.error);

        return { data: cached.data, fetchedAt: cached.fetchedAt, stale };
    }

    const entry = await revalidate(type, imdbID, key);
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
