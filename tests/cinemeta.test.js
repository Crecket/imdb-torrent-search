import { jest } from "@jest/globals";
import { fetchEpisodeList } from "../src/background/providers/cinemeta.js";

const NOW = Date.parse("2026-10-25T00:00:00Z");

const meta = (videos) => ({ meta: { videos } });

test("requests the series meta for the imdb id", async () => {
    const fetchJsonImpl = jest.fn(async () => meta([]));
    await fetchEpisodeList("tt0944947", { fetchJsonImpl, now: NOW });
    expect(fetchJsonImpl.mock.calls[0][0]).toBe("https://v3-cinemeta.strem.io/meta/series/tt0944947.json");
});

test("lists aired episodes in order, without specials or duplicates", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        meta([
            { season: 2, episode: 1, released: "2012-04-01T00:00:00.000Z" },
            { season: 1, episode: 2, released: "2011-04-24T00:00:00.000Z" },
            { season: 0, episode: 1, released: "2011-01-01T00:00:00.000Z" },
            { season: 1, number: 1, released: "2011-04-17T00:00:00.000Z" },
            { season: 1, episode: 2, released: "2011-04-24T00:00:00.000Z" },
        ]),
    );

    await expect(fetchEpisodeList("tt1", { fetchJsonImpl, now: NOW })).resolves.toEqual([
        { season: 1, episode: 1 },
        { season: 1, episode: 2 },
        { season: 2, episode: 1 },
    ]);
});

test("skips episodes that have not aired yet but keeps undated ones", async () => {
    const fetchJsonImpl = jest.fn(async () =>
        meta([
            { season: 3, episode: 1, released: "2027-01-01T00:00:00.000Z" },
            { season: 3, episode: 2 },
        ]),
    );

    await expect(fetchEpisodeList("tt1", { fetchJsonImpl, now: NOW })).resolves.toEqual([{ season: 3, episode: 2 }]);
});

test("tolerates a payload with no videos", async () => {
    await expect(fetchEpisodeList("tt1", { fetchJsonImpl: async () => ({}), now: NOW })).resolves.toEqual([]);
});
