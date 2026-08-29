export const MESSAGE_TYPES = { MOVIE: "movie", SERIES: "series", SEASON: "season" };

export function ok(data) {
    return { ok: true, data };
}

export function fail(error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/**
 * Send a request to the service worker and unwrap the response envelope.
 * Throws instead of resolving undefined, so callers can surface the failure.
 */
export async function sendMessage(payload) {
    const response = await chrome.runtime.sendMessage(payload);
    if (!response) throw new Error("No response from background service worker");
    if (!response.ok) throw new Error(response.error || "Unknown background error");
    return response.data;
}
