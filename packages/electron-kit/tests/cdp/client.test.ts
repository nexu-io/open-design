import { afterEach, expect, it, vi } from "vitest";
import { callElectronCdp, withElectronCdp } from "@/cdp/client.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const endpoint = { discoveryUrl: "http://127.0.0.1:43123" };
function fixture(pages = 1) {
  const closed = vi.fn();
  const requests: Array<{ id: number; method: string }> = [];
  let current!: Socket;
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    constructor() { super(); current = this; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(body: string) {
      const request = JSON.parse(body);
      requests.push(request);
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ method: "Runtime.consoleAPICalled", params: { type: "log" } }) }));
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ id: request.id, result: { method: request.method } }) }));
      });
    }
    close() { this.readyState = 3; closed(); }
  }
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(Array.from({ length: pages }, (_, i) => ({
    id: `page-${i}`, type: "page", title: "Test", url: "about:blank", webSocketDebuggerUrl: `${endpoint.discoveryUrl.replace("http:", "ws:")}/devtools/page/${i}`,
  }))))));
  return { closed, requests, socket: () => current };
}

it("correlates native calls and receives enable-time events on one owned socket", async () => {
  const test = fixture();
  const events: unknown[] = [];
  const results = await withElectronCdp(endpoint, async client => {
    const unsubscribe = client.subscribe(event => events.push(event));
    try { return await Promise.all([client.send({ method: "Runtime.enable" }), client.send({ method: "Page.getFrameTree" })]); }
    finally { unsubscribe(); }
  });
  expect(results).toEqual([{ method: "Runtime.enable" }, { method: "Page.getFrameTree" }]);
  expect(test.requests.map(r => r.id)).toEqual([1, 2]);
  expect(events).toHaveLength(2);
  expect(test.closed).toHaveBeenCalledOnce();
});

it("refuses ambiguous page selection, but accepts an explicit target", async () => {
  fixture(2);
  await expect(callElectronCdp({ ...endpoint, method: "Runtime.enable" })).rejects.toThrow("Select one CDP target");
  await expect(callElectronCdp({ ...endpoint, targetId: "page-1", method: "Runtime.enable" })).resolves.toEqual({ method: "Runtime.enable" });
});

it("rejects remote endpoints before discovery", async () => {
  fixture();
  await expect(callElectronCdp({ discoveryUrl: "http://example.com", method: "Runtime.enable" })).rejects.toThrow("loopback");
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects discovery redirecting the socket to another local service", async () => {
  fixture();
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{ id: "x", title: "x", type: "page", url: "about:blank", webSocketDebuggerUrl: "ws://127.0.0.1:9999/" }])));
  await expect(callElectronCdp({ ...endpoint, method: "Runtime.enable" })).rejects.toThrow("escaped");
});

it("fails an idle subscription on disconnect and releases ownership", async () => {
  const test = fixture();
  await expect(withElectronCdp(endpoint, async () => {
    test.socket().dispatchEvent(new Event("close"));
    return new Promise<never>(() => {});
  })).rejects.toThrow("closed");
  expect(test.closed).toHaveBeenCalledOnce();
});

it("bounds an idle subscription using its deadline, without wall-clock sleep", async () => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const test = fixture();
  await expect(withElectronCdp(endpoint, async () => {
    controller.abort();
    return new Promise<never>(() => {});
  })).rejects.toThrow("timed out");
  expect(test.closed).toHaveBeenCalled();
});
