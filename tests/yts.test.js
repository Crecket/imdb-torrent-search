import { jest } from "@jest/globals";
import { YTS_BASES, fetchMovieTorrents } from "../src/background/providers/yts.js";

const movieResponse = (torrents) => ({
    status: "ok",
    data: {
        movie_count: 1,
        movies: [{ imdb_code: "tt0133093", title: "The Matrix", torrents }],
    },
});

test("normalises a torrent list", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        movieResponse([
            {
                url: "https://yts.mx/torrent/download/ABC",
                hash: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
                quality: "1080p",
                type: "bluray",
                seeds: 120,
                peers: 7,
                size: "2.1 GB",
                size_bytes: 2254857830,
            },
        ]),
    );

    const result = await fetchMovieTorrents("tt0133093", { fetchJsonImpl });

    expect(result).toEqual([
        {
            quality: "1080p",
            type: "bluray",
            size: "2.1 GB",
            sizeBytes: 2254857830,
            seeds: 120,
            peers: 7,
            magnet: expect.stringContaining("magnet:?xt=urn:btih:a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"),
        },
    ]);
});

test("builds a magnet from the hash rather than using the .torrent url", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        movieResponse([
            {
                url: "https://yts.mx/torrent/download/DEF",
                hash: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
                quality: "720p",
            },
        ]),
    );
    const [torrent] = await fetchMovieTorrents("tt0133093", { fetchJsonImpl });
    expect(torrent.magnet.startsWith("magnet:?xt=urn:btih:b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2")).toBe(true);
    expect(torrent.magnet).toContain("tr=udp");
});

test("sorts by quality descending", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        movieResponse([
            { hash: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", quality: "720p" },
            { hash: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4", quality: "2160p" },
            { hash: "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5", quality: "1080p" },
        ]),
    );
    const result = await fetchMovieTorrents("tt0133093", { fetchJsonImpl });
    expect(result.map((t) => t.quality)).toEqual(["2160p", "1080p", "720p"]);
});

test("returns an empty list when nothing matches", async () => {
    const fetchJsonImpl = jest.fn(async () => ({ status: "ok", data: { movie_count: 0 } }));
    await expect(fetchMovieTorrents("tt0000000", { fetchJsonImpl })).resolves.toEqual([]);
});

test("returns an empty list when the movie has no torrents array", async () => {
    const fetchJsonImpl = jest.fn(async () => ({
        status: "ok",
        data: { movie_count: 1, movies: [{ imdb_code: "tt1" }] },
    }));
    await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).resolves.toEqual([]);
});

test("falls through to the next base url when the first fails", async () => {
    const fetchJsonImpl = jest
        .fn()
        .mockRejectedValueOnce(new Error("DNS failure"))
        .mockResolvedValueOnce(movieResponse([{ hash: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", quality: "1080p" }]));

    const result = await fetchMovieTorrents("tt0133093", { fetchJsonImpl });

    expect(result).toHaveLength(1);
    expect(fetchJsonImpl).toHaveBeenCalledTimes(2);
    expect(fetchJsonImpl.mock.calls[0][0]).toContain(YTS_BASES[0]);
    expect(fetchJsonImpl.mock.calls[1][0]).toContain(YTS_BASES[1]);
});

test("throws once every base url has failed", async () => {
    const fetchJsonImpl = jest.fn(async () => {
        throw new Error("unreachable");
    });
    await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).rejects.toThrow(/YTS/i);
    expect(fetchJsonImpl).toHaveBeenCalledTimes(YTS_BASES.length);
});

test("sends the imdb id as the query term", async () => {
    const fetchJsonImpl = jest.fn(async () => movieResponse([]));
    await fetchMovieTorrents("tt0133093", { fetchJsonImpl });
    expect(fetchJsonImpl.mock.calls[0][0]).toContain("query_term=tt0133093");
});

describe("base ordering and per-base budget", () => {
    test("tries the reachable accel.li base before yts.mx", () => {
        // yts.mx fails to connect on blocked networks; leading with it cost a
        // full timeout on every lookup before the working base was reached.
        expect(YTS_BASES[0]).toContain("movies-api.accel.li");
        expect(YTS_BASES).toContain("https://yts.mx/api/v2");
    });

    test("disables fetchJson's own retry so a dead base costs one timeout, not two", async () => {
        const fetchJsonImpl = jest.fn(async () =>
            movieResponse([{ hash: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", quality: "1080p" }]),
        );
        await fetchMovieTorrents("tt0133093", { fetchJsonImpl });

        const [, options] = fetchJsonImpl.mock.calls[0];
        expect(options.retries).toBe(0);
        expect(options.timeoutMs).toBeGreaterThanOrEqual(20000);
    });

    test("still reaches the second base when the first times out", async () => {
        const fetchJsonImpl = jest
            .fn()
            .mockRejectedValueOnce(new Error("This operation was aborted"))
            .mockResolvedValueOnce(
                movieResponse([{ hash: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", quality: "1080p" }]),
            );

        await expect(fetchMovieTorrents("tt0133093", { fetchJsonImpl })).resolves.toHaveLength(1);
        expect(fetchJsonImpl).toHaveBeenCalledTimes(2);
    });
});

describe("base racing", () => {
    test("issues all base requests in parallel rather than waiting for the first", async () => {
        let resolveSlow;
        const fetchJsonImpl = jest.fn((url) => {
            if (url.includes("accel.li")) return new Promise((r) => (resolveSlow = r));
            return Promise.resolve(
                movieResponse([{ hash: "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6", quality: "1080p" }]),
            );
        });

        const resultPromise = fetchMovieTorrents("tt0133093", { fetchJsonImpl });

        // Both bases must already have been contacted while the slow one hangs.
        expect(fetchJsonImpl).toHaveBeenCalledTimes(YTS_BASES.length);

        // The fast base wins without the slow one ever settling.
        await expect(resultPromise).resolves.toEqual([expect.objectContaining({ quality: "1080p" })]);
        expect(resolveSlow).toBeDefined();
    });

    test("a slow-but-successful base still wins when it is the only one that works", async () => {
        const fetchJsonImpl = jest.fn((url) =>
            url.includes("accel.li")
                ? Promise.resolve(
                      movieResponse([{ hash: "0707070707070707070707070707070707070707", quality: "720p" }]),
                  )
                : Promise.reject(new Error("fetch failed")),
        );

        await expect(fetchMovieTorrents("tt0133093", { fetchJsonImpl })).resolves.toHaveLength(1);
    });

    test("reports every base's reason when all of them fail", async () => {
        const fetchJsonImpl = jest
            .fn()
            .mockRejectedValueOnce(new Error("fetch failed"))
            .mockRejectedValueOnce(new Error("This operation was aborted"));

        await expect(fetchMovieTorrents("tt1", { fetchJsonImpl })).rejects.toThrow(
            /fetch failed.*aborted|aborted.*fetch failed/s,
        );
    });
});
