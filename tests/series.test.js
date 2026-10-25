import { jest } from "@jest/globals";
import { fetchSeriesTorrents } from "../src/background/providers/series.js";

const torrent = (season, episode) => ({ season, episode, quality: "1080p", magnet: "magnet:?xt=urn:btih:a", seeds: 1 });

test("uses EZTV when it returns torrents and never touches the fallback", async () => {
    const eztv = jest.fn(async () => [torrent(1, 1)]);
    const torrentio = jest.fn(async () => [torrent(1, 2)]);

    const result = await fetchSeriesTorrents("tt1", {
        sources: [
            ["eztv", eztv],
            ["torrentio", torrentio],
        ],
    });

    expect(result).toEqual([torrent(1, 1)]);
    expect(torrentio).not.toHaveBeenCalled();
});

test("falls back when EZTV is blocked", async () => {
    const eztv = jest.fn(async () => {
        throw new Error("HTTP 451 for https://eztvx.to/api/get-torrents");
    });
    const torrentio = jest.fn(async () => [torrent(1, 2)]);

    const result = await fetchSeriesTorrents("tt1", {
        sources: [
            ["eztv", eztv],
            ["torrentio", torrentio],
        ],
    });

    expect(result).toEqual([torrent(1, 2)]);
});

test("falls back when EZTV has nothing for the show", async () => {
    const torrentio = jest.fn(async () => [torrent(2, 1)]);

    const result = await fetchSeriesTorrents("tt1", {
        sources: [
            ["eztv", async () => []],
            ["torrentio", torrentio],
        ],
    });

    expect(result).toEqual([torrent(2, 1)]);
});

test("reports every source's failure when all of them fail", async () => {
    const failing = (message) => async () => {
        throw new Error(message);
    };

    await expect(
        fetchSeriesTorrents("tt1", {
            sources: [
                ["eztv", failing("HTTP 451")],
                ["torrentio", failing("timeout")],
            ],
        }),
    ).rejects.toThrow(/eztv: HTTP 451; torrentio: timeout/);
});

test("returns an empty list when every source simply has nothing", async () => {
    await expect(
        fetchSeriesTorrents("tt1", {
            sources: [
                ["eztv", async () => []],
                ["torrentio", async () => []],
            ],
        }),
    ).resolves.toEqual([]);
});
