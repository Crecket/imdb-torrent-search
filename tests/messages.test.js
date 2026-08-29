import { jest } from "@jest/globals";
import { MESSAGE_TYPES, ok, fail, sendMessage } from "../src/shared/messages.js";

afterEach(() => {
    delete global.chrome;
});

function mockRuntime(response) {
    global.chrome = {
        runtime: {
            sendMessage: jest.fn(typeof response === "function" ? response : async () => response),
        },
    };
}

test("message types are stable wire values", () => {
    expect(MESSAGE_TYPES).toEqual({ MOVIE: "movie", SERIES: "series", SEASON: "season" });
});

describe("envelope", () => {
    test("ok wraps a payload", () => {
        expect(ok([1, 2])).toEqual({ ok: true, data: [1, 2] });
    });

    test("fail reduces an Error to its message", () => {
        expect(fail(new Error("boom"))).toEqual({ ok: false, error: "boom" });
    });

    test("fail stringifies a non-Error", () => {
        expect(fail("plain string")).toEqual({ ok: false, error: "plain string" });
        expect(fail(404)).toEqual({ ok: false, error: "404" });
    });
});

describe("sendMessage", () => {
    test("unwraps a successful envelope", async () => {
        mockRuntime({ ok: true, data: [{ quality: "1080p" }] });
        await expect(sendMessage({ type: "movie", imdbID: "tt1" })).resolves.toEqual([{ quality: "1080p" }]);
    });

    test("forwards the payload verbatim to the runtime", async () => {
        mockRuntime({ ok: true, data: [] });
        const payload = { type: "series", imdbID: "tt1", revalidate: true };
        await sendMessage(payload);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(payload);
    });

    test("throws the background's error rather than resolving undefined", async () => {
        // This is the silent-hang regression: the MV2 code read response.data
        // off a missing response inside a promise executor and swallowed it.
        mockRuntime({ ok: false, error: "YTS lookup failed" });
        await expect(sendMessage({ type: "movie", imdbID: "tt1" })).rejects.toThrow("YTS lookup failed");
    });

    test("throws when the service worker never replies", async () => {
        mockRuntime(undefined);
        await expect(sendMessage({ type: "movie", imdbID: "tt1" })).rejects.toThrow(
            /No response from background service worker/,
        );
    });

    test("throws a usable message when the envelope carries no error text", async () => {
        mockRuntime({ ok: false });
        await expect(sendMessage({ type: "movie", imdbID: "tt1" })).rejects.toThrow("Unknown background error");
    });

    test("propagates a runtime-level rejection such as a disconnected port", async () => {
        mockRuntime(async () => {
            throw new Error("Could not establish connection");
        });
        await expect(sendMessage({ type: "movie", imdbID: "tt1" })).rejects.toThrow("Could not establish connection");
    });

    test("resolves an empty result set without throwing", async () => {
        mockRuntime({ ok: true, data: [] });
        await expect(sendMessage({ type: "movie", imdbID: "tt1" })).resolves.toEqual([]);
    });
});
