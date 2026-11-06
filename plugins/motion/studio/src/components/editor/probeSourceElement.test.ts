import { afterEach, describe, expect, it, vi } from "vitest";
import { probeSourceElement } from "./probeSourceElement";

afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, ok = true) =>
  vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));

describe("probeSourceElement", () => {
  it("sends the asks for one file in one tick as a single request", async () => {
    const fetchMock = answer({ exists: [true, false, true] });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      probeSourceElement("p", "index.html", { id: "a" }),
      probeSourceElement("p", "index.html", { id: "b" }),
      probeSourceElement("p", "index.html", { id: "c" }),
    ]);

    expect(results).toEqual([true, false, true]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).targets).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("keeps one request per file", async () => {
    const fetchMock = answer({ exists: [true] });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([
      probeSourceElement("p", "index.html", { id: "a" }),
      probeSourceElement("p", "compositions/x.html", { id: "a" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads a failed or malformed answer as existing", async () => {
    vi.stubGlobal("fetch", answer({}, false));
    expect(await probeSourceElement("p", "index.html", { id: "a" })).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    expect(await probeSourceElement("p", "index.html", { id: "a" })).toBe(true);
  });
});
