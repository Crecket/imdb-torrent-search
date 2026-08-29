import {
    groupEpisodes,
    renderMovieTable,
    renderSeriesTable,
    renderLinks,
    renderMessage,
} from "../src/content/render.js";

const ICON = { magnetIcon: "chrome-extension://abc/img/icon-magnet.gif" };

const episode = (over = {}) => ({
    season: 1,
    episode: 1,
    title: "Show S01E01 1080p",
    quality: "1080p",
    magnet: "magnet:?xt=urn:btih:a",
    seeds: 5,
    peers: 1,
    sizeBytes: 1024,
    ...over,
});

afterEach(() => {
    delete globalThis.PWNED;
});

describe("groupEpisodes", () => {
    test("groups by season then episode", () => {
        const seasons = groupEpisodes([
            episode({ season: 2, episode: 1 }),
            episode({ season: 1, episode: 2 }),
            episode({ season: 1, episode: 1 }),
        ]);
        expect(seasons.map((s) => s.season)).toEqual([1, 2]);
        expect(seasons[0].episodes.map((e) => e.episode)).toEqual([1, 2]);
    });

    test("sorts seasons numerically, not lexicographically", () => {
        const seasons = groupEpisodes([episode({ season: 10 }), episode({ season: 2 }), episode({ season: 1 })]);
        expect(seasons.map((s) => s.season)).toEqual([1, 2, 10]);
    });

    test("collects multiple qualities under one episode", () => {
        const seasons = groupEpisodes([
            episode({ quality: "720p", magnet: "magnet:?xt=urn:btih:a" }),
            episode({ quality: "1080p", magnet: "magnet:?xt=urn:btih:b" }),
        ]);
        expect(seasons[0].episodes).toHaveLength(1);
        expect(seasons[0].episodes[0].torrents).toHaveLength(2);
    });

    test("drops torrents with an unsafe magnet", () => {
        const seasons = groupEpisodes([episode({ magnet: "javascript:alert(1)" })]);
        expect(seasons).toEqual([]);
    });
});

describe("renderMovieTable", () => {
    test("renders a row per torrent", () => {
        const table = renderMovieTable(
            [{ quality: "1080p", size: "2 GB", seeds: 10, peers: 2, magnet: "magnet:?xt=urn:btih:a" }],
            ICON,
        );
        expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
        expect(table.textContent).toContain("1080p");
        expect(table.querySelector("a").getAttribute("href")).toBe("magnet:?xt=urn:btih:a");
    });

    test("shows an empty state when there is nothing to list", () => {
        expect(renderMovieTable([], ICON).textContent).toMatch(/no .*torrents/i);
    });

    test("omits the link when the magnet is unsafe", () => {
        const table = renderMovieTable([{ quality: "1080p", magnet: "javascript:alert(1)" }], ICON);
        expect(table.querySelectorAll("a")).toHaveLength(0);
    });
});

describe("renderSeriesTable", () => {
    test("shows an empty state when there is nothing to list", () => {
        expect(renderSeriesTable([], ICON).textContent).toMatch(/no .*torrents/i);
    });

    test("an episode title containing markup is inert", () => {
        const table = renderSeriesTable([episode({ title: '<img src=x onerror="globalThis.PWNED=1">' })], ICON);
        document.body.append(table);
        expect(table.querySelectorAll("img[onerror]")).toHaveLength(0);
        expect(globalThis.PWNED).toBeUndefined();
        expect(table.textContent).toContain('<img src=x onerror="globalThis.PWNED=1">');
    });

    test("renders a season header and the episode number", () => {
        const table = renderSeriesTable([episode({ season: 3, episode: 7 })], ICON);
        expect(table.textContent).toContain("Season 3");
        expect(table.textContent).toContain("7");
    });
});

describe("renderLinks", () => {
    test("renders one anchor per safe site", () => {
        const el = renderLinks([
            { label: "TPB", url: "https://thepiratebay.org/search.php?q=x" },
            { label: "1337x", url: "https://1337x.to/search/x/1/" },
        ]);
        expect(el.querySelectorAll("a")).toHaveLength(2);
    });

    test("a javascript: link is dropped", () => {
        expect(renderLinks([{ label: "evil", url: "javascript:alert(1)" }]).querySelectorAll("a")).toHaveLength(0);
    });

    test("a malicious icon url is dropped without breaking the link", () => {
        const el = renderLinks([{ label: "x", url: "https://ok.example", iconUrl: 'x" onerror="globalThis.PWNED=1' }]);
        document.body.append(el);
        expect(el.querySelectorAll("img[onerror]")).toHaveLength(0);
        expect(globalThis.PWNED).toBeUndefined();
        expect(el.querySelectorAll("a")).toHaveLength(1);
    });

    test("a label containing markup is inert", () => {
        const el = renderLinks([{ label: "<script>globalThis.PWNED=1</script>", url: "https://ok.example" }]);
        document.body.append(el);
        expect(el.querySelectorAll("script")).toHaveLength(0);
        expect(globalThis.PWNED).toBeUndefined();
    });

    test("returns an empty container for an empty list", () => {
        expect(renderLinks([]).querySelectorAll("a")).toHaveLength(0);
    });
});

test("renderMessage escapes its text", () => {
    const el = renderMessage("<b>oops</b>");
    expect(el.querySelectorAll("b")).toHaveLength(0);
    expect(el.textContent).toBe("<b>oops</b>");
});
