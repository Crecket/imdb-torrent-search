import { YTS_BASES } from "./providers/yts.js";

const EZTV_PROBE = "https://eztvx.to/api/get-torrents?limit=5&imdb_id=0944947&page=1";

/**
 * Self-test attached to the service worker's global scope, so it is always
 * available in the service worker console with no copy-paste:
 *
 *   chrome://extensions -> IMDB Torrent Search -> "service worker" -> checkHosts()
 *
 * Runs with the extension's real host permissions on the user's real network,
 * which is the only place the torrent APIs can be meaningfully tested.
 */
export async function checkHosts({ timeoutMs = 25000 } = {}) {
    const targets = [
        ...YTS_BASES.map((base) => [`YTS  ${new URL(base).hostname}`, `${base}/list_movies.json?query_term=tt0111161`]),
        ["EZTV eztvx.to", EZTV_PROBE],
    ];

    console.log("%cIMDB Torrent Search — connectivity", "font-weight:bold;font-size:14px");

    const results = [];

    for (const [label, url] of targets) {
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
            const ms = Date.now() - started;

            if (!response.ok) {
                console.log(`%c  HTTP ${response.status}  ${label}  (${ms}ms)`, "color:#e5534b");
                results.push({ label, ok: false, status: response.status, ms });
                continue;
            }

            const body = await response.json();
            const count = body?.data?.movie_count ?? body?.torrents_count ?? "?";
            console.log(`%c  OK        ${label}  (${ms}ms, count=${count})`, "color:#3fb950");
            results.push({ label, ok: true, ms, count });
        } catch (error) {
            const ms = Date.now() - started;
            const timedOut = error.name === "AbortError";
            console.log(`%c  ${timedOut ? "TIMEOUT" : "FAILED "}   ${label}  (${ms}ms)`, "color:#e5534b");
            results.push({ label, ok: false, ms, error: timedOut ? "timeout" : error.message });
        } finally {
            clearTimeout(timer);
        }
    }

    const ytsUp = results.filter((r) => r.label.startsWith("YTS") && r.ok).length;
    if (ytsUp === 0) {
        console.log(
            "%c  No YTS host answered — movie lookups cannot work on this network.\n" +
                "  This is usually an ISP-level block rather than a bug; series still work.",
            "color:#d29922",
        );
    }

    return results;
}

/** Dump what is currently cached, newest first. */
export async function showCache() {
    const all = await chrome.storage.local.get(null);
    const rows = Object.entries(all)
        .filter(([key]) => key.startsWith("cache:"))
        .map(([key, entry]) => ({
            key,
            items: Array.isArray(entry?.data) ? entry.data.length : "?",
            ageMinutes: entry?.fetchedAt ? Math.round((Date.now() - entry.fetchedAt) / 60000) : "?",
        }))
        .sort((a, b) => a.ageMinutes - b.ageMinutes);

    if (rows.length === 0) console.log("Cache is empty.");
    else console.table(rows);
    return rows;
}

/** Drop every cached lookup, leaving settings untouched. */
export async function clearCache() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith("cache:"));
    if (keys.length > 0) await chrome.storage.local.remove(keys);
    console.log(`Cleared ${keys.length} cached entr${keys.length === 1 ? "y" : "ies"}.`);
    return keys.length;
}

// Attach to the service worker global so the console can reach them directly.
Object.assign(globalThis, { checkHosts, showCache, clearCache });
