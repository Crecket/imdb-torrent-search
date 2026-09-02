import { jest } from "@jest/globals";
import { isSeasonPack, fetchSeasonPacks } from "../src/background/providers/torrentio.js";

describe("isSeasonPack", () => {
    test.each([
        "Game of Thrones Season 1 (S01) 2160p HDR 5.1 x265 10bit Phun Psyz",
        "Game.of.Thrones.S01.2160p.UHD.BluRay.x265-SCOTLUHD",
        "Game Of Thrones (2011) Season 01 S01 REPACK 2160p BluRay",
        "Game.Of.Thrones.S01-S04.BluRay.4K.UHD.H265",
        "Show.Complete.Series.1080p",
    ])("accepts the pack %s", (name) => {
        expect(isSeasonPack(name)).toBe(true);
    });

    test.each([
        "Game of Thrones S01E01 Winter Is Coming 2160p MAX WEB-DL",
        "Game.of.Thrones.S01E10.1080p.BluRay",
        "Show 1x05 HDTV",
        "",
        null,
        undefined,
    ])("rejects the single episode %s", (name) => {
        expect(isSeasonPack(name)).toBe(false);
    });

    test("an episode marker beats a season marker in the same name", () => {
        expect(isSeasonPack("Show Season 1 S01E03 1080p")).toBe(false);
    });
});

describe("fetchSeasonPacks", () => {
    const pack = (name, hash) => ({
        title: `${name}\n👤 40 💾 60 GB ⚙️ TorrentGalaxy`,
        infoHash: hash,
        name: "Torrentio\n2160p",
    });

    test("queries the series endpoint for episode 1 of the season", async () => {
        const fetchJsonImpl = jest.fn(async () => ({ streams: [] }));
        await fetchSeasonPacks("tt0944947", 3, { fetchJsonImpl });
        expect(fetchJsonImpl.mock.calls[0][0]).toBe("https://torrentio.strem.fun/stream/series/tt0944947:3:1.json");
    });

    test("keeps packs and drops single episodes", async () => {
        const fetchJsonImpl = jest.fn(async () => ({
            streams: [
                pack("Show.S01.2160p.BluRay", "a".repeat(40)),
                pack("Show.S01E01.2160p.BluRay", "b".repeat(40)),
                pack("Show Season 1 1080p WEB", "c".repeat(40)),
            ],
        }));
        const result = await fetchSeasonPacks("tt1", 1, { fetchJsonImpl });
        expect(result).toHaveLength(2);
    });

    test("returns an empty list when the season has no packs", async () => {
        const fetchJsonImpl = jest.fn(async () => ({
            streams: [pack("Show.S01E01.1080p", "a".repeat(40))],
        }));
        await expect(fetchSeasonPacks("tt1", 1, { fetchJsonImpl })).resolves.toEqual([]);
    });

    test("tolerates a malformed response", async () => {
        await expect(fetchSeasonPacks("tt1", 1, { fetchJsonImpl: async () => ({}) })).resolves.toEqual([]);
    });

    test("propagates a network failure", async () => {
        const fetchJsonImpl = async () => {
            throw new Error("offline");
        };
        await expect(fetchSeasonPacks("tt1", 1, { fetchJsonImpl })).rejects.toThrow("offline");
    });
});

describe("season pack sizes", () => {
    // A stream pointing inside a multi-file torrent carries a file line, and
    // Torrentio's 💾 then measures that one episode rather than the download.
    const multiFile = (name, file, size, hash = "a".repeat(40)) => ({
        title: `${name}\n${file}\n👤 22 💾 ${size} ⚙️ 1337x`,
        infoHash: hash,
        name: "Torrentio\n4k DV | HDR",
    });

    const fetchOne = (stream, options) =>
        fetchSeasonPacks("tt1", 2, { fetchJsonImpl: async () => ({ streams: [stream] }), ...options });

    test("estimates the whole pack from the episode range in the release name", async () => {
        const [result] = await fetchOne(
            multiFile(
                "Peacemaker S02 [ E01 - 08 ] (2025) Eng 2160p DV HDR WEBRip",
                "Peacemaker S02 E01.mkv",
                "1.51 GB",
            ),
        );
        expect(result.episodes).toBe(8);
        expect(result.sizeBytes).toBe(Math.round(1.51 * 1024 ** 3) * 8);
        expect(result.size).toBe("~12 GB");
    });

    test("falls back to the episode count supplied by the caller", async () => {
        const [result] = await fetchOne(multiFile("Peacemaker.S02.2160p.MAX.WEB-DL", "Peacemaker.S02E01.mkv", "5 GB"), {
            episodeCount: 8,
        });
        expect(result.episodes).toBe(8);
        expect(result.size).toBe("~40 GB");
    });

    test("prefers the range in the name over the caller's count", async () => {
        const [result] = await fetchOne(multiFile("Show S01 [E01-E04] 1080p", "Show S01E01.mkv", "1 GB"), {
            episodeCount: 10,
        });
        expect(result.episodes).toBe(4);
    });

    test("labels the size per episode when the episode count is unknown", async () => {
        const [result] = await fetchOne(multiFile("Show.S01.2160p.WEB-DL", "Show.S01E01.mkv", "5.34 GB"));
        expect(result.size).toBe("5.34 GB/ep");
        expect(result.episodes).toBeUndefined();
    });

    test("leaves a single-file pack size alone", async () => {
        const fetchJsonImpl = async () => ({
            streams: [{ title: "Show.S01.1080p.BluRay\n👤 40 💾 60 GB ⚙️ TorrentGalaxy", infoHash: "b".repeat(40) }],
        });
        const [result] = await fetchSeasonPacks("tt1", 1, { fetchJsonImpl });
        expect(result.size).toBe("60 GB");
        expect(result.sizeBytes).toBe(60 * 1024 ** 3);
    });
});
