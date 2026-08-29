/**
 * Fetch JSON with a hard timeout and a bounded retry.
 *
 * Retries network failures and 5xx responses; a 4xx is treated as a final
 * answer and thrown immediately. Replaces the axios usage from the MV2
 * background page, which relied on XMLHttpRequest and therefore cannot run
 * inside an MV3 service worker.
 */
export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 15000, retries = 1 } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetchImpl(url, { signal: controller.signal, credentials: "omit" });

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status} for ${url}`);
                error.retryable = response.status >= 500;
                throw error;
            }

            return await response.json();
        } catch (error) {
            lastError = error;
            if (error.retryable === false) throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError;
}
