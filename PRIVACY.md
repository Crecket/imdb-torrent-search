# Privacy Policy — IMDB Torrent Search

_Last updated: 2026-08-30_

## Summary

This extension collects no personal data, has no analytics, no tracking, and no
backend of its own. Nothing is transmitted to the developer.

## What the extension reads

On an IMDb title page, the extension reads the page's **IMDb ID, title, year and
type** (movie or series) from the page itself. That is all it reads, and only on
`https://*.imdb.com/title/*`.

## What is sent, and to whom

When you open the torrent panel, the IMDb ID is sent to third-party torrent
index APIs so they can return matching results:

| Service                         | What it receives | Purpose                           |
| ------------------------------- | ---------------- | --------------------------------- |
| `torrentio.strem.fun`           | IMDb ID          | Movie torrent listings            |
| `movies-api.accel.li`, `yts.mx` | IMDb ID          | Movie torrent listings (fallback) |
| `eztvx.to`                      | Numeric IMDb ID  | Series torrent listings           |

Requests are made with `credentials: "omit"`, so no cookies are attached.

These are independent services with their own privacy practices, which the
developer does not control. Requests are only made when you open the panel — or
immediately on page load if you enable "Show the torrent list automatically".

## What is stored, and where

Everything is stored locally in `chrome.storage.local` on your own device:

- **Settings** — your two toggles and any custom search URL templates you add.
- **A results cache** — torrent listings, kept for one hour and capped at 40
  entries, so revisiting a title does not re-query the APIs.

None of this is synced or transmitted anywhere. Removing the extension deletes
all of it. You can clear the cache at any time from the service worker console
with `clearCache()`.

## Search links

The search-link buttons are ordinary links. Nothing is sent to those sites
unless you click one, at which point your browser visits them normally.

## Contact

Please open an issue on the project's GitHub repository.
