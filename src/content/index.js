import { MESSAGE_TYPES, sendMessage } from "../shared/messages.js";
import { DEFAULTS, getSettings } from "../shared/storage.js";
import { buildSearchLinks } from "../shared/links.js";
import logger from "../shared/logger.js";
import { readImdbId, readPageInfo } from "./imdb-page.js";
import { formatAge, renderLinks, renderMessage, renderMovieTable, renderSeriesTable, renderStatus } from "./render.js";

const ICON_ID = "imdb-torrent-search-icon";
const PANEL_ID = "imdb-torrent-search-panel";

const TITLE_TARGETS = ['[data-testid="hero__pageTitle"]', ".titleBar .title_wrapper h1", "h1"];

const magnetIcon = chrome.runtime.getURL("img/icon-magnet.gif");
const logoIcon = chrome.runtime.getURL("img/logo-16x16.png");

let currentPath = null;
let isOpen = false;
let settings = null;

function findTitleNode() {
    for (const selector of TITLE_TARGETS) {
        const node = document.querySelector(selector);
        if (node) return node;
    }
    return null;
}

function teardown() {
    document.getElementById(ICON_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    isOpen = false;
}

function setPanel(...nodes) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.replaceChildren(...nodes);
}

/** Split the panel into stable slots so links, status and results can each be
 *  replaced without disturbing the others. */
function sections(panel) {
    if (!panel.querySelector(".its-results")) {
        const links = document.createElement("div");
        const status = document.createElement("div");
        const results = document.createElement("div");
        results.className = "its-results";
        panel.replaceChildren(links, status, results);
    }
    const [links, status, results] = panel.children;
    return { links, status, results };
}

function buildTable(type, torrents, defaultSeason) {
    return type === MESSAGE_TYPES.SERIES
        ? renderSeriesTable(torrents, { magnetIcon, defaultSeason })
        : renderMovieTable(torrents, { magnetIcon });
}

/** The season currently chosen, so a background refresh does not yank the
 *  viewer back to the default season mid-browse. */
function selectedSeason(panel) {
    const select = panel.querySelector(".its-season-select");
    return select ? Number(select.value) : undefined;
}

async function loadResults(imdbID) {
    const info = { ...readPageInfo(document), imdbID };
    logger.debug("page info", info);

    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const slots = sections(panel);

    if (settings.displayLinks) {
        slots.links.replaceChildren(
            renderLinks(
                buildSearchLinks(info, settings.customUrls).map((link) => ({
                    ...link,
                    iconUrl: link.iconUrl ?? (link.icon ? chrome.runtime.getURL(link.icon) : undefined),
                })),
            ),
        );
    } else {
        slots.links.replaceChildren();
    }

    const type = info.type === "series" ? MESSAGE_TYPES.SERIES : MESSAGE_TYPES.MOVIE;

    slots.status.replaceChildren();
    slots.results.replaceChildren(renderMessage("Loading torrents…"));

    let cached;
    try {
        cached = await sendMessage({ type, imdbID });
    } catch (error) {
        // The MV2 version swallowed this and left "Loading..." on screen forever.
        logger.error(error);
        if (document.getElementById(PANEL_ID) === panel) {
            slots.results.replaceChildren(renderMessage(`Could not load torrents: ${error.message}`));
        }
        return;
    }

    if (document.getElementById(PANEL_ID) !== panel) return; // navigated away mid-request

    slots.results.replaceChildren(buildTable(type, cached.data, undefined));

    if (!cached.stale) {
        slots.status.replaceChildren(renderStatus(`Updated ${formatAge(Date.now() - cached.fetchedAt)}.`, "fresh"));
        return;
    }

    // Stale-while-revalidate: the cached results above are already on screen,
    // so the refresh happens behind them rather than behind a spinner.
    slots.status.replaceChildren(
        renderStatus(`Updating… showing results from ${formatAge(Date.now() - cached.fetchedAt)}.`, "updating"),
    );

    try {
        const fresh = await sendMessage({ type, imdbID, revalidate: true });
        if (document.getElementById(PANEL_ID) !== panel) return;

        slots.results.replaceChildren(buildTable(type, fresh.data, selectedSeason(panel)));
        slots.status.replaceChildren(renderStatus("Updated just now.", "fresh"));
    } catch (error) {
        logger.error(error);
        if (document.getElementById(PANEL_ID) !== panel) return;

        // Keep the stale results visible: out-of-date data beats an error page.
        slots.status.replaceChildren(
            renderStatus(
                `Could not refresh (${error.message}). Showing results from ${formatAge(Date.now() - cached.fetchedAt)}.`,
                "error",
            ),
        );
    }
}

function toggle(imdbID) {
    isOpen = !isOpen;
    if (!isOpen) {
        setPanel();
        return;
    }
    loadResults(imdbID).catch(logger.error);
}

function mount(imdbID) {
    if (document.getElementById(ICON_ID)) return true;

    const titleNode = findTitleNode();
    if (!titleNode) return false;

    const icon = document.createElement("img");
    icon.id = ICON_ID;
    icon.src = logoIcon;
    icon.alt = "Toggle torrent results";
    icon.title = "Toggle torrent results";
    icon.addEventListener("click", () => toggle(imdbID));
    titleNode.append(icon);

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    (titleNode.parentElement ?? titleNode).append(panel);

    if (settings.autoShow) toggle(imdbID);
    return true;
}

/**
 * IMDb navigates client-side, so the content script is not re-injected between
 * titles. Re-mount whenever the path changes, and retry while React is still
 * rendering the title node.
 */
function syncToPage() {
    const imdbID = readImdbId(location.pathname);

    if (location.pathname !== currentPath) {
        currentPath = location.pathname;
        teardown();
    }

    if (!imdbID) return;
    mount(imdbID);
}

let scheduled = false;
function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        try {
            syncToPage();
        } catch (error) {
            logger.error(error);
        }
    });
}

async function init() {
    settings = await getSettings();
    syncToPage();

    new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", scheduleSync);

    // Pick up popup changes without needing a page reload.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        // Cache writes land in the same area and fire this constantly; ignore
        // anything that is not an actual settings key.
        const touched = Object.keys(changes).filter((key) => key in DEFAULTS);
        if (touched.length === 0) return;

        getSettings()
            .then((next) => {
                settings = next;
                // Re-render only if the panel is open and something visible changed.
                const imdbID = readImdbId(location.pathname);
                if (isOpen && imdbID && ("displayLinks" in changes || "customUrls" in changes)) {
                    loadResults(imdbID).catch(logger.error);
                }
            })
            .catch(logger.error);
    });
}

init().catch(logger.error);
