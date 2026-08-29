# IMDB Torrent Search — Manifest V3 Modernization

**Date:** 2026-08-29
**Status:** Approved

## Problem

The extension was last touched in April 2021 and targets Manifest V2, which
Chrome no longer accepts. Beyond the manifest itself, the project cannot be
built or run at all on a current machine:

- webpack 2, Babel 6, and node-sass do not install on Node 26.
- `content.js` imports `jquery`, which is absent from `package.json`.
- `content.js` imports `babel-core/register`, a Node-only API, into a browser
  bundle.
- `popup.html` loads jQuery and Materialize from CDNs, which MV3's content
  security policy forbids outright.

Several runtime behaviours have also rotted: the EZTV host now redirects, the
IMDb DOM selectors target a layout retired in 2020, and the extension has no
tests of any kind.

## Goals

1. Ship a Manifest V3 extension that loads in current Chrome.
2. Replace the unbuildable toolchain with something small and durable.
3. Fix the correctness and security defects found while reading the code.
4. Establish a test suite where none exists.

## Non-goals

- Firefox support. The store listing is Chrome-only; Firefox's MV3 uses event
  pages rather than service workers and would require a second manifest and an
  API shim.
- Preserving the Materialize visual design of the popup.
- New product features. The feature set stays as it is: inline torrent tables
  on IMDb title pages, search shortlinks, and user-defined URL templates.

## Decisions

| Area | Decision | Rationale |
|---|---|---|
| Build | esbuild + sass, driven by `scripts/build.mjs` | ~5 dev dependencies instead of 30; sub-second builds; nothing framework-shaped to go stale again |
| UI libraries | Drop jQuery and Materialize entirely | MV3 forbids the CDN tags, and the extension's DOM work is a handful of queries and appends |
| Targets | Chrome only | Matches the existing store listing |
| Search links | Prune dead sites, fix TPB, keep custom templates | rarbg.to, extratorrent, ibit and aiosearch are dead or unreachable |

## Architecture

```
src/
  background/
    service-worker.js      message router; the only file touching chrome.runtime here
    http.js                fetchJson: timeout via AbortController, bounded retry
    providers/yts.js       movie lookup, base-URL fallback list
    providers/eztv.js      series lookup, paginated and capped
  content/
    index.js               mount, SPA re-mount, event wiring
    imdb-page.js           title / year / type extraction
    render.js              DOM construction for both tables
  popup/
    index.js
  shared/
    storage.js             promise wrappers over chrome.storage.local, with defaults
    messages.js            message type constants and the response envelope
    links.js               search-link catalogue and template expansion
    logger.js
  styles/
    content.scss
    popup.scss
```

The organising rule: every module except `background/service-worker.js`,
`content/index.js` and `popup/index.js` is pure — it touches no `chrome.*` API
at import time and receives what it needs as arguments. Those three entry
points are the only files that must be exercised in a browser; everything else
is unit-testable under jsdom.

### Message protocol

Requests keep their present shape (`{type, imdbID}`). Responses become an
envelope:

```js
{ ok: true,  data: <payload> }
{ ok: false, error: <string> }
```

The service worker replies exactly once on every path, including failures.

### Data flow

1. `content/index.js` reads the IMDb ID from `location.pathname`, bailing out
   cleanly if there is no match.
2. `content/imdb-page.js` extracts title, year and type — reading
   `application/ld+json` first and falling back to `data-testid` selectors.
3. On toggle, the content script sends `{type: "movie"|"series", imdbID}`.
4. The service worker dispatches to a provider, which returns normalised
   torrent records.
5. `content/render.js` builds DOM nodes and the content script mounts them.

## Defects to fix

Discovered while reading the existing code; each gets a regression test where
it is testable.

1. **Silent infinite hang.** When a background fetch rejects, `sendResponse` is
   never called. The content script then throws on `response.data` inside a
   promise executor, where the rejection is swallowed by `.catch(Logger.error)`.
   The UI displays "Loading…" forever. Fixed by the response envelope.
