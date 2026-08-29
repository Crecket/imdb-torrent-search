import { getSettings, setSetting } from "../shared/storage.js";
import { isSafeUrl, expandTemplate } from "../shared/urls.js";
import logger from "../shared/logger.js";

const $ = (selector) => document.querySelector(selector);

let toastTimer = null;

function showToast(message, tone = "info") {
    const host = $(".toast-host");
    host.textContent = message;
    host.dataset.tone = tone;
    host.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        host.hidden = true;
    }, 3000);
}

function renderCustomUrls(customUrls) {
    const list = $("#custom-links-list");
    list.replaceChildren();

    if (customUrls.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "No custom sites yet.";
        list.append(empty);
        return;
    }

    customUrls.forEach((entry, index) => {
        const item = document.createElement("li");

        const label = document.createElement("span");
        label.className = "template";
        label.textContent = entry.urlTemplate; // never innerHTML: this is user input
        item.append(label);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove";
        remove.dataset.index = String(index);
        remove.setAttribute("aria-label", `Remove ${entry.urlTemplate}`);
        remove.textContent = "Remove";
        item.append(remove);

        list.append(item);
    });
}

async function refresh() {
    const settings = await getSettings();
    $(".autoshow-torrents-checkbox").checked = settings.autoShow;
    $(".autoshow-links-checkbox").checked = settings.displayLinks;
    renderCustomUrls(settings.customUrls);
    return settings;
}

function wireToggles() {
    $(".autoshow-torrents-checkbox").addEventListener("change", (event) => {
        setSetting("autoShow", event.target.checked).catch(logger.error);
    });
    $(".autoshow-links-checkbox").addEventListener("change", (event) => {
        setSetting("displayLinks", event.target.checked).catch(logger.error);
    });
}

function wireRemoval() {
    $("#custom-links-list").addEventListener("click", async (event) => {
        const button = event.target.closest("button.remove");
        if (!button) return;

        const index = Number(button.dataset.index);
        const { customUrls } = await getSettings();
        if (!Number.isInteger(index) || index < 0 || index >= customUrls.length) return;

        customUrls.splice(index, 1);
        await setSetting("customUrls", customUrls);
        renderCustomUrls(customUrls);
        showToast("Removed your custom site.", "info");
    });
}

function wireForm() {
    $("#custom_torrent_form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const urlTemplate = $("#url_template_custom").value.trim();
        const iconInput = $("#icon_url_custom").value.trim();

        if (expandTemplate(urlTemplate, { name: "x", year: "1", imdbID: "tt1" }) === urlTemplate) {
            showToast("That template has no ${name}, ${year} or ${imdbID} placeholder.", "error");
            return;
        }

        const probe = expandTemplate(urlTemplate, { name: "test", year: "2000", imdbID: "tt0000001" });
        if (!isSafeUrl(probe)) {
            showToast("That template must produce an http or https URL.", "error");
            return;
        }

        if (iconInput && !isSafeUrl(iconInput)) {
            showToast("That icon URL is not a valid http or https URL.", "error");
            return;
        }

        const { customUrls } = await getSettings();
        customUrls.push(iconInput ? { urlTemplate, iconUrl: iconInput } : { urlTemplate });
        await setSetting("customUrls", customUrls);

        renderCustomUrls(customUrls);
        showToast("Added your template.", "success");

        $("#url_template_custom").value = "";
        $("#icon_url_custom").value = "";
    });
}

wireToggles();
wireRemoval();
wireForm();
refresh().catch(logger.error);
