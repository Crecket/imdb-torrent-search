import { jest } from "@jest/globals";
import { CACHE_TTL_MS, MAX_ENTRIES, cacheKey, isStale, readCache, writeCache, evict } from "../src/background/cache.js";

function fakeStorage(initial = {}) {
    let store = { ...initial };
    return {
        get: jest.fn(async (keys) => {
            if (keys === null) return { ...store };
            return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
        }),
        set: jest.fn(async (obj) => {
            store = { ...store, ...obj };
        }),
        remove: jest.fn(async (keys) => {
            for (const k of [].concat(keys)) delete store[k];
        }),
        _dump: () => store,
    };
}

test("cacheKey namespaces by type and id", () => {
    expect(cacheKey("movie", "tt1")).toBe("cache:movie:tt1");
    expect(cacheKey("series", "tt1")).not.toBe(cacheKey("movie", "tt1"));
});

test("TTL is one hour", () => {
    expect(CACHE_TTL_MS).toBe(60 * 60 * 1000);
});

describe("isStale", () => {
    const now = 1_000_000_000;

    test("fresh just under the TTL", () => {
        expect(isStale({ fetchedAt: now - (CACHE_TTL_MS - 1) }, now)).toBe(false);
    });

    test("stale exactly at the TTL", () => {
        expect(isStale({ fetchedAt: now - CACHE_TTL_MS }, now)).toBe(true);
    });

    test("a missing entry counts as stale", () => {
        expect(isStale(null, now)).toBe(true);
    });

    test("a future timestamp from a clock change is not stale", () => {
        expect(isStale({ fetchedAt: now + 5000 }, now)).toBe(false);
    });
});

describe("readCache", () => {
    test("returns null on a miss", async () => {
        await expect(readCache("cache:movie:tt1", fakeStorage())).resolves.toBeNull();
    });

    test("round-trips a written entry", async () => {
        const storage = fakeStorage();
        await writeCache("cache:movie:tt1", [{ quality: "1080p" }], storage);
        const entry = await readCache("cache:movie:tt1", storage);
        expect(entry.data).toEqual([{ quality: "1080p" }]);
        expect(typeof entry.fetchedAt).toBe("number");
    });

    test("rejects a malformed entry rather than returning junk", async () => {
        const storage = fakeStorage({ "cache:movie:tt1": { data: "not an array", fetchedAt: 1 } });
        await expect(readCache("cache:movie:tt1", storage)).resolves.toBeNull();
    });

    test("rejects an entry with no timestamp", async () => {
        const storage = fakeStorage({ "cache:movie:tt1": { data: [] } });
        await expect(readCache("cache:movie:tt1", storage)).resolves.toBeNull();
    });

    test("survives a storage failure", async () => {
        const storage = fakeStorage();
        storage.get = jest.fn(async () => {
            throw new Error("storage unavailable");
        });
        await expect(readCache("cache:movie:tt1", storage)).resolves.toBeNull();
    });
});

describe("writeCache", () => {
    test("caching an empty result is still a cache hit", async () => {
        const storage = fakeStorage();
        await writeCache("cache:movie:tt1", [], storage);
        await expect(readCache("cache:movie:tt1", storage)).resolves.toMatchObject({ data: [] });
    });

    test("a quota failure does not throw", async () => {
        const storage = fakeStorage();
        storage.set = jest.fn(async () => {
            throw new Error("QUOTA_BYTES quota exceeded");
        });
        await expect(writeCache("cache:movie:tt1", [], storage)).resolves.toBeDefined();
    });
});

describe("evict", () => {
    test("keeps the cache under MAX_ENTRIES, dropping the oldest first", async () => {
        const seed = {};
        for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
            seed[`cache:movie:tt${i}`] = { data: [], fetchedAt: i };
        }
        const storage = fakeStorage(seed);

        const removed = await evict(storage);

        expect(removed).toBe(5);
        const left = Object.keys(storage._dump());
        expect(left).toHaveLength(MAX_ENTRIES);
        expect(left).not.toContain("cache:movie:tt0");
        expect(left).toContain(`cache:movie:tt${MAX_ENTRIES + 4}`);
    });

    test("never evicts non-cache keys such as settings", async () => {
        const seed = { autoShow: true, displayLinks: false, customUrls: [] };
        for (let i = 0; i < MAX_ENTRIES + 3; i += 1) {
            seed[`cache:movie:tt${i}`] = { data: [], fetchedAt: i };
        }
        const storage = fakeStorage(seed);

        await evict(storage);

        const left = storage._dump();
        expect(left.autoShow).toBe(true);
        expect(left.displayLinks).toBe(false);
        expect(left.customUrls).toEqual([]);
    });

    test("does nothing when under the cap", async () => {
        const storage = fakeStorage({ "cache:movie:tt1": { data: [], fetchedAt: 1 } });
        await expect(evict(storage)).resolves.toBe(0);
        expect(storage.remove).not.toHaveBeenCalled();
    });
});
