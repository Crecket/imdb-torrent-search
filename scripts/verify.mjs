/**
 * Live check for the two things the test suite cannot verify offline:
 * the YTS API bases and IMDb's current markup.
 *
 *   node scripts/verify.mjs [tt0111161] [tt0944947]
 *
 * Exits non-zero if a movie lookup, a series lookup, or the IMDb scrape fails.
 */
import { YTS_BASES, fetchMovieTorrents } from "../src/background/providers/yts.js";
import { fetchSeriesTorrents } from "../src/background/providers/eztv.js";
import { fetchJson } from "../src/background/http.js";
import { readPageInfo } from "../src/content/imdb-page.js";
import { JSDOM } from "jsdom";

const movieId = process.argv[2] ?? "tt0111161";
const seriesId = process.argv[3] ?? "tt0944947";

let failures = 0;

const pass = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
    failures += 1;
    console.log(`  FAIL  ${msg}`);
};

console.log("\nYTS bases");
for (const base of YTS_BASES) {
    const url = `${base}/list_movies.json?query_term=${movieId}`;
    try {
        const payload = await fetchJson(url, { retries: 0, timeoutMs: 20000 });
        pass(`${base} — movie_count=${payload?.data?.movie_count ?? "?"}`);
    } catch (error) {
        fail(`${base} — ${error.message}`);
    }
}

console.log("\nMovie lookup");
try {
    const torrents = await fetchMovieTorrents(movieId);
    if (torrents.length === 0) fail(`${movieId} returned no torrents`);
    else pass(`${movieId} — ${torrents.length} torrents (${torrents.map((t) => t.quality).join(", ")})`);
} catch (error) {
    fail(`${movieId} — ${error.message}`);
}

console.log("\nSeries lookup");
try {
    const torrents = await fetchSeriesTorrents(seriesId, { maxPages: 1 });
    if (torrents.length === 0) fail(`${seriesId} returned no torrents`);
    else {
        const seasons = new Set(torrents.map((t) => t.season));
        pass(
            `${seriesId} — ${torrents.length} torrents across seasons ${[...seasons].sort((a, b) => a - b).join(", ")}`,
        );
    }
} catch (error) {
    fail(`${seriesId} — ${error.message}`);
}

console.log("\nIMDb markup");
for (const [id, expectedType] of [
    [movieId, "movie"],
    [seriesId, "series"],
]) {
    try {
        const response = await fetch(`https://www.imdb.com/title/${id}/`, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "accept-language": "en-US,en;q=0.9",
            },
        });
        if (!response.ok) {
            fail(`${id} — HTTP ${response.status} (IMDb may be rate limiting; retry or check in a browser)`);
            continue;
        }
        const { window } = new JSDOM(await response.text());
        const info = readPageInfo(window.document);

        if (!info.title) fail(`${id} — no title extracted; selectors need updating`);
        else if (!info.year) fail(`${id} — title "${info.title}" but no year extracted`);
        else if (info.type !== expectedType)
            fail(`${id} — "${info.title}" typed as ${info.type}, expected ${expectedType}`);
        else pass(`${id} — "${info.title}" (${info.year}, ${info.type})`);
    } catch (error) {
        fail(`${id} — ${error.message}`);
    }
}

console.log(failures === 0 ? "\nAll live checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
