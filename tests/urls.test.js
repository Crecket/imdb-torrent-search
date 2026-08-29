import { isSafeUrl, isSafeImageUrl, expandTemplate } from "../src/shared/urls.js";

describe("isSafeUrl", () => {
    test.each(["https://example.com/a", "http://example.com/a", "magnet:?xt=urn:btih:abc"])("accepts %s", (url) => {
        expect(isSafeUrl(url)).toBe(true);
    });

    test.each([
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "  javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "",
        null,
        undefined,
        "not a url",
    ])("rejects %s", (url) => {
        expect(isSafeUrl(url)).toBe(false);
    });
});

describe("expandTemplate", () => {
    const vars = { name: "The%20Matrix", year: "1999", imdbID: "tt0133093" };

    test("replaces each placeholder", () => {
        expect(expandTemplate("https://x.to/s?q=${name}+${year}", vars)).toBe("https://x.to/s?q=The%20Matrix+1999");
    });

    test("replaces every occurrence, not just the first", () => {
        expect(expandTemplate("${imdbID}/${imdbID}", vars)).toBe("tt0133093/tt0133093");
    });

    test("leaves unknown placeholders alone", () => {
        expect(expandTemplate("${nope}", vars)).toBe("${nope}");
    });

    test("treats missing vars as empty string", () => {
        expect(expandTemplate("${year}", { name: "a", imdbID: "b" })).toBe("");
    });
});

describe("isSafeImageUrl", () => {
    test.each([
        "https://example.com/a.png",
        "http://example.com/a.png",
        // chrome.runtime.getURL returns this form; rejecting it silently hid
        // every bundled icon in the injected panel.
        "chrome-extension://abcdefghijklmnop/img/icon-magnet.gif",
        "moz-extension://abcdefghijklmnop/img/icon-magnet.gif",
    ])("accepts %s", (url) => {
        expect(isSafeImageUrl(url)).toBe(true);
    });

    test.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "magnet:?xt=urn:btih:a", "", null])(
        "rejects %s",
        (url) => {
            expect(isSafeImageUrl(url)).toBe(false);
        },
    );

    test("is narrower than the link allow-list for magnet, wider for extension urls", () => {
        expect(isSafeUrl("magnet:?xt=urn:btih:a")).toBe(true);
        expect(isSafeImageUrl("magnet:?xt=urn:btih:a")).toBe(false);
        expect(isSafeUrl("chrome-extension://x/i.png")).toBe(false);
        expect(isSafeImageUrl("chrome-extension://x/i.png")).toBe(true);
    });
});
