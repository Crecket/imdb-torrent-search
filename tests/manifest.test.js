import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const extensionDir = fileURLToPath(new URL("../extension/", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("manifest v3 shape", () => {
    test("declares manifest_version 3", () => {
        expect(manifest.manifest_version).toBe(3);
    });

    test("uses a module service worker rather than background scripts", () => {
        expect(manifest.background.service_worker).toBe("build/service-worker.js");
        expect(manifest.background.type).toBe("module");
        expect(manifest.background.scripts).toBeUndefined();
        expect(manifest.background.persistent).toBeUndefined();
    });

    test("uses action, not browser_action", () => {
        expect(manifest.action).toBeDefined();
        expect(manifest.browser_action).toBeUndefined();
        expect(manifest.page_action).toBeUndefined();
    });

    test("keeps host patterns out of permissions", () => {
        for (const permission of manifest.permissions) {
            expect(permission).not.toMatch(/:\/\//);
        }
        expect(manifest.permissions).toContain("storage");
    });

    test("declares host_permissions including the eztv redirect target", () => {
        expect(manifest.host_permissions).toContain("https://eztvx.to/*");
        expect(manifest.host_permissions).toContain("https://eztv.re/*");
    });

    test("requests no plaintext http hosts", () => {
        for (const host of [...manifest.host_permissions, ...manifest.content_scripts[0].matches]) {
            expect(host.startsWith("http://")).toBe(false);
        }
    });

    test("uses the object form of web_accessible_resources", () => {
        expect(Array.isArray(manifest.web_accessible_resources)).toBe(true);
        for (const entry of manifest.web_accessible_resources) {
            expect(typeof entry).toBe("object");
            expect(Array.isArray(entry.resources)).toBe(true);
            expect(Array.isArray(entry.matches)).toBe(true);
        }
    });

    test("uses the object form of content_security_policy with no remote sources", () => {
        expect(typeof manifest.content_security_policy).toBe("object");
        const policy = manifest.content_security_policy.extension_pages;
        expect(policy).toContain("script-src 'self'");
        expect(policy).not.toMatch(/https?:\/\//);
        expect(policy).not.toContain("unsafe-eval");
    });

    test("matches imdb subdomains, not just www", () => {
        expect(manifest.content_scripts[0].matches).toContain("https://*.imdb.com/title/*");
    });

    test("version tracks package.json", () => {
        expect(manifest.version).toBe(pkg.version);
    });
});

describe("packaged files", () => {
    const referenced = [
        ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
        ...Object.values(manifest.icons),
        ...Object.values(manifest.action.default_icon),
        manifest.action.default_popup,
        ...manifest.content_scripts.flatMap((script) => [...script.js, ...script.css]),
        manifest.background.service_worker,
    ];

    // Guards the defect where img/torrents-favicon.png was declared but absent.
    test.each([...new Set(referenced)])("%s exists on disk", (relative) => {
        if (relative.startsWith("build/") && !existsSync(path.join(extensionDir, "build"))) {
            return; // not built yet in this environment
        }
        expect(existsSync(path.join(extensionDir, relative))).toBe(true);
    });

    test("popup.html loads no remote script or stylesheet", () => {
        const html = readFileSync(path.join(extensionDir, "popup.html"), "utf8");
        expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
        expect(html).not.toMatch(/<link[^>]+href=["']https?:\/\//i);
    });
});
