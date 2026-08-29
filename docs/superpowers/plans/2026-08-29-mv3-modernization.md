# Manifest V3 Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the IMDB Torrent Search extension to Manifest V3 on a buildable modern toolchain, fixing the correctness and security defects found in the existing code, with a Jest suite covering every pure module.

**Architecture:** Three esbuild bundles (service worker, content script, popup) built from feature folders under `src/`. Every module except the three entry points is pure — no `chrome.*` at import time — so the whole codebase is unit-testable under jsdom. Network access moves from axios to `fetch` behind a single `fetchJson` helper. All rendering moves from `innerHTML` string interpolation to `createElement`/`textContent`.

**Tech Stack:** esbuild, sass (dart-sass), Jest + jsdom, archiver. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-mv3-modernization-design.md`

## Global Constraints

- Node >= 20. Development machine is Node 26.
- **Zero runtime dependencies.** jQuery, Materialize, axios, babel-polyfill and loglevel are all removed. `dependencies` in `package.json` must end up empty; everything is a `devDependency`.
- No remote scripts or stylesheets anywhere in `extension/`. MV3 CSP forbids them. This includes the Google Fonts `<link>` tags in `popup.html`.
- `chrome.extension.getURL` is removed in MV3 — always `chrome.runtime.getURL`.
- Every module under `src/shared/`, `src/background/http.js`, `src/background/providers/`, `src/content/imdb-page.js` and `src/content/render.js` must import cleanly in plain Node with no `chrome` global defined. Entry points (`service-worker.js`, `content/index.js`, `popup/index.js`) are exempt.
- ES modules throughout (`"type": "module"` in `package.json`, `import`/`export` in `src/`).
- The extension version is the single value in `package.json`; `extension/manifest.json` receives it at build time.
- Built output lives in `extension/build/` and is gitignored.
- Every user-controlled or API-supplied string reaching the DOM goes through `textContent` or an attribute setter, never `innerHTML`.
- URL scheme allow-list is exactly `http:`, `https:`, `magnet:`.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `scripts/build.mjs` | esbuild + sass build, `--watch` flag, manifest version injection |
| `scripts/release.mjs` | Zip `extension/` into `releases/` |
| `jest.config.mjs` | jsdom environment, coverage paths |
| `src/shared/logger.js` | Level-gated console wrapper |
| `src/shared/messages.js` | Message type constants, `ok`/`fail` envelope, `sendMessage` |
| `src/shared/storage.js` | Promise wrappers over `chrome.storage.local` with defaults |
| `src/shared/urls.js` | `isSafeUrl`, `expandTemplate` |
| `src/shared/links.js` | `SEARCH_SITES` catalogue, `buildSearchLinks` |
| `src/background/http.js` | `fetchJson` — timeout, retry, status checking |
| `src/background/providers/yts.js` | `fetchMovieTorrents`, base-URL fallback |
| `src/background/providers/eztv.js` | `fetchSeriesTorrents`, `parseQuality`, pagination cap |
| `src/background/service-worker.js` | `chrome.runtime.onMessage` router |
| `src/content/imdb-page.js` | `readImdbId`, `readPageInfo` (JSON-LD then DOM) |
| `src/content/render.js` | `groupEpisodes`, `renderMovieTable`, `renderSeriesTable`, `renderLinks` |
| `src/content/index.js` | Mount, SPA re-mount, toggle wiring |
| `src/popup/index.js` | Settings UI |
| `src/styles/content.scss` | Injected-panel styles |
| `src/styles/popup.scss` | Hand-written popup styles |
| `tests/*.test.js` | One file per pure module, plus `manifest.test.js` |
| `tests/fixtures/*.html` | Saved IMDb markup |

**Modified:** `package.json`, `.gitignore`, `extension/manifest.json`, `extension/popup.html`, `README.md`

**Deleted:** `webpack.config.js`, `.babelrc`, `build.js`, `src/background.js`, `src/content.js`, `src/popup.js`, `src/Helpers/`, `src/scss/`, `extension/js/script.js`, `yarn.lock`

---

## Task 1: Toolchain foundation

**Files:**
- Modify: `package.json` (full rewrite)
- Create: `jest.config.mjs`, `scripts/build.mjs`
- Modify: `.gitignore`
- Delete: `webpack.config.js`, `.babelrc`, `build.js`, `yarn.lock`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` writes `extension/build/{service-worker,content,popup}.js` plus `extension/build/{content,popup}.css`. `npm test` runs Jest. `npm run build -- --watch` rebuilds on change.

- [ ] **Step 1: Write the failing smoke test**

`tests/smoke.test.js`:

```js
import { readFileSync } from "node:fs";

test("package.json declares no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.type).toBe("module");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/smoke.test.js`
Expected: FAIL — jest is not installed yet.

- [ ] **Step 3: Rewrite `package.json`**

```json
{
    "name": "imdb-torrent-search",
    "version": "2.0.0",
    "description": "Displays torrents for IMDB movies and series directly on the page",
    "type": "module",
    "private": true,
    "engines": { "node": ">=20" },
    "scripts": {
        "build": "node scripts/build.mjs",
        "dev": "node scripts/build.mjs --watch --dev",
        "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
        "format": "prettier --tab-width 4 --print-width 120 --write \"{src,scripts,tests}/**/*.{js,mjs,scss}\"",
        "release": "npm run build && node scripts/release.mjs"
    },
    "devDependencies": {
        "archiver": "^7.0.1",
        "esbuild": "^0.25.0",
        "jest": "^29.7.0",
        "jest-environment-jsdom": "^29.7.0",
        "prettier": "^3.4.2",
        "sass": "^1.83.0"
    }
}
```

Note the `test` script: Jest needs `--experimental-vm-modules` to run native ESM.

- [ ] **Step 4: Create `jest.config.mjs`**

```js
export default {
    testEnvironment: "jsdom",
    testMatch: ["**/tests/**/*.test.js"],
    transform: {},
    collectCoverageFrom: ["src/**/*.js", "!src/**/index.js", "!src/background/service-worker.js"],
};
```

`transform: {}` disables Babel entirely — Node runs the ESM directly.

- [ ] **Step 5: Create `scripts/build.mjs`**

```js
import { build, context } from "esbuild";
import * as sass from "sass";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = path.join(root, "extension", "build");
const watch = process.argv.includes("--watch");
const dev = process.argv.includes("--dev");

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const jsOptions = {
    entryPoints: {
        "service-worker": path.join(root, "src/background/service-worker.js"),
        content: path.join(root, "src/content/index.js"),
        popup: path.join(root, "src/popup/index.js"),
    },
    outdir,
    bundle: true,
    format: "esm",
    target: ["chrome110"],
    sourcemap: dev ? "inline" : false,
    minify: !dev,
    logLevel: "info",
    define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
};

