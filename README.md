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
| Torrentio | `torrentio.strem.fun` | Movies, primary. Aggregates many trackers; ~100ms |
| YTS | `movies-api.accel.li`, `yts.mx` | Movies, fallback only. Raced; often slow or timing out |
| EZTV | `eztvx.to` | Series. `eztv.re` 301s here, so both hosts are permitted |
| IMDb | page scrape | JSON-LD first, `data-testid` selectors as fallback |

## After installing

Two things could not be verified in CI and are worth one manual check:

1. **Movie sources.** Run `checkHosts()` in the service worker console.
   Torrentio should answer well under a second; the YTS mirrors are slow and
   often unreachable, which is why they are only a fallback.
2. **IMDb markup.** If a title renders with an empty name or year, IMDb has
   changed its layout again — update the selectors in `src/content/imdb-page.js`
   and add a fixture to `tests/fixtures/`.

`npm run verify` checks the APIs from the command line. Anything needing a real
browser is exposed by the service worker itself - nothing to copy-paste. Open
`chrome://extensions` -> **service worker**:

```js
checkHosts()   // times every torrent API on your network
showCache()    // what is cached, and how old
clearCache()   // drop cached lookups, keeping settings
```

## Caching

Lookups are cached for an hour in `chrome.storage.local`, then served
stale-while-revalidate: an expired entry is shown immediately with an
"Updating..." indicator while it refreshes behind the results. A failed refresh
keeps the stale data on screen rather than replacing it with an error. At most
40 entries are kept, oldest evicted first.
