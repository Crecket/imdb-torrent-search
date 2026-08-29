export const DEFAULTS = Object.freeze({
    autoShow: false,
    displayLinks: true,
    customUrls: [],
});

const KEYS = Object.keys(DEFAULTS);

/**
 * Read all settings, applying defaults and discarding the null holes that
 * older versions of the popup left behind in customUrls.
 */
export async function getSettings() {
    const stored = (await chrome.storage.local.get(KEYS)) ?? {};
    const customUrls = Array.isArray(stored.customUrls)
        ? stored.customUrls.filter((entry) => entry && typeof entry.urlTemplate === "string")
        : [...DEFAULTS.customUrls];

    return {
        autoShow: stored.autoShow ?? DEFAULTS.autoShow,
        displayLinks: stored.displayLinks ?? DEFAULTS.displayLinks,
        customUrls,
    };
}

export async function setSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
}