const styles = [
    ["src/styles/content.scss", "content.css"],
    ["src/styles/popup.scss", "popup.css"],
];

async function buildStyles() {
    await mkdir(outdir, { recursive: true });
    for (const [from, to] of styles) {
        const result = sass.compile(path.join(root, from), { style: dev ? "expanded" : "compressed" });
        await writeFile(path.join(outdir, to), result.css);
    }
}

async function syncManifestVersion() {
    const file = path.join(root, "extension", "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    if (manifest.version !== pkg.version) {
        manifest.version = pkg.version;
        await writeFile(file, JSON.stringify(manifest, null, 4) + "\n");
    }
}

await syncManifestVersion();
await buildStyles();

if (watch) {
    const ctx = await context(jsOptions);
    await ctx.watch();
    console.log("watching…");
} else {
    await build(jsOptions);
}
```

- [ ] **Step 6: Update `.gitignore`**

Append:

```
node_modules
extension/build
releases/*.zip
coverage
```

- [ ] **Step 7: Delete the dead toolchain**

```bash
git rm -f webpack.config.js .babelrc build.js yarn.lock
```

- [ ] **Step 8: Install and verify**

Run: `npm install && npm test`
Expected: `smoke.test.js` PASSES.

The build cannot run yet — no `src/` entry points exist. That is Task 2's problem.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "build: replace webpack 2/babel 6 toolchain with esbuild and jest"
```

---

## Task 2: Shared utilities

**Files:**
- Create: `src/shared/logger.js`, `src/shared/urls.js`, `src/shared/messages.js`, `src/shared/storage.js`
- Test: `tests/urls.test.js`, `tests/storage.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `logger.debug(...args)`, `logger.warn(...args)`, `logger.error(...args)` — default export `logger`.
  - `isSafeUrl(value: string): boolean` — true only for `http:`, `https:`, `magnet:`.
  - `expandTemplate(template: string, vars: {name: string, year: string, imdbID: string}): string` — replaces every occurrence of `${name}`, `${year}`, `${imdbID}`.
  - `MESSAGE_TYPES = { MOVIE: "movie", SERIES: "series" }`
  - `ok(data): {ok: true, data}` / `fail(error): {ok: false, error: string}`
  - `sendMessage(payload): Promise<any>` — resolves `data`, rejects with `Error` on `{ok:false}`.
  - `DEFAULTS = { autoShow: false, displayLinks: true, customUrls: [] }`
  - `getSettings(): Promise<{autoShow, displayLinks, customUrls}>`
  - `setSetting(key, value): Promise<void>`

- [ ] **Step 1: Write the failing URL tests**

`tests/urls.test.js`:

```js
import { isSafeUrl, expandTemplate } from "../src/shared/urls.js";

describe("isSafeUrl", () => {
    test.each([
        "https://example.com/a",
        "http://example.com/a",
        "magnet:?xt=urn:btih:abc",
    ])("accepts %s", (url) => {
        expect(isSafeUrl(url)).toBe(true);
    });

    test.each([
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "  javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "",
        null,
        undefined,
        "not a url",
    ])("rejects %s", (url) => {
        expect(isSafeUrl(url)).toBe(false);
    });
});

describe("expandTemplate", () => {
    const vars = { name: "The%20Matrix", year: "1999", imdbID: "tt0133093" };

    test("replaces each placeholder", () => {
        expect(expandTemplate("https://x.to/s?q=${name}+${year}", vars)).toBe(
            "https://x.to/s?q=The%20Matrix+1999"
        );
    });

    test("replaces every occurrence, not just the first", () => {
        expect(expandTemplate("${imdbID}/${imdbID}", vars)).toBe("tt0133093/tt0133093");
    });

    test("leaves unknown placeholders alone", () => {
        expect(expandTemplate("${nope}", vars)).toBe("${nope}");
    });

    test("treats missing vars as empty string", () => {
        expect(expandTemplate("${year}", { name: "a", imdbID: "b" })).toBe("");
    });
});
```

The "every occurrence" case is a real regression guard: the old
`Helpers/Templates.js` used `.replace(/\$\{name\}/, …)` without the `g` flag,
so a template naming a placeholder twice only ever had the first one filled in.

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- tests/urls.test.js`
Expected: FAIL — cannot find module `../src/shared/urls.js`.

- [ ] **Step 3: Implement `src/shared/urls.js`**

```js
const SAFE_PROTOCOLS = new Set(["http:", "https:", "magnet:"]);

export function isSafeUrl(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    try {
        return SAFE_PROTOCOLS.has(new URL(value.trim()).protocol);
    } catch {
        return false;
    }
}

const PLACEHOLDER = /\$\{(name|year|imdbID)\}/g;

export function expandTemplate(template, vars = {}) {
    if (typeof template !== "string") return "";
    return template.replace(PLACEHOLDER, (_, key) => vars[key] ?? "");
}
```

`new URL("not a url")` throws, which the `catch` turns into `false`. Leading
whitespace is trimmed before parsing so `"  javascript:…"` cannot slip past.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- tests/urls.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `src/shared/logger.js`**

```js
const enabled = process.env.NODE_ENV === "development";

const noop = () => {};

export const logger = {
    debug: enabled ? console.debug.bind(console, "[imdb-torrent-search]") : noop,
    warn: console.warn.bind(console, "[imdb-torrent-search]"),
    error: console.error.bind(console, "[imdb-torrent-search]"),
};

export default logger;
```

esbuild's `define` replaces `process.env.NODE_ENV` at build time, so `enabled`
folds to a constant and the debug calls are dropped from production bundles.
Under Jest, `process` genuinely exists, so this works untransformed.

- [ ] **Step 6: Implement `src/shared/messages.js`**

```js
export const MESSAGE_TYPES = { MOVIE: "movie", SERIES: "series" };

export function ok(data) {
    return { ok: true, data };
}

export function fail(error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function sendMessage(payload) {
    const response = await chrome.runtime.sendMessage(payload);
    if (!response) throw new Error("No response from background service worker");
    if (!response.ok) throw new Error(response.error || "Unknown background error");
    return response.data;
}
```

`sendMessage` is the fix for the silent-hang defect: a missing or failed
response now throws where the caller can render an error, instead of
`response.data` throwing `TypeError` inside a promise executor.

- [ ] **Step 7: Write the failing storage tests**

`tests/storage.test.js`:

```js
import { jest } from "@jest/globals";
import { DEFAULTS, getSettings, setSetting } from "../src/shared/storage.js";

function mockStorage(initial = {}) {
    let store = { ...initial };
    global.chrome = {
        storage: {
            local: {
                get: jest.fn(async (keys) =>
                    Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))
                ),
                set: jest.fn(async (obj) => {
                    store = { ...store, ...obj };
                }),
            },
        },
    };
    return () => store;
}

afterEach(() => {
    delete global.chrome;
});

test("returns defaults for a first-run user", async () => {
    mockStorage({});
    await expect(getSettings()).resolves.toEqual(DEFAULTS);
});

test("displayLinks defaults to true, autoShow to false", () => {
    expect(DEFAULTS.displayLinks).toBe(true);
    expect(DEFAULTS.autoShow).toBe(false);
});

test("stored values override defaults", async () => {
    mockStorage({ autoShow: true, customUrls: [{ urlTemplate: "https://x.to/${name}" }] });
    const settings = await getSettings();
    expect(settings.autoShow).toBe(true);
    expect(settings.displayLinks).toBe(true);
    expect(settings.customUrls).toHaveLength(1);
});

test("drops null entries left by the old splice-based removal", async () => {
    mockStorage({ customUrls: [null, { urlTemplate: "https://x.to/${name}" }, null] });
    await expect(getSettings()).resolves.toMatchObject({ customUrls: [{ urlTemplate: "https://x.to/${name}" }] });
});

test("coerces a non-array customUrls to the default", async () => {
    mockStorage({ customUrls: "corrupt" });
    await expect(getSettings()).resolves.toMatchObject({ customUrls: [] });
});

test("setSetting writes a single key", async () => {
    const read = mockStorage({});
    await setSetting("autoShow", true);
    expect(read().autoShow).toBe(true);
});
```

- [ ] **Step 8: Run and watch it fail**

Run: `npm test -- tests/storage.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 9: Implement `src/shared/storage.js`**

```js
export const DEFAULTS = Object.freeze({
    autoShow: false,
    displayLinks: true,
    customUrls: [],
});

const KEYS = Object.keys(DEFAULTS);

export async function getSettings() {
    const stored = (await chrome.storage.local.get(KEYS)) ?? {};
    const customUrls = Array.isArray(stored.customUrls)
        ? stored.customUrls.filter((entry) => entry && typeof entry.urlTemplate === "string")
        : DEFAULTS.customUrls;

    return {
        autoShow: stored.autoShow ?? DEFAULTS.autoShow,
        displayLinks: stored.displayLinks ?? DEFAULTS.displayLinks,
        customUrls,
    };
}

export async function setSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
}
```

Filtering null entries matters: the old popup used `customUrls.splice()` after
an earlier version used `delete customUrls[key]`, so existing users can have
sparse arrays with `null` holes in storage. The old `Templates.js` guarded this
with an inline `if (customUrl === null) return;`; centralising it here means
every consumer gets the guard.

- [ ] **Step 10: Run and watch it pass**

Run: `npm test -- tests/storage.test.js tests/urls.test.js`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/shared tests/urls.test.js tests/storage.test.js
git commit -m "feat: add shared logger, url, message and storage modules"
```

---

## Task 3: HTTP helper

**Files:** Create `src/background/http.js`; Test `tests/http.test.js`

**Interfaces:**
- Produces: `fetchJson(url, {fetchImpl = fetch, timeoutMs = 15000, retries = 1} = {}): Promise<any>`.
  Throws `Error` with a message containing the status on non-2xx. Retries only
  on network rejection and 5xx, never on 4xx.

Steps: write `tests/http.test.js` covering (a) returns parsed JSON on 200,
(b) throws `HTTP 404` and does **not** retry, (c) retries once then succeeds
after a network rejection, (d) gives up after `retries` exhausted, (e) passes an
`AbortSignal` to `fetchImpl`. Run it, watch it fail, implement, watch it pass,
commit as `feat: add fetchJson helper with timeout and bounded retry`.

Implementation shape:

```js
export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 15000, retries = 1 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, { signal: controller.signal, credentials: "omit" });
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status} for ${url}`);
                if (response.status < 500) throw Object.assign(error, { retryable: false });
                throw Object.assign(error, { retryable: true });
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (error.retryable === false) throw error;
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError;
}
```

---

## Task 4: YTS provider

**Files:** Create `src/background/providers/yts.js`; Test `tests/yts.test.js`

**Interfaces:**
- Consumes: `fetchJson` from Task 3.
- Produces: `YTS_BASES: string[]`, `fetchMovieTorrents(imdbID, {fetchJsonImpl} = {}): Promise<MovieTorrent[]>`
  where `MovieTorrent = {quality: string, type: string, size: string, sizeBytes: number, seeds: number, peers: number, magnet: string}`.

Behaviour: try each base URL in order until one resolves; normalise
`data.movies[0].torrents`; return `[]` when `movie_count` is 0 or `movies` is
absent; build a magnet URI from `hash` when the API returns a `.torrent` `url`
rather than a magnet; sort descending by numeric quality.

Tests: happy path normalisation, empty result, falls through to the second base
after the first rejects, throws when every base fails, quality sort order,
magnet construction from hash.

Commit: `feat: add YTS movie provider with base-url fallback`.

---

## Task 5: EZTV provider

**Files:** Create `src/background/providers/eztv.js`; Test `tests/eztv.test.js`

**Interfaces:**
- Produces: `parseQuality(title: string): string|null`,
  `MAX_PAGES = 20`,
  `fetchSeriesTorrents(imdbID, {fetchJsonImpl, maxPages} = {}): Promise<EpisodeTorrent[]>`
  where `EpisodeTorrent = {season: number, episode: number, title: string, quality: string|null, magnet: string, seeds: number, peers: number, sizeBytes: number}`.

Behaviour: strip leading letters from the IMDb ID (`tt0944947` → `0944947`);
request `https://eztvx.to/api/get-torrents?limit=100&imdb_id=…&page=N`;
keep paging while a page returns exactly 100 rows; stop at `MAX_PAGES`;
coerce the string `season`/`episode` fields to numbers.

Tests: single page, three-page pagination, **stops at `MAX_PAGES` when the API
always returns 100** (the unbounded-recursion regression guard), empty result,
propagates the error from `fetchJson`, `parseQuality` across `720p`/`1080p`/
`2160p`/`4K`/no-match, numeric coercion of season and episode.

Commit: `feat: add EZTV series provider with capped pagination`.

---

## Task 6: Service worker

**Files:** Create `src/background/service-worker.js`

**Interfaces:**
- Consumes: `MESSAGE_TYPES`, `ok`, `fail`, both providers.
- Produces: the `chrome.runtime.onMessage` listener.

```js
import { MESSAGE_TYPES, ok, fail } from "../shared/messages.js";
import { fetchMovieTorrents } from "./providers/yts.js";
import { fetchSeriesTorrents } from "./providers/eztv.js";
import logger from "../shared/logger.js";

async function handle(request) {
    if (!request || typeof request.imdbID !== "string") throw new Error("Malformed request");
    if (request.type === MESSAGE_TYPES.MOVIE) return fetchMovieTorrents(request.imdbID);
    if (request.type === MESSAGE_TYPES.SERIES) return fetchSeriesTorrents(request.imdbID);
    throw new Error(`Unknown request type: ${request.type}`);
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    handle(request)
        .then((data) => sendResponse(ok(data)))
        .catch((error) => {
            logger.error(error);
            sendResponse(fail(error));
        });
    return true;
});
```

`sendResponse` is now called on every path — the fix for the silent hang.
No test file: this is an entry point and is exempt per the global constraints.

Commit: `feat: replace background page with MV3 service worker`.

---

## Task 7: IMDb page reader

**Files:** Create `src/content/imdb-page.js`; Test `tests/imdb-page.test.js`, `tests/fixtures/{movie,series,no-jsonld}.html`

**Interfaces:**
- Produces: `readImdbId(pathname: string): string|null`,
  `readPageInfo(doc: Document): {title: string, year: string, type: "movie"|"series"}`.

`readImdbId` returns `null` rather than throwing on a non-title path — the
crash fix. `readPageInfo` parses `application/ld+json` first, mapping `@type`
`TVSeries`/`TVMiniSeries`/`TVEpisode` to `"series"` and everything else to
`"movie"`, taking `name` and the leading four digits of `datePublished`.
On missing or unparseable JSON-LD it falls back to
`[data-testid="hero__pageTitle"], [data-testid="hero__primary-text"], h1` for
the title and scans `[data-testid="hero__pageTitle"] ~ ul li` text for a
`TV Series`/`TV Mini Series`/`Episode` marker and a four-digit year.

Tests: movie fixture, series fixture, no-JSON-LD fixture exercising the DOM
fallback, malformed JSON-LD falling back rather than throwing, `readImdbId`
returning null for `/`, `/chart/top/`, and a value for `/title/tt0111161/`.

Commit: `feat: read IMDb metadata from JSON-LD with DOM fallback`.

---

## Task 8: Renderer

**Files:** Create `src/content/render.js`; Test `tests/render.test.js`

**Interfaces:**
- Consumes: `isSafeUrl` (Task 2), the torrent record shapes (Tasks 4-5).
- Produces: `groupEpisodes(list: EpisodeTorrent[]): Season[]`,
  `renderMovieTable(torrents, {magnetIcon}): HTMLElement`,
  `renderSeriesTable(torrents, {magnetIcon}): HTMLElement`,
  `renderLinks(sites: {label, url, iconUrl?}[]): HTMLElement`,
  `renderMessage(text: string): HTMLElement`.

Every node is built with `createElement`; every string set with `textContent`;
every URL passes `isSafeUrl` before becoming an `href` or `src`, and the link is
omitted entirely when it does not. `groupEpisodes` sorts seasons and episodes
numerically ascending and drops episodes with no usable torrent.

**The security tests are the point of this task:**

```js
test("an episode title containing markup is inert", () => {
    const table = renderSeriesTable(
        [{ season: 1, episode: 1, title: '<img src=x onerror="globalThis.PWNED=1">', quality: "1080p",
           magnet: "magnet:?xt=urn:btih:a", seeds: 1, peers: 0, sizeBytes: 1 }],
        { magnetIcon: "chrome-extension://x/img/icon-magnet.gif" }
    );
    expect(table.querySelectorAll("img[onerror]")).toHaveLength(0);
    expect(table.textContent).toContain('<img src=x onerror="globalThis.PWNED=1">');
});

test("a javascript: custom link is dropped", () => {
    const el = renderLinks([{ label: "evil", url: "javascript:alert(1)" }]);
    expect(el.querySelectorAll("a")).toHaveLength(0);
});

test("a custom icon url with an attribute break is dropped", () => {
    const el = renderLinks([{ label: "x", url: "https://ok.example", iconUrl: 'x" onerror="globalThis.PWNED=1' }]);
    expect(el.querySelectorAll("img[onerror]")).toHaveLength(0);
});
```

Plus: empty-state messages for both tables, numeric season/episode ordering,
movie rows ordered by quality.

Commit: `fix: build result tables via DOM nodes instead of innerHTML`.

---

## Task 9: Search links catalogue

**Files:** Create `src/shared/links.js`; Test `tests/links.test.js`

**Interfaces:**
- Consumes: `expandTemplate`, `isSafeUrl`.
- Produces: `SEARCH_SITES: {id, label, build({encodedTitle, year, imdbID}): string}[]`,
  `buildSearchLinks(info, customUrls): {label, url, iconUrl?}[]`.

Dead sites (`rarbg.to`, `extratorrent`, `ibit.to`, `aiosearch.com`) are removed.
Retained and corrected: The Pirate Bay at `https://thepiratebay.org/search.php?q=…`
(the `/search/<term>/0/99/0` path form no longer resolves), 1337x at
`https://1337x.to/search/<term>/1/`. Added: YTS `https://yts.mx/browse-movies/<term>`
and EZTV `https://eztvx.to/search/<term>`.

Links render as text-labelled pills, with an `<img>` only when an icon is
available. This removes the dependency on bundled favicon files for the new
sites — and drops the `img/torrents-favicon.png` reference that names a file
which does not exist on disk.

Tests: each built URL, custom template expansion, a custom entry with a
`javascript:` template being excluded, null entries tolerated.

Commit: `feat: prune dead torrent sites and rebuild the link catalogue`.

---

## Task 10: Content entry point

**Files:** Create `src/content/index.js`, `src/styles/content.scss`; Delete `src/content.js`, `src/scss/`, `src/Helpers/`

Mounts an icon next to the IMDb title, appends a panel container, wires the
toggle, reads settings via `getSettings()`, auto-opens when `autoShow`, and
requests data through `sendMessage`. Renders `renderMessage(error.message)` when
`sendMessage` rejects — the visible half of the silent-hang fix.

SPA handling: keep the last seen `location.pathname`; on change, tear down the
mounted nodes and re-mount. Driven by a `MutationObserver` on `document.body`
plus a `popstate` listener, both funnelling into one debounced `syncToPage()`.
Mount is idempotent — it checks for an existing `#imdb-torrent-search-icon`
before inserting.

Commit: `feat: rewrite content script without jQuery and handle SPA navigation`.

---

## Task 11: Popup

**Files:** Create `src/popup/index.js`, `src/styles/popup.scss`; Modify `extension/popup.html`; Delete `src/popup.js`, `extension/js/script.js`

`popup.html` loses both CDN `<script>` tags, both Google Fonts `<link>` tags and
`./js/script.js`, keeping only `./build/popup.css` and a single
`<script type="module" src="./build/popup.js">`. Materialize classes are replaced
with hand-written styles using a system font stack. `Materialize.toast` becomes a
small local `showToast(message, tone)` writing into a `<div class="toast-host">`.

Commit: `feat: rewrite popup without jQuery or Materialize`.

---

## Task 12: Manifest V3 and its test

**Files:** Modify `extension/manifest.json`; Test `tests/manifest.test.js`

Final manifest: `manifest_version: 3`; `background.service_worker` =
`build/service-worker.js` with `"type": "module"`; `action` replacing
`browser_action` and carrying the full `default_icon` map; `permissions:
["storage"]`; `host_permissions` for `https://yts.mx/*`,
`https://movies-api.accel.li/*`, `https://eztvx.to/*` and `https://eztv.re/*`
(kept so the 301 can be followed); `web_accessible_resources` in object form
scoped to `matches: ["https://*.imdb.com/*"]`; `content_security_policy:
{"extension_pages": "script-src 'self'; object-src 'self'"}`; content script
matching `https://*.imdb.com/title/*`.

`tests/manifest.test.js` asserts the MV3 shape, that no `browser_action` or
top-level `content_security_policy` string survives, that host permissions
contain no `http://`, and — the check that catches the missing-favicon defect —
that **every path the manifest references exists on disk**, skipping
`build/*` when the extension has not been built.

Commit: `feat: migrate manifest to v3`.

---

## Task 13: Release script, docs, cleanup

**Files:** Create `scripts/release.mjs`; Modify `README.md`; delete any remaining orphans.

`release.mjs` zips `extension/` into `releases/extension_v<version>.zip` using
archiver 7 and `node:fs/promises`, excluding `*.map`. README gains accurate
build/test instructions, the Node floor, and a note that the YTS base URL and
IMDb selectors need a manual smoke check after install.

Final gate: `npm run build && npm test` both clean, and `git status` shows no
stray files.

Commit: `chore: modernize release script and README`.
