import { MESSAGE_TYPES, sendMessage } from "../shared/messages.js";
import { getSettings } from "../shared/storage.js";
import { buildSearchLinks } from "../shared/links.js";
import logger from "../shared/logger.js";
import { readImdbId, readPageInfo } from "./imdb-page.js";
import { renderLinks, renderMessage, renderMovieTable, renderSeriesTable } from "./render.js";

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

async function loadResults(imdbID) {
    const info = { ...readPageInfo(document), imdbID };
    logger.debug("page info", info);

    if (settings.displayLinks) {
        const links = renderLinks(
            buildSearchLinks(info, settings.customUrls).map((link) => ({
                ...link,
                iconUrl: link.iconUrl ?? (link.icon ? chrome.runtime.getURL(link.icon) : undefined),
            })),
        );
        setPanel(links, renderMessage("Loading torrents…"));
    } else {
        setPanel(renderMessage("Loading torrents…"));
    }

    const type = info.type === "series" ? MESSAGE_TYPES.SERIES : MESSAGE_TYPES.MOVIE;

    let table;
    try {
        const torrents = await sendMessage({ type, imdbID });
        table =
            type === MESSAGE_TYPES.SERIES
                ? renderSeriesTable(torrents, { magnetIcon })
                : renderMovieTable(torrents, { magnetIcon });
    } catch (error) {
        // The MV2 version swallowed this and left "Loading..." on screen forever.
        logger.error(error);
        table = renderMessage(`Could not load torrents: ${error.message}`);
    }

    const panel = document.getElementById(PANEL_ID);
    if (!panel) return; // navigated away mid-request
    panel.lastElementChild?.replaceWith(table);
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
}

init().catch(logger.error);
