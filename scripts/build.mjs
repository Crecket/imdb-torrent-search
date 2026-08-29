import { build, context } from "esbuild";
import * as sass from "sass";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = path.join(root, "extension", "build");
const watch = process.argv.includes("--watch");
const dev = process.argv.includes("--dev");

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const jsOptions = {
    entryPoints: {
        "service-worker": path.join(root, "src/background/service-worker.js"),
        content: path.join(root, "src/content/index.js"),
        popup: path.join(root, "src/popup/index.js"),
    },
    outdir,
    bundle: true,
    format: "esm",
    target: ["chrome110"],
    sourcemap: dev ? "inline" : false,
    minify: !dev,
    logLevel: "info",
    define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
};

const styles = [
    ["src/styles/content.scss", "content.css"],
    ["src/styles/popup.scss", "popup.css"],
];

async function buildStyles() {
    await mkdir(outdir, { recursive: true });
    for (const [from, to] of styles) {
        const result = sass.compile(path.join(root, from), { style: dev ? "expanded" : "compressed" });
        await writeFile(path.join(outdir, to), result.css);
    }
}

async function syncManifestVersion() {
    const file = path.join(root, "extension", "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    if (manifest.version !== pkg.version) {
        manifest.version = pkg.version;
        await writeFile(file, JSON.stringify(manifest, null, 4) + "\n");
    }
}

await syncManifestVersion();
await buildStyles();

if (watch) {
    const ctx = await context(jsOptions);
    await ctx.watch();
    console.log("watching…");
} else {
    await build(jsOptions);
}
