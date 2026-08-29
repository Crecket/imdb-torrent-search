import { readFileSync } from "node:fs";

test("package.json declares no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.type).toBe("module");
});
