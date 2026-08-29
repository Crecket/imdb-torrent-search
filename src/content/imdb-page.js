const IMDB_ID = /\/title\/(tt\d{5,10})/;

const SERIES_TYPES = new Set(["TVSeries", "TVMiniSeries", "TVEpisode", "TVSeason"]);

const TITLE_SELECTORS = [
    '[data-testid="hero__primary-text"]',
    '[data-testid="hero__pageTitle"]',
    ".titleBar .title_wrapper h1",
    "h1",
];

/**
 * Extract the IMDb id from a pathname, or null when this is not a title page.
 * The MV2 version indexed the match result directly and threw on every other page.
 */
export function readImdbId(pathname) {
    if (typeof pathname !== "string") return null;
    const match = IMDB_ID.exec(pathname);
    return match ? match[1] : null;
}

function fromJsonLd(doc) {
    for (const node of doc.querySelectorAll('script[type="application/ld+json"]')) {
        let payload;
        try {
            payload = JSON.parse(node.textContent);
        } catch {
            continue; // malformed block: fall through to the next one, then the DOM
        }

        const entries = Array.isArray(payload) ? payload : [payload];
        for (const entry of entries) {
            if (!entry || typeof entry.name !== "string") continue;
            const year = /\d{4}/.exec(entry.datePublished ?? "");
            return {
                title: entry.name.trim(),
                year: year ? year[0] : "",
                type: SERIES_TYPES.has(entry["@type"]) ? "series" : "movie",
            };
        }
    }
    return null;
}

function textOf(doc, selectors) {
    for (const selector of selectors) {
        const node = doc.querySelector(selector);
        if (node && node.textContent.trim()) return node.textContent.trim();
    }
    return "";
}

function fromDom(doc) {
    // Non-breaking spaces are common in the legacy title markup.
    const rawTitle = textOf(doc, TITLE_SELECTORS).replace(/\u00a0/g, " ");
    const title = rawTitle.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();

    const metaNodes = [...doc.querySelectorAll('[data-testid="hero__pageTitle"] ~ ul li, .titleBar .subtext')];
    const metaText = metaNodes.map((node) => node.textContent).join(" ");

    const type = /\b(TV Series|TV Mini[- ]Series|TV Episode|Episode)\b/i.test(metaText) ? "series" : "movie";
    const year = /\b((?:19|20)\d{2})\b/.exec(metaText);

    return { title, year: year ? year[1] : "", type };
}

/**
 * Highest season number the IMDb page mentions, or undefined.
 *
 * Used to offer seasons the torrent index has no episodes for, which may still
 * have a whole-season pack. Every source here is optional and the function
 * returns undefined rather than guessing, so a markup change degrades to the
 * previous behaviour instead of inventing seasons.
 */
export function readSeasonCount(doc) {
    const numbers = [];

    for (const option of doc.querySelectorAll(
        '#browse-episodes-season option, [data-testid="episodes-browse-episodes"] option',
    )) {
        const value = Number(option.getAttribute("value") ?? option.textContent);
        if (Number.isInteger(value)) numbers.push(value);
    }

    for (const anchor of doc.querySelectorAll('a[href*="season="]')) {
        const match = /[?&]season=(\d{1,3})\b/.exec(anchor.getAttribute("href") ?? "");
        if (match) numbers.push(Number(match[1]));
    }

    const highest = Math.max(0, ...numbers.filter((n) => Number.isFinite(n) && n > 0 && n < 200));
    return highest > 0 ? highest : undefined;
}

/**
 * Read title, year and type for the current title page.
 * JSON-LD is authoritative when present; the DOM scrape is the fallback.
 */
export function readPageInfo(doc) {
    return fromJsonLd(doc) ?? fromDom(doc);
}
