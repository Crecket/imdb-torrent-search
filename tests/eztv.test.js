import { jest } from "@jest/globals";
import { MAX_PAGES, parseQuality, fetchSeriesTorrents } from "../src/background/providers/eztv.js";

const row = (over = {}) => ({
    hash: "abc",
    title: "Game of Thrones S01E10 1080p BluRay",
    magnet_url: "magnet:?xt=urn:btih:abc",
    season: "1",
    episode: "10",
    seeds: 12,
    peers: 0,
    size_bytes: "1048576",
    ...over,
});

const page = (rows) => ({ torrents_count: rows.length, torrents: rows });

describe("parseQuality", () => {
    test.each([
        ["Show S01E01 1080p WEB", "1080p"],
        ["Show S01E01 720p HDTV", "720p"],
        ["Show S01E01 2160p UHD BluRay x265", "2160p"],
        ["Show S01E01 4K remux", "4K"],
        ["Show S01E01 480p", "480p"],
    ])("reads %s as %s", (title, expected) => {
        expect(parseQuality(title)).toBe(expected);
    });

    test("returns null when no quality is present", () => {
        expect(parseQuality("Show S01E01 HDTV x264")).toBeNull();
    });

    test("tolerates a non-string title", () => {
        expect(parseQuality(undefined)).toBeNull();
    });
});

describe("fetchSeriesTorrents", () => {
    test("strips the leading letters from the imdb id", async () => {
        const fetchJsonImpl = jest.fn(async () => page([]));
        await fetchSeriesTorrents("tt0944947", { fetchJsonImpl });
        expect(fetchJsonImpl.mock.calls[0][0]).toContain("imdb_id=0944947");
        expect(fetchJsonImpl.mock.calls[0][0]).toContain("eztvx.to");
    });

    test("normalises a row and coerces season/episode to numbers", async () => {
        const fetchJsonImpl = jest.fn(async () => page([row()]));
        const [torrent] = await fetchSeriesTorrents("tt0944947", { fetchJsonImpl });

        expect(torrent).toEqual({
            season: 1,
            episode: 10,
            title: "Game of Thrones S01E10 1080p BluRay",
            quality: "1080p",
            magnet: "magnet:?xt=urn:btih:abc",
            seeds: 12,
            peers: 0,
            sizeBytes: 1048576,
        });
        expect(typeof torrent.season).toBe("number");
        expect(typeof torrent.episode).toBe("number");
    });

    test("pages until a short page is returned", async () => {
        const full = page(Array.from({ length: 100 }, () => row()));
        const fetchJsonImpl = jest
            .fn()
            .mockResolvedValueOnce(full)
            .mockResolvedValueOnce(full)
            .mockResolvedValueOnce(page([row()]));

        const result = await fetchSeriesTorrents("tt0944947", { fetchJsonImpl });

        expect(fetchJsonImpl).toHaveBeenCalledTimes(3);
        expect(result).toHaveLength(201);
    });

    test("stops at MAX_PAGES when every page comes back full", async () => {
        const full = page(Array.from({ length: 100 }, () => row()));
        const fetchJsonImpl = jest.fn(async () => full);

        const result = await fetchSeriesTorrents("tt0944947", { fetchJsonImpl });

        expect(fetchJsonImpl).toHaveBeenCalledTimes(MAX_PAGES);
        expect(result).toHaveLength(MAX_PAGES * 100);
    });

    test("honours an explicit maxPages override", async () => {
        const full = page(Array.from({ length: 100 }, () => row()));
        const fetchJsonImpl = jest.fn(async () => full);
        await fetchSeriesTorrents("tt0944947", { fetchJsonImpl, maxPages: 2 });
        expect(fetchJsonImpl).toHaveBeenCalledTimes(2);
    });

    test("returns an empty list when the series is not indexed", async () => {
        const fetchJsonImpl = jest.fn(async () => page([]));
        await expect(fetchSeriesTorrents("tt0000000", { fetchJsonImpl })).resolves.toEqual([]);
    });

    test("tolerates a response with no torrents field", async () => {
        const fetchJsonImpl = jest.fn(async () => ({ torrents_count: 0 }));
        await expect(fetchSeriesTorrents("tt1", { fetchJsonImpl })).resolves.toEqual([]);
    });

    test("skips rows without a usable magnet", async () => {
        const fetchJsonImpl = jest.fn(async () => page([row(), row({ magnet_url: "javascript:alert(1)" })]));
        await expect(fetchSeriesTorrents("tt1", { fetchJsonImpl })).resolves.toHaveLength(1);
    });

    test("propagates a fetch failure instead of hanging", async () => {
        const fetchJsonImpl = jest.fn(async () => {
            throw new Error("eztv unreachable");
        });
        await expect(fetchSeriesTorrents("tt1", { fetchJsonImpl })).rejects.toThrow("eztv unreachable");
    });
});
