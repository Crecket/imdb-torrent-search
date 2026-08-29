# imdb-torrent-search

A Chrome extension that displays torrents for IMDb movies and series directly on the page.

- **Manifest:** V3
- **Runtime dependencies:** none

## Install

- [Chrome Web Store](https://chrome.google.com/webstore/detail/imdb-torrent-search/kaacflffkmlaiebklgemhmlfbhificko?hl=en)

## Develop

Requires Node 20 or newer.

```bash
npm install
npm run dev     # esbuild watch + sass
```

Then load the unpacked `extension/` folder via `chrome://extensions` with
Developer mode enabled.

```bash
npm test        # jest, jsdom
npm run build   # production bundles into extension/build/
npm run release # zips extension/ into releases/
npm run format  # prettier
```

`extension/build/` is generated and gitignored. `npm run build` also copies the
version from `package.json` into `extension/manifest.json`, so bump the version
in one place only.

## Layout

| Path | Purpose |
|---|---|
| `src/background/` | Service worker and the YTS / EZTV providers |
| `src/content/` | IMDb page reader, renderer, and the injected UI |
| `src/popup/` | Settings UI |
| `src/shared/` | Storage, messaging, URL safety, link catalogue |
| `tests/` | Jest suite; `tests/fixtures/` holds saved IMDb markup |

Everything outside the three entry points (`service-worker.js`,
`content/index.js`, `popup/index.js`) is free of `chrome.*` at import time, so
it runs under jsdom without a browser.

## External services

| Service | Endpoint | Notes |
|---|---|---|
| YTS | `yts.mx`, falling back to `movies-api.accel.li` | Movies. Bases are tried in order |
| EZTV | `eztvx.to` | Series. `eztv.re` 301s here, so both hosts are permitted |
| IMDb | page scrape | JSON-LD first, `data-testid` selectors as fallback |

## After installing

Two things could not be verified in CI and are worth one manual check:

1. **YTS base URL.** The host has moved repeatedly. Open a movie title and
   confirm the table populates; if not, check the service worker console and
   adjust `YTS_BASES` in `src/background/providers/yts.js`.
2. **IMDb markup.** If a title renders with an empty name or year, IMDb has
   changed its layout again — update the selectors in `src/content/imdb-page.js`
   and add a fixture to `tests/fixtures/`.

`scripts/verify.mjs` checks both from the command line:

```bash
node scripts/verify.mjs
```
