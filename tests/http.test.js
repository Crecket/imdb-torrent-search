import { jest } from "@jest/globals";
import { fetchJson } from "../src/background/http.js";

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

test("returns parsed JSON on success", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ hello: "world" }));
    await expect(fetchJson("https://x.test/a", { fetchImpl })).resolves.toEqual({ hello: "world" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("passes an AbortSignal and omits credentials", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}));
    await fetchJson("https://x.test/a", { fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.credentials).toBe("omit");
});

test("throws on 404 and does not retry", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(null, 404));
    await expect(fetchJson("https://x.test/a", { fetchImpl, retries: 3 })).rejects.toThrow("HTTP 404");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("retries a 500 and succeeds on the second attempt", async () => {
    const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(null, 500))
        .mockResolvedValueOnce(jsonResponse({ recovered: true }));
    await expect(fetchJson("https://x.test/a", { fetchImpl, retries: 1 })).resolves.toEqual({ recovered: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("retries a network rejection then succeeds", async () => {
    const fetchImpl = jest
        .fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(jsonResponse({ recovered: true }));
    await expect(fetchJson("https://x.test/a", { fetchImpl, retries: 1 })).resolves.toEqual({ recovered: true });
});

test("gives up once retries are exhausted", async () => {
    const fetchImpl = jest.fn(async () => {
        throw new Error("network down");
    });
    await expect(fetchJson("https://x.test/a", { fetchImpl, retries: 2 })).rejects.toThrow("network down");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test("aborts once the timeout elapses", async () => {
    const fetchImpl = jest.fn(
        (url, init) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => reject(new Error("Aborted")));
            })
    );
    await expect(fetchJson("https://x.test/a", { fetchImpl, timeoutMs: 5, retries: 0 })).rejects.toThrow("Aborted");
});
