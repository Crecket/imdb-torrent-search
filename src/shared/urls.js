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

const PLACEHOLDER = /\$\{(name|year|imdbID)\}/g;

/**
 * Fill ${name}, ${year} and ${imdbID} in a user-supplied URL template.
 * Every occurrence is replaced, not just the first.
 */
export function expandTemplate(template, vars = {}) {
    if (typeof template !== "string") return "";
    return template.replace(PLACEHOLDER, (_, key) => vars[key] ?? "");
}