2. **Unbounded pagination.** `getShows()` recurses for as long as pages return
   exactly 100 rows, with no page cap, and returns nothing at all on error.
   Fixed with a page cap and a guaranteed reply.
3. **Cross-site scripting into the IMDb page.** `Helpers/Templates.js`
   interpolates EZTV episode titles and user-supplied custom URLs and icon URLs
   directly into `innerHTML`. An icon URL of the form `x" onerror="…` executes
   script in the content-script context. Fixed by constructing nodes with
   `createElement` and `textContent`, and by allow-listing URL schemes to
   `magnet:`, `https:` and `http:` — which also rejects `javascript:`.
4. **Crash on non-title pages.** `location.pathname.match(/(tt[0-9]{5,8})/)[0]`
   dereferences null when the pattern does not match.
5. **No SPA handling.** IMDb navigates client-side, so moving between titles
   leaves a stale injected icon and stale results.
6. **Missing packaged file.** `img/torrents-favicon.png` is declared in
   `web_accessible_resources` but does not exist in `extension/img/`.
7. **`chrome.extension.getURL`** was removed in MV3; becomes
   `chrome.runtime.getURL`.
8. **Ordering by object-key accident.** Seasons, episodes and qualities rely on
   JavaScript object key ordering; replaced with explicit numeric sorts.

## Manifest V3 changes

- `manifest_version: 3`.
- `background.scripts` + `persistent: false` become
  `background.service_worker` with `"type": "module"`.
- `browser_action` becomes `action`.
- Host patterns move from `permissions` into `host_permissions`, and
  `https://eztvx.to/*` is added — `eztv.re` now issues a 301 to it, and MV3
  blocks a redirect to a host the extension lacks permission for.
- `web_accessible_resources` takes the object form, scoped to
  `matches: ["https://*.imdb.com/*"]`.
- `content_security_policy` becomes
  `{"extension_pages": "script-src 'self'; object-src 'self'"}`; the CDN
  allowances are removed along with the CDN scripts.
- Content script matches widen to `https://*.imdb.com/title/*`, which picks up
  `m.imdb.com`, and drop the `http://` variant.
- The version string is injected from `package.json` at build time rather than
  maintained in two places.

## External services

| Service | Status | Handling |
|---|---|---|
| EZTV | `eztv.re` 301s to `eztvx.to`; schema unchanged, verified live | Request `eztvx.to` directly; keep the old host permitted for redirects |
| YTS | Unreachable from the development environment; `movies-api.accel.li` is the currently documented base | Ordered list of base URLs, tried in turn until one answers |
| IMDb | Blocked to automated fetches; current markup not directly verifiable | JSON-LD first, `data-testid` selectors as fallback |

The YTS base URL and the IMDb extraction path cannot be verified in this
environment. Both are built defensively and both require one manual load of the
unpacked extension to confirm.

## Testing

Jest with the jsdom environment. There is presently a `jest` configuration
block in `package.json` but no `jest` dependency and no test files.

- **Providers** against a mocked `fetch`: pagination across multiple pages, the
  page cap, HTTP error status, network rejection, empty results, and YTS base
  URL fallback.
- **`imdb-page`** against saved IMDb HTML fixtures for a movie, a series, and a
  page with no JSON-LD, to exercise the DOM fallback.
- **`render`** asserting empty states, correct ordering, and that a malicious
  episode title and a malicious icon URL both render inert.
- **`links`** covering template expansion for `${name}`, `${year}` and
  `${imdbID}`, and rejection of `javascript:` templates.
- **`storage`** covering defaults for first-run users.
- **`manifest`** asserting MV3 shape and that every path the manifest
  references exists on disk after a build — the check that catches defect 6.

## Risks

- The IMDb layout can change again. JSON-LD is the more stable of the two
  paths, which is why it is tried first, but neither is guaranteed.
- The torrent APIs are volatile hosts. The base-URL fallback limits, but does
  not eliminate, the blast radius.
- Dropping Materialize changes the popup's appearance. This was accepted
  explicitly.
