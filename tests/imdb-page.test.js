import { readFileSync } from "node:fs";
import { readImdbId, readPageInfo, readSeasonCount } from "../src/content/imdb-page.js";

const load = (name) => {
    const html = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
    return new DOMParser().parseFromString(html, "text/html");
};

describe("readImdbId", () => {
    test.each([
        ["/title/tt0111161/", "tt0111161"],
        ["/title/tt0944947/episodes?season=1", "tt0944947"],
        ["/title/tt12345678/", "tt12345678"],
    ])("reads %s as %s", (pathname, expected) => {
        expect(readImdbId(pathname)).toBe(expected);
    });

    test.each(["/", "/chart/top/", "/name/nm0000151/", "", "/title/notanid/"])(
        "returns null for %s instead of throwing",
        (pathname) => {
            expect(readImdbId(pathname)).toBeNull();
        },
    );

    test("returns null for a non-string input", () => {
        expect(readImdbId(undefined)).toBeNull();
    });
});

describe("readPageInfo", () => {
    test("reads a movie from JSON-LD", () => {
        expect(readPageInfo(load("movie.html"))).toEqual({
            title: "The Shawshank Redemption",
            year: "1994",
            type: "movie",
        });
    });

    test("reads a series from JSON-LD", () => {
        expect(readPageInfo(load("series.html"))).toEqual({
            title: "Game of Thrones",
            year: "2011",
            type: "series",
        });
    });

    test("falls back to the DOM when there is no JSON-LD", () => {
        expect(readPageInfo(load("no-jsonld.html"))).toEqual({
            title: "Breaking Bad",
            year: "2008",
            type: "series",
        });
    });

    test("falls back rather than throwing on malformed JSON-LD", () => {
        expect(readPageInfo(load("malformed-jsonld.html"))).toEqual({
            title: "Inception",
            year: "2010",
            type: "movie",
        });
    });

    test("still handles the pre-2020 layout", () => {
        const info = readPageInfo(load("legacy.html"));
        expect(info.title).toBe("Old Layout Movie");
        expect(info.year).toBe("1999");
        expect(info.type).toBe("movie");
    });

    test("strips a trailing year from a DOM-derived title", () => {
        const doc = new DOMParser().parseFromString(
            '<h1 data-testid="hero__pageTitle">Some Film (2021)</h1>',
            "text/html",
        );
        expect(readPageInfo(doc).title).toBe("Some Film");
    });

    test("returns empty strings rather than throwing on a bare document", () => {
        const doc = new DOMParser().parseFromString("<p>nothing</p>", "text/html");
        expect(readPageInfo(doc)).toEqual({ title: "", year: "", type: "movie" });
    });
});

describe("readSeasonCount", () => {
    test("reads the highest season from the episode browser and links", () => {
        expect(readSeasonCount(load("series-seasons.html"))).toBe(4);
    });

    test("returns undefined when the page mentions no seasons", () => {
        expect(readSeasonCount(load("movie.html"))).toBeUndefined();
    });

    test("reads a season from a query-string link alone", () => {
        const doc = new DOMParser().parseFromString(
            '<a href="/title/tt1/episodes?season=7">S7</a><a href="/x?season=3">S3</a>',
            "text/html",
        );
        expect(readSeasonCount(doc)).toBe(7);
    });

    test("ignores implausible season numbers", () => {
        const doc = new DOMParser().parseFromString('<a href="/x?season=999">bad</a>', "text/html");
        expect(readSeasonCount(doc)).toBeUndefined();
    });

    test("ignores a season=0 link", () => {
        const doc = new DOMParser().parseFromString('<a href="/x?season=0">specials</a>', "text/html");
        expect(readSeasonCount(doc)).toBeUndefined();
    });
});
