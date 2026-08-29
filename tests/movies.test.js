import { jest } from "@jest/globals";
import { fetchMovieTorrents } from "../src/background/providers/movies.js";

const torrent = (quality) => ({ quality, magnet: "magnet:?xt=urn:btih:a", seeds: 1, peers: 0 });

test("uses the first source that returns results and does not call the rest", async () => {
    const fast = jest.fn(async () => [torrent("1080p")]);
    const slow = jest.fn(async () => [torrent("720p")]);

    const result = await fetchMovieTorrents("tt1", {
        sources: [
            ["fast", fast],
            ["slow", slow],
        ],
    });

    expect(result).toEqual([torrent("1080p")]);
    expect(slow).not.toHaveBeenCalled();
});

test("falls back to the next source when the first throws", async () => {
    const broken = jest.fn(async () => {
        throw new Error("offline");
    });
    const working = jest.fn(async () => [torrent("720p")]);

    await expect(
        fetchMovieTorrents("tt1", {
            sources: [
                ["broken", broken],
                ["working", working],
            ],
        }),
    ).resolves.toHaveLength(1);
    expect(working).toHaveBeenCalled();
});

test("falls back when the first source returns an empty list", async () => {
    const empty = jest.fn(async () => []);
    const working = jest.fn(async () => [torrent("1080p")]);

    await expect(
        fetchMovieTorrents("tt1", {
            sources: [
                ["empty", empty],
                ["working", working],
            ],
        }),
    ).resolves.toHaveLength(1);
});

test("an empty result from every source is not an error", async () => {
    await expect(
        fetchMovieTorrents("tt1", {
            sources: [
                ["a", async () => []],
                ["b", async () => []],
            ],
        }),
    ).resolves.toEqual([]);
});

test("throws only when every source fails", async () => {
    const boom = async () => {
        throw new Error("offline");
    };
    await expect(
        fetchMovieTorrents("tt1", {
            sources: [
                ["a", boom],
                ["b", boom],
            ],
        }),
    ).rejects.toThrow(/Movie lookup failed.*a: offline.*b: offline/s);
});

test("a failure plus an empty result is an empty result, not an error", async () => {
    await expect(
        fetchMovieTorrents("tt1", {
            sources: [
                [
                    "broken",
                    async () => {
                        throw new Error("offline");
                    },
                ],
                ["empty", async () => []],
            ],
        }),
    ).resolves.toEqual([]);
});
