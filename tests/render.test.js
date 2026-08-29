import {
    groupEpisodes,
    renderMovieTable,
    renderSeriesTable,
    renderLinks,
    renderMessage,
    renderStatus,
    formatAge,
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

    test("labels the season control and lists the episode number", () => {
        const el = renderSeriesTable([episode({ season: 3, episode: 7 })], ICON);
        expect(el.querySelector(".its-season-label").textContent).toBe("Season");
        expect(el.querySelector("option").textContent).toBe("3 — 1 episode");
        expect(el.querySelector("select").getAttribute("aria-label")).toBe("Season");
        expect(el.querySelector("tbody").textContent).toContain("7");
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

describe("formatAge", () => {
    test.each([
        [0, "just now"],
        [30 * 1000, "just now"],
        [60 * 1000, "1 minute ago"],
        [5 * 60 * 1000, "5 minutes ago"],
        [60 * 60 * 1000, "1 hour ago"],
        [3 * 60 * 60 * 1000, "3 hours ago"],
        [26 * 60 * 60 * 1000, "1 day ago"],
        [72 * 60 * 60 * 1000, "3 days ago"],
    ])("renders %ims as %s", (ms, expected) => {
        expect(formatAge(ms)).toBe(expected);
    });

    test("treats a negative age from a clock change as just now", () => {
        expect(formatAge(-5000)).toBe("just now");
    });
});

describe("renderStatus", () => {
    test("marks an updating status with a spinner hook", () => {
        const el = renderStatus("Updating…", "updating");
        expect(el.textContent).toContain("Updating…");
        expect(el.dataset.tone).toBe("updating");
    });

    test("escapes its text", () => {
        const el = renderStatus("<b>x</b>", "info");
        expect(el.querySelectorAll("b")).toHaveLength(0);
        expect(el.textContent).toBe("<b>x</b>");
    });

    test("renders nothing visible for an empty message", () => {
        expect(renderStatus("", "info").textContent).toBe("");
    });
});

describe("season selector", () => {
    const manySeasons = () => [
        episode({ season: 1, episode: 1, title: "S01E01 720p", magnet: "magnet:?xt=urn:btih:a" }),
        episode({ season: 1, episode: 2, title: "S01E02 720p", magnet: "magnet:?xt=urn:btih:b" }),
        episode({ season: 2, episode: 1, title: "S02E01 1080p", magnet: "magnet:?xt=urn:btih:c" }),
        episode({ season: 10, episode: 1, title: "S10E01 2160p", magnet: "magnet:?xt=urn:btih:d" }),
    ];

    test("renders one option per season, numerically ordered", () => {
        const el = renderSeriesTable(manySeasons(), ICON);
        const options = [...el.querySelectorAll("option")].map((o) => o.value);
        expect(options).toEqual(["1", "2", "10"]);
    });

    test("defaults to the latest season", () => {
        const el = renderSeriesTable(manySeasons(), ICON);
        expect(el.querySelector("select").value).toBe("10");
        expect(el.querySelector("tbody").textContent).toContain("S10E01");
        expect(el.querySelector("tbody").textContent).not.toContain("S01E01");
    });

    test("shows only the selected season, not every episode at once", () => {
        const el = renderSeriesTable(manySeasons(), ICON);
        // 1 header row + 1 episode row for season 10
        expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
    });

    test("switching the select repaints the table", () => {
        const el = renderSeriesTable(manySeasons(), ICON);
        const select = el.querySelector("select");

        select.value = "1";
        select.dispatchEvent(new Event("change"));

        const body = el.querySelector("tbody").textContent;
        expect(body).toContain("S01E01");
        expect(body).toContain("S01E02");
        expect(body).not.toContain("S10E01");
        expect(el.querySelectorAll("tbody tr")).toHaveLength(3); // header + 2 episodes
    });

    test("honours an explicit defaultSeason when it exists", () => {
        const el = renderSeriesTable(manySeasons(), { ...ICON, defaultSeason: 2 });
        expect(el.querySelector("select").value).toBe("2");
    });

    test("falls back to the latest season when defaultSeason is absent from the data", () => {
        const el = renderSeriesTable(manySeasons(), { ...ICON, defaultSeason: 99 });
        expect(el.querySelector("select").value).toBe("10");
    });

    test("reports the total episode count across all seasons", () => {
        const el = renderSeriesTable(manySeasons(), ICON);
        expect(el.querySelector(".its-total").textContent).toBe("4 episodes across 3 seasons");
    });

    test("a malicious episode title is still inert inside the season view", () => {
        const el = renderSeriesTable([episode({ season: 1, title: '<img src=x onerror="globalThis.PWNED=1">' })], ICON);
        document.body.append(el);
        expect(el.querySelectorAll("img[onerror]")).toHaveLength(0);
        expect(globalThis.PWNED).toBeUndefined();
    });
});

describe("movie download button", () => {
    const movie = (over = {}) => ({
        quality: "1080p",
        size: "2 GB",
        seeds: 10,
        peers: 2,
        magnet: "magnet:?xt=urn:btih:a",
        ...over,
    });

    test("renders a labelled magnet button, not a bare icon", () => {
        const table = renderMovieTable([movie()], ICON);
        const link = table.querySelector("a");
        expect(link.classList.contains("its-button")).toBe(true);
        expect(link.textContent).toContain("Magnet");
        expect(link.querySelector("img")).not.toBeNull();
        expect(link.getAttribute("href")).toBe("magnet:?xt=urn:btih:a");
    });

    test("shows a Source column only when the data carries one", () => {
        const withSource = renderMovieTable([movie({ source: "TorrentGalaxy" })], ICON);
        expect(withSource.textContent).toContain("Source");
        expect(withSource.querySelector(".its-source").textContent).toBe("TorrentGalaxy");

        const without = renderMovieTable([movie()], ICON);
        expect(without.textContent).not.toContain("Source");
    });

    test("omits the peers half when the source reports seeders only", () => {
        const table = renderMovieTable([movie({ peers: 0 })], ICON);
        expect(table.querySelectorAll(".its-peers")).toHaveLength(0);
        expect(table.querySelector(".its-seeds").textContent).toBe("10");
    });

    test("a malicious source label stays inert", () => {
        const table = renderMovieTable([movie({ source: '<img src=x onerror="globalThis.PWNED=1">' })], ICON);
        document.body.append(table);
        expect(table.querySelectorAll("img[onerror]")).toHaveLength(0);
        expect(globalThis.PWNED).toBeUndefined();
    });
});
