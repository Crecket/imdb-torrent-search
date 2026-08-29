import { createWriteStream } from "node:fs";
import { readFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import archiver from "archiver";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const releasesDir = path.join(root, "releases");
await mkdir(releasesDir, { recursive: true });

const target = path.join(releasesDir, `extension_v${pkg.version}.zip`);
await rm(target, { force: true });

const output = createWriteStream(target);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
    console.log(`${path.relative(root, target)} — ${(archive.pointer() / 1024).toFixed(1)} kB`);
});

archive.on("warning", (error) => {
    if (error.code !== "ENOENT") throw error;
});
archive.on("error", (error) => {
    throw error;
});

archive.pipe(output);
archive.glob("**/*", { cwd: path.join(root, "extension"), ignore: ["**/*.map"] });
await archive.finalize();
