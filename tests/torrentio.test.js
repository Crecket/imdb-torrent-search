import { jest } from "@jest/globals";
import { parseStream, fetchMovieTorrents } from "../src/background/providers/torrentio.js";

const stream = (over = {}) => ({
    name: "Torrentio\n4k DV",
    title: "The.Shawshank.Redemption.1994.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HEVC-FraMeSToR\n👤 101 💾 54.33 GB ⚙️ TorrentGalaxy",
    infoHash: "45fa4233ef87c58f5f8b4817e4d50c9f5363caef",
    fileIdx: 0,
    ...over,
});

describe("parseStream", () => {
    test("extracts quality, seeds, size and source", () => {
        expect(parseStream(stream())).toMatchObject({
            quality: "2160p",
            seeds: 101,
            size: "54.33 GB",
            source: "TorrentGalaxy",
        });
    });

    test("builds a magnet from the info hash", () => {
        const parsed = parseStream(stream());
        expect(parsed.magnet).toContain("magnet:?xt=urn:btih:45fa4233ef87c58f5f8b4817e4d50c9f5363caef");
        expect(parsed.magnet).toContain("tr=udp");
    });

    test("reads 1080p and 720p from the filename", () => {
        expect(parseStream(stream({ title: "Movie.2020.1080p.WEB\n👤 5 💾 2 GB ⚙️ YTS" })).quality).toBe("1080p");
        expect(parseStream(stream({ title: "Movie.2020.720p.WEB\n👤 5 💾 1 GB ⚙️ YTS" })).quality).toBe("720p");
    });

    test("falls back to the name line when the filename has no quality", () => {
        expect(parseStream(stream({ name: "Torrentio\n1080p", title: "Movie\n👤 5 💾 1 GB ⚙️ YTS" })).quality).toBe(
            "1080p",
        );
    });

    test("returns unknown quality rather than dropping the stream", () => {
        expect(parseStream(stream({ name: "Torrentio", title: "Movie\n👤 1 💾 1 GB ⚙️ X" })).quality).toBe("unknown");
    });

    test("tolerates a missing seed count", () => {
        expect(parseStream(stream({ title: "Movie.1080p\n💾 2 GB ⚙️ YTS" })).seeds).toBe(0);
    });

    test("converts the size to bytes", () => {
        expect(parseStream(stream({ title: "M.1080p\n👤 1 💾 2 GB ⚙️ X" })).sizeBytes).toBe(2 * 1024 ** 3);
        expect(parseStream(stream({ title: "M.1080p\n👤 1 💾 700 MB ⚙️ X" })).sizeBytes).toBe(700 * 1024 ** 2);
    });

    test("rejects a stream with no usable info hash", () => {
        expect(parseStream(stream({ infoHash: "nope" }))).toBeNull();
        expect(parseStream(stream({ infoHash: undefined }))).toBeNull();
    });
});

describe("fetchMovieTorrents", () => {
    test("requests the movie stream endpoint for the imdb id", async () => {
        const fetchJsonImpl = jest.fn(async () => ({ streams: [] }));
        await fetchMovieTorrents("tt0111161", { fetchJsonImpl });
        expect(fetchJsonImpl.mock.calls[0][0]).toBe("https://torrentio.strem.fun/stream/movie/tt0111161.json");
    });

    test("normalises and sorts by quality descending", async () => {
        const fetchJsonImpl = jest.fn(async () => ({
            streams: [
                stream({ title: "M.720p\n👤 5 💾 1 GB ⚙️ X", infoHash: "a".repeat(40) }),
                stream({ title: "M.2160p\n👤 9 💾 9 GB ⚙️ X", infoHash: "b".repeat(40) }),
                stream({ title: "M.1080p\n👤 7 💾 3 GB ⚙️ X", infoHash: "c".repeat(40) }),
            ],
        }));
        const result = await fetchMovieTorrents("tt1", { fetchJsonImpl });
        expect(result.map((t) => t.quality)).toEqual(["2160p", "1080p", "720p"]);
    });

    test("drops unusable streams instead of failing the lookup", async () => {
        const fetchJsonImpl = jest.fn(async () => ({
            streams: [stream(), stream({ infoHash: "bad" })],
        }));
        await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).resolves.toHaveLength(1);
    });

    test("returns an empty list when nothing is indexed", async () => {
        const fetchJsonImpl = jest.fn(async () => ({ streams: [] }));
        await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).resolves.toEqual([]);
    });

    test("tolerates a response with no streams field", async () => {
        const fetchJsonImpl = jest.fn(async () => ({}));
        await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).resolves.toEqual([]);
    });

    test("propagates a network failure", async () => {
        const fetchJsonImpl = jest.fn(async () => {
            throw new Error("offline");
        });
        await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).rejects.toThrow("offline");
    });
});

describe("per-file sizes", () => {
    test("flags a size that measures one file inside a multi-file torrent", () => {
        const parsed = parseStream(
            stream({ title: "Show S02 [ E01 - 08 ] 2160p\nShow S02 E01.mkv\n👤 22 💾 1.51 GB ⚙️ 1337x" }),
        );
        expect(parsed.file).toBe("Show S02 E01.mkv");
        expect(parsed.sizeIsPerFile).toBe(true);
        expect(parsed.title).toBe("Show S02 [ E01 - 08 ] 2160p");
    });

    test("treats a two-line title as a whole-torrent size", () => {
        const parsed = parseStream(stream({ title: "Movie.2160p\n👤 5 💾 9 GB ⚙️ X" }));
        expect(parsed.sizeIsPerFile).toBe(false);
        expect(parsed.file).toBe("");
    });

    test("ignores trailing language lines after the stats line", () => {
        const parsed = parseStream(stream({ title: "Movie.2160p\n👤 5 💾 9 GB ⚙️ X\n🇬🇧 / 🇮🇹" }));
        expect(parsed.sizeIsPerFile).toBe(false);
    });
});
