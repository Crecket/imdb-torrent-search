import { MESSAGE_TYPES, ok, fail } from "../shared/messages.js";
import { fetchMovieTorrents } from "./providers/yts.js";
import { fetchSeriesTorrents } from "./providers/eztv.js";
import logger from "../shared/logger.js";

async function handle(request) {
    if (!request || typeof request.imdbID !== "string") {
        throw new Error("Malformed request: missing imdbID");
    }

    switch (request.type) {
        case MESSAGE_TYPES.MOVIE:
            return fetchMovieTorrents(request.imdbID);
        case MESSAGE_TYPES.SERIES:
            return fetchSeriesTorrents(request.imdbID);
        default:
            throw new Error(`Unknown request type: ${request.type}`);
    }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    logger.debug("request", request);

    // Every path calls sendResponse exactly once. The MV2 version left the
    // caller hanging on any failure, which showed up as a permanent "Loading…".
    handle(request)
        .then((data) => sendResponse(ok(data)))
        .catch((error) => {
            logger.error(error);
            sendResponse(fail(error));
        });

    return true; // keep the message channel open for the async reply
});
