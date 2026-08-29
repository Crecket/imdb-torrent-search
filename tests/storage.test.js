import { jest } from "@jest/globals";
import { DEFAULTS, getSettings, setSetting } from "../src/shared/storage.js";

function mockStorage(initial = {}) {
    let store = { ...initial };
    global.chrome = {
        storage: {
            local: {
                get: jest.fn(async (keys) =>
                    Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))
                ),
                set: jest.fn(async (obj) => {
                    store = { ...store, ...obj };
                }),
            },
        },
    };
    return () => store;
}

afterEach(() => {
    delete global.chrome;
});

test("returns defaults for a first-run user", async () => {
    mockStorage({});
    await expect(getSettings()).resolves.toEqual(DEFAULTS);
});

test("displayLinks defaults to true, autoShow to false", () => {
    expect(DEFAULTS.displayLinks).toBe(true);
    expect(DEFAULTS.autoShow).toBe(false);
});

test("stored values override defaults", async () => {
    mockStorage({ autoShow: true, customUrls: [{ urlTemplate: "https://x.to/${name}" }] });
    const settings = await getSettings();
    expect(settings.autoShow).toBe(true);
    expect(settings.displayLinks).toBe(true);
    expect(settings.customUrls).toHaveLength(1);
});

test("drops null entries left by the old splice-based removal", async () => {
    mockStorage({ customUrls: [null, { urlTemplate: "https://x.to/${name}" }, null] });
    await expect(getSettings()).resolves.toMatchObject({
        customUrls: [{ urlTemplate: "https://x.to/${name}" }],
    });
});

test("coerces a non-array customUrls to the default", async () => {
    mockStorage({ customUrls: "corrupt" });
    await expect(getSettings()).resolves.toMatchObject({ customUrls: [] });
});

test("setSetting writes a single key", async () => {
    const read = mockStorage({});
    await setSetting("autoShow", true);
    expect(read().autoShow).toBe(true);
});
