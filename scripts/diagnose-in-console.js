/**
 * Browser-side diagnostic. Two parts — run whichever matches your symptom.
 *
 * PART A — connectivity (run in the SERVICE WORKER console):
 *   chrome://extensions -> IMDB Torrent Search -> "service worker" -> Console
 *   Tests the torrent APIs with the extension's real host permissions.
 *
 * PART B — IMDb extraction (run in the PAGE console on an IMDb title page):
 *   Open https://www.imdb.com/title/tt0944947/ -> F12 -> Console
 *   Checks that the title, year and type can still be read from the markup.
 *   This cannot be tested from Node: IMDb serves scripted clients a bot
 *   interstitial instead of the real page.
 */

// ---------------------------------------------------------------- PART A ---
globalThis.checkHosts = async () => {
    const HOSTS = [
        ["YTS  accel.li", "https://movies-api.accel.li/api/v2/list_movies.json?query_term=tt0111161"],
        ["YTS  yts.mx", "https://yts.mx/api/v2/list_movies.json?query_term=tt0111161"],
        ["EZTV eztvx.to", "https://eztvx.to/api/get-torrents?limit=5&imdb_id=0944947&page=1"],
    ];

    console.log("%cConnectivity", "font-weight:bold;font-size:14px");

    for (const [label, url] of HOSTS) {
        const started = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);

        try {
            const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
            const ms = Math.round(performance.now() - started);

            if (!response.ok) {
                console.log(`%c  HTTP ${response.status}  ${label}  (${ms}ms)`, "color:#e5534b");
                continue;
            }

            const body = await response.json();
            const count = body?.data?.movie_count ?? body?.torrents_count ?? "?";
            console.log(`%c  OK        ${label}  (${ms}ms, count=${count})`, "color:#3fb950");
        } catch (error) {
            const ms = Math.round(performance.now() - started);
            const timedOut = error.name === "AbortError";
            console.log(
                `%c  ${timedOut ? "TIMEOUT" : "FAILED "}   ${label}  (${ms}ms) ${timedOut ? "" : error.message}`,
                "color:#e5534b",
            );
        } finally {
            clearTimeout(timer);
        }
    }

    console.log(
        "%cIf EZTV answers but both YTS hosts time out, YTS is blocked on your network\n" +
            "(common with EU ISP torrent-site blocks) rather than broken in the code:\n" +
            "series pages will work and movie pages will not.",
        "color:#8b949e",
    );
};

// ---------------------------------------------------------------- PART B ---
globalThis.checkImdb = () => {
    console.log("%cIMDb extraction", "font-weight:bold;font-size:14px");

    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')];
    console.log(`  ld+json blocks:        ${ld.length}`);

    let parsed = null;
    for (const node of ld) {
        try {
            const entry = JSON.parse(node.textContent);
            if (entry?.name) {
                parsed = entry;
                break;
            }
        } catch {
            /* try the next block */
        }
    }

    console.log(`  ld+json name:          ${parsed?.name ?? "(none)"}`);
    console.log(`  ld+json @type:         ${parsed?.["@type"] ?? "(none)"}`);
    console.log(`  ld+json datePublished: ${parsed?.datePublished ?? "(none)"}`);

    for (const selector of [
        '[data-testid="hero__primary-text"]',
        '[data-testid="hero__pageTitle"]',
        ".titleBar .title_wrapper h1",
        "h1",
    ]) {
        const node = document.querySelector(selector);
        console.log(`  ${selector.padEnd(38)} ${node ? JSON.stringify(node.textContent.trim()) : "(not found)"}`);
    }

    const icon = document.getElementById("imdb-torrent-search-icon");
    const panel = document.getElementById("imdb-torrent-search-panel");
    console.log(`  extension icon mounted: ${Boolean(icon)}`);
    console.log(`  extension panel mounted:${Boolean(panel)}`);
    if (panel) console.log(`  panel text:            ${JSON.stringify(panel.textContent.slice(0, 200))}`);

    if (!parsed?.name) {
        console.log(
            "%c  No usable JSON-LD found — the extension falls back to the DOM selectors\n" +
                "  above. If those are all '(not found)' too, IMDb changed its markup and\n" +
                "  src/content/imdb-page.js needs updating.",
            "color:#d29922",
        );
    }
};

console.log(
    "%cLoaded. Run checkHosts() in the service worker console, or checkImdb() on an IMDb title page.",
    "color:#58a6ff;font-weight:bold",
);
