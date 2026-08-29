/**
 * Live check for the two things the test suite cannot verify offline:
 * the YTS API bases and IMDb's current markup.
 *
 *   node scripts/verify.mjs [tt0111161] [tt0944947]
 *
 * Exits non-zero only when something is actually broken: a movie or series
 * lookup fails, or no YTS base is reachable at all. A single dead base is a
 * warning — the fallback list exists so one host can disappear. IMDb is
 * reported as skipped, since it serves scripted clients a bot interstitial.
 */
import { YTS_BASES, fetchMovieTorrents } from "../src/background/providers/yts.js";
import { fetchSeriesTorrents } from "../src/background/providers/eztv.js";
import { fetchJson } from "../src/background/http.js";
import { readPageInfo } from "../src/content/imdb-page.js";
import { JSDOM } from "jsdom";

const movieId = process.argv[2] ?? "tt0111161";
const seriesId = process.argv[3] ?? "tt0944947";

let failures = 0;
let skipped = 0;
let warnings = 0;

const pass = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
    failures += 1;
    console.log(`  FAIL  ${msg}`);
};
const skip = (msg) => {
    skipped += 1;
    console.log(`  skip  ${msg}`);
};
const warn = (msg) => {
    warnings += 1;
    console.log(`  warn  ${msg}`);
};

console.log("\nYTS bases");
let reachableBases = 0;
for (const base of YTS_BASES) {
    const url = `${base}/list_movies.json?query_term=${movieId}`;
    try {
        const payload = await fetchJson(url, { retries: 0, timeoutMs: 25000 });
        reachableBases += 1;
        pass(`${base} — movie_count=${payload?.data?.movie_count ?? "?"}`);
    } catch (error) {
        // A dead base is only a warning: the list exists precisely so one host
        // can disappear without breaking lookups. Losing all of them is fatal,
        // and the movie lookup below is what actually proves it.
        warn(`${base} — ${error.message}`);
    }
}
if (reachableBases === 0) fail("no YTS base is reachable");

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
        const html = await response.text();

        // IMDb answers scripted clients with a bot interstitial: a 202 (or 403)
        // carrying a near-empty body with none of the real page markers. Treat
        // that as "cannot check from here", never as a selector failure — a
        // false negative here is worse than no check at all.
        const isInterstitial =
            response.status === 202 ||
            response.status === 403 ||
            (html.length < 20000 && !html.includes("application/ld+json") && !html.includes("hero__pageTitle"));

        if (isInterstitial) {
            skip(`${id} — IMDb served a bot interstitial (HTTP ${response.status}, ${html.length} bytes)`);
            continue;
        }

        if (!response.ok) {
            skip(`${id} — HTTP ${response.status}; check in the browser instead`);
            continue;
        }

        const { window } = new JSDOM(html);
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

if (skipped > 0) {
    console.log(
        "\n  IMDb blocks scripted requests, so its markup can only be checked in a real\n" +
            "  browser. Open an IMDb title page and paste scripts/diagnose-in-console.js\n" +
            "  into that page's console to verify extraction there.",
    );
}

const notes = [warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}` : null, skipped ? `${skipped} skipped` : null]
    .filter(Boolean)
    .join(", ");

console.log(
    failures === 0
        ? `\nAll live checks passed${notes ? ` (${notes})` : ""}.\n`
        : `\n${failures} check(s) failed${notes ? `, ${notes}` : ""}.\n`,
);
process.exit(failures === 0 ? 0 : 1);
