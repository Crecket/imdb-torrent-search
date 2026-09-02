import { episodesInSeason } from "../src/shared/seasons.js";

const ep = (season, episode) => ({ season, episode });

describe("episodesInSeason", () => {
    test("counts by the highest episode number in that season", () => {
        expect(episodesInSeason([ep(1, 1), ep(1, 8), ep(1, 3), ep(2, 12)], 1)).toBe(8);
    });

    test("ignores other seasons", () => {
        expect(episodesInSeason([ep(2, 12)], 1)).toBeUndefined();
    });

    test("ignores season packs listed with no episode number", () => {
        expect(episodesInSeason([ep(1, 0)], 1)).toBeUndefined();
    });

    test("tolerates a missing or malformed list", () => {
        expect(episodesInSeason(undefined, 1)).toBeUndefined();
        expect(episodesInSeason([null, {}, ep(1, 4)], 1)).toBe(4);
    });

    test("needs a real season number", () => {
        expect(episodesInSeason([ep(1, 4)], NaN)).toBeUndefined();
    });
});
