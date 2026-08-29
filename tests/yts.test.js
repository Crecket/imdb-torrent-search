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
                hash: "ABC",
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
            magnet: expect.stringContaining("magnet:?xt=urn:btih:ABC"),
        },
    ]);
});

test("builds a magnet from the hash rather than using the .torrent url", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        movieResponse([{ url: "https://yts.mx/torrent/download/DEF", hash: "DEF", quality: "720p" }]),
    );
    const [torrent] = await fetchMovieTorrents("tt0133093", { fetchJsonImpl });
    expect(torrent.magnet.startsWith("magnet:?xt=urn:btih:DEF")).toBe(true);
    expect(torrent.magnet).toContain("tr=udp");
});

test("sorts by quality descending", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        movieResponse([
            { hash: "a", quality: "720p" },
            { hash: "b", quality: "2160p" },
            { hash: "c", quality: "1080p" },
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
        .mockResolvedValueOnce(movieResponse([{ hash: "a", quality: "1080p" }]));

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
