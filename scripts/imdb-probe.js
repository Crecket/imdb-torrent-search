/**
 * Paste into the console of an IMDb title page and send the output back.
 * Reports exactly what src/content/imdb-page.js relies on, so its selectors
 * can be verified against real markup instead of assumed.
 */
copy(
    JSON.stringify(
        (() => {
            const out = { url: location.pathname };

            const ld = [...document.querySelectorAll('script[type="application/ld+json"]')];
            out.ldBlocks = ld.length;
            for (const node of ld) {
                try {
                    const e = JSON.parse(node.textContent);
                    if (e?.name) {
                        out.ld = { type: e["@type"], name: e.name, datePublished: e.datePublished ?? null };
                        break;
                    }
                } catch {
                    out.ldParseError = true;
                }
            }

            out.titleSelectors = {};
            for (const sel of [
                '[data-testid="hero__primary-text"]',
                '[data-testid="hero__pageTitle"]',
                ".titleBar .title_wrapper h1",
                "h1",
            ]) {
                const n = document.querySelector(sel);
                out.titleSelectors[sel] = n ? n.textContent.trim().slice(0, 80) : null;
            }

            const meta = [...document.querySelectorAll('[data-testid="hero__pageTitle"] ~ ul li, .titleBar .subtext')];
            out.metaCount = meta.length;
            out.metaText = meta
                .map((n) => n.textContent.trim())
                .join(" | ")
                .slice(0, 200);

            const seasonOpts = [
                ...document.querySelectorAll(
                    '#browse-episodes-season option, [data-testid="episodes-browse-episodes"] option',
                ),
            ];
            out.seasonOptionCount = seasonOpts.length;
            out.seasonOptionValues = seasonOpts
                .map((o) => o.getAttribute("value") ?? o.textContent.trim())
                .slice(0, 40);

            const seasonLinks = [...document.querySelectorAll('a[href*="season="]')];
            out.seasonLinkCount = seasonLinks.length;
            out.seasonLinkMax = Math.max(
                0,
                ...seasonLinks.map((a) => Number(/[?&]season=(\d{1,3})\b/.exec(a.getAttribute("href"))?.[1] || 0)),
            );

            out.extensionMounted = {
                icon: !!document.getElementById("imdb-torrent-search-icon"),
                panel: !!document.getElementById("imdb-torrent-search-panel"),
            };

            return out;
        })(),
        null,
        2,
    ),
);
console.log("Copied to clipboard — paste it back.");
