import { SEARCH_SITES, buildSearchLinks } from "../src/shared/links.js";

const info = { title: "The Matrix", year: "1999", imdbID: "tt0133093" };

describe("SEARCH_SITES", () => {
    test("contains no site that has shut down", () => {
        const urls = SEARCH_SITES.map((site) => site.build({ encodedTitle: "x", year: "1", imdbID: "tt1" })).join(" ");
        for (const dead of ["rarbg", "extratorrent", "ibit.to", "aiosearch"]) {
            expect(urls).not.toContain(dead);
        }
    });

    test("every built url is https", () => {
        for (const site of SEARCH_SITES) {
            expect(site.build({ encodedTitle: "x", year: "1999", imdbID: "tt1" })).toMatch(/^https:\/\//);
        }
    });

    test("uses the current piratebay search path", () => {
        const tpb = SEARCH_SITES.find((site) => site.id === "tpb");
        expect(tpb.build({ encodedTitle: "The%20Matrix", year: "1999", imdbID: "tt0133093" })).toBe(
            "https://thepiratebay.org/search.php?q=The%20Matrix%201999"
        );
    });

    test("every site has a unique id and a label", () => {
        const ids = SEARCH_SITES.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const site of SEARCH_SITES) expect(site.label).toBeTruthy();
    });
});

describe("buildSearchLinks", () => {
    test("returns the built-in sites when there are no custom urls", () => {
        expect(buildSearchLinks(info, [])).toHaveLength(SEARCH_SITES.length);
    });

    test("strips non-alphanumerics from the title before encoding", () => {
        const links = buildSearchLinks({ ...info, title: "Amélie: A Film!" }, []);
        // Only the scheme may contain a colon; the interpolated title must not.
        for (const link of links) {
            const afterScheme = link.url.slice("https://".length);
            expect(afterScheme).not.toContain(":");
            expect(afterScheme).not.toContain("!");
            expect(afterScheme).not.toContain("%C3%A9");
        }
    });

    test("appends an expanded custom template", () => {
        const links = buildSearchLinks(info, [{ urlTemplate: "https://x.to/s?q=${name}+${year}+${imdbID}" }]);
        const custom = links.at(-1);
        expect(custom.url).toBe("https://x.to/s?q=The%20Matrix+1999+tt0133093");
    });

    test("excludes a custom template that expands to a javascript: url", () => {
        const links = buildSearchLinks(info, [{ urlTemplate: "javascript:alert('${name}')" }]);
        expect(links).toHaveLength(SEARCH_SITES.length);
    });

    test("excludes a custom entry whose icon is unsafe but keeps the link", () => {
        const links = buildSearchLinks(info, [
            { urlTemplate: "https://x.to/${name}", iconUrl: "javascript:alert(1)" },
        ]);
        expect(links.at(-1).url).toContain("https://x.to/");
        expect(links.at(-1).iconUrl).toBeUndefined();
    });

    test("tolerates null and malformed custom entries", () => {
        expect(buildSearchLinks(info, [null, {}, { urlTemplate: 42 }])).toHaveLength(SEARCH_SITES.length);
    });

    test("tolerates a missing customUrls argument", () => {
        expect(buildSearchLinks(info)).toHaveLength(SEARCH_SITES.length);
    });
});
