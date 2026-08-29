const SAFE_PROTOCOLS = new Set(["http:", "https:", "magnet:"]);

/**
 * True only for schemes we are willing to put in an href or src.
 * Anything unparseable, empty, or using another scheme (javascript:, data:) is rejected.
 */
export function isSafeUrl(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    try {
        return SAFE_PROTOCOLS.has(new URL(value.trim()).protocol);
    } catch {
        return false;
    }
}

/**
 * Schemes allowed for image sources. Extension-bundled icons arrive as
 * chrome-extension:// URLs from chrome.runtime.getURL, which the link
 * allow-list above deliberately rejects — an image src is a strictly narrower
 * capability than an href, so it gets its own list rather than widening that one.
 */
const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:", "chrome-extension:", "moz-extension:"]);

export function isSafeImageUrl(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    try {
        return SAFE_IMAGE_PROTOCOLS.has(new URL(value.trim()).protocol);
    } catch {
        return false;
    }
}

const PLACEHOLDER = /\$\{(name|year|imdbID)\}/g;

/**
 * Fill ${name}, ${year} and ${imdbID} in a user-supplied URL template.
 * Every occurrence is replaced, not just the first.
 */
export function expandTemplate(template, vars = {}) {
    if (typeof template !== "string") return "";
    return template.replace(PLACEHOLDER, (_, key) => vars[key] ?? "");
}
