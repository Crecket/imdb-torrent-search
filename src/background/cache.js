/**
 * Stale-while-revalidate cache for torrent lookups.
 *
 * The YTS mirror that answers is slow (frequently 15-25s), so a repeat visit
 * should never wait on the network. Entries older than the TTL are still
 * served — the caller shows them immediately and revalidates in the
 * background — rather than being discarded.
 */

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Cap on cached lookups. A series can hold thousands of torrents, and
 *  chrome.storage.local is only 10MB without the unlimitedStorage permission. */
export const MAX_ENTRIES = 40;

const PREFIX = "cache:";

export const cacheKey = (type, imdbID) => `${PREFIX}${type}:${imdbID}`;

/** True when an entry is missing or older than the TTL. A timestamp in the
 *  future (system clock moved) counts as fresh rather than permanently stale. */
export function isStale(entry, now = Date.now()) {
    if (!entry || typeof entry.fetchedAt !== "number") return true;
    return now - entry.fetchedAt >= CACHE_TTL_MS;
}

function storageArea(storage) {
    return storage ?? chrome.storage.local;
}

export async function readCache(key, storage) {
    try {
        const stored = await storageArea(storage).get([key]);
        const entry = stored?.[key];
        if (!entry || !Array.isArray(entry.data) || typeof entry.fetchedAt !== "number") return null;
        return entry;
    } catch {
        return null; // a cache read must never break a lookup
    }
}

export async function writeCache(key, data, storage) {
    const entry = { data, fetchedAt: Date.now() };
    try {
        await storageArea(storage).set({ [key]: entry });
        await evict(storage);
    } catch {
        // Quota exhaustion and similar are non-fatal: the caller already has
        // its data, and caching is an optimisation.
    }
    return entry;
}

/** Trim the cache to MAX_ENTRIES, dropping the oldest entries. Only keys under
 *  the cache prefix are considered, so settings are never touched. */
export async function evict(storage) {
    const area = storageArea(storage);
    try {
        const all = await area.get(null);
        const entries = Object.entries(all ?? {}).filter(([key]) => key.startsWith(PREFIX));
        if (entries.length <= MAX_ENTRIES) return 0;

        entries.sort((a, b) => (a[1]?.fetchedAt ?? 0) - (b[1]?.fetchedAt ?? 0));
        const doomed = entries.slice(0, entries.length - MAX_ENTRIES).map(([key]) => key);
        await area.remove(doomed);
        return doomed.length;
    } catch {
        return 0;
    }
}
