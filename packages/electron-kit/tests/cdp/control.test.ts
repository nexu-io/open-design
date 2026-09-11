import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { executeElectronCdpContractControl } from "@/cdp/control.js";
import { resolveElectronSessionPaths } from "@/runtime/session/namespace-paths.js";
const platform = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async original => ({ ...await original<typeof import("node:os")>(), homedir: () => platform.home }));

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function userDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "electron-cdp-control-"));
  roots.push(root);
  platform.home = root;
  const sessionData = resolveElectronSessionPaths({ productName: "Fixture", channel: "betahyx", namespace: "cdp-test", presentation: "headless" }).sessionDataRoot;
  await mkdir(sessionData, { recursive: true });
  await writeFile(join(sessionData, "DevToolsActivePort"), "43123\n/devtools/browser/test\n");
  // A different session's stale bootstrap receipt must never be consumed.
  await writeFile(join(root, "DevToolsActivePort"), "43124\n/devtools/browser/wrong-session\n");
  return root;
}

function request(root: string) {
  return {
    schemaVersion: 1, operation: "electron.cdp.contract.invoke",
    session: { productName: "Fixture", channel: "betahyx", namespace: "cdp-test", presentation: "headless" as const },
    timeoutMs: 1_000, close: false, invocations: [{ path: ["updater", "status"], args: [] }],
  };
}

function installCdpFixture(responses: Array<Readonly<{ error?: unknown; result?: unknown }>>): { fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify([
    { id: "test", title: "Test", url: "about:blank", type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:43123/devtools/page/test" },
  ]), { status: 200 }));
  class FixtureWebSocket extends EventTarget {
    constructor(_url: string) {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }

    send(body: string): void {
      const request = JSON.parse(body) as { id: number; method: string };
      const response = responses.shift();
      if (response == null) throw new Error("unexpected CDP command");
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ id: request.id, ...response }),
      })));
    }

    close(): void {}
  }
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("WebSocket", FixtureWebSocket);
  return { fetch };
}

describe("Electron CDP contract control", () => {
  it("closes the owned native browser without depending on a mounted business bridge", async () => {
    const root = await userDataRoot(), fixture = installCdpFixture([{ result: {} }]);
    const result = await executeElectronCdpContractControl({ ...request(root), close: true, invocations: [] });
    expect(result.results).toEqual([]); expect(fixture.fetch).toHaveBeenCalledOnce();
    await expect(executeElectronCdpContractControl({ ...request(root), close: false, invocations: [] })).rejects.toThrow("request is invalid");
  });
  it("rediscovers the page until the declared contract is mounted", async () => {
    const root = await userDataRoot();
    const fixture = installCdpFixture([
      { result: { exceptionDetails: { exception: { description: "Error: Electron contract method is unavailable" } } } },
      { result: { result: { value: { state: "ready" } } } },
      { result: {} },
    ]);

    const receipt = await executeElectronCdpContractControl({
      schemaVersion: 1,
      operation: "electron.cdp.contract.invoke",
      session: request(root).session,
      timeoutMs: 1_000,
      close: true,
      invocations: [{ path: ["updater", "status"], args: [] }],
    });

    expect(receipt.results).toEqual([{ state: "ready" }]);
    expect(fixture.fetch).toHaveBeenCalledTimes(3);
    expect(fixture.fetch.mock.calls.every(([url]) => url === "http://127.0.0.1:43123/json/list")).toBe(true);
  });

  it("records an expected renderer context transition without exposing the bridge slot", async () => {
    const root = await userDataRoot();
    installCdpFixture([{ error: { code: -32_000, message: "Execution context was destroyed." } }]);

    const receipt = await executeElectronCdpContractControl({
      schemaVersion: 1,
      operation: "electron.cdp.contract.invoke",
      session: request(root).session,
      timeoutMs: 1_000,
      close: false,
      invocations: [{
        path: ["updater", "apply"],
        args: ["closure", { force: true }],
        settleOnContextDestroyed: true,
      }],
    });

    expect(receipt.results).toEqual([{ outcome: "context-destroyed" }]);
  });

  it("bounds malformed discovery instead of polling forever", async () => {
    const root = await userDataRoot();
    await writeFile(join(resolveElectronSessionPaths(request(root).session).sessionDataRoot, "DevToolsActivePort"), "not-a-port");
    await expect(executeElectronCdpContractControl(request(root))).rejects.toThrow("discovery timed out");
  });

  it.each(["open", "command", "malformed"])("terminates a broken WebSocket %s and closes it", async (stage) => {
    const root = await userDataRoot(), closed = vi.fn();
    installCdpFixture([]);
    class HangingSocket extends EventTarget {
      constructor(_url: string) { super(); if (stage !== "open") queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
      send() { if (stage === "malformed") queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: "null" }))); }
      close() { closed(); }
    }
    vi.stubGlobal("WebSocket", HangingSocket);
    await expect(executeElectronCdpContractControl(request(root))).rejects.toThrow(stage === "malformed" ? "response is invalid" : "timed out");
    expect(closed).toHaveBeenCalledOnce();
  });

  it("bounds discovery HTTP responses that never arrive", async () => {
    const root = await userDataRoot();
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
    }));
    await expect(executeElectronCdpContractControl(request(root))).rejects.toThrow("page discovery timed out");
  });
});
