import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { executeElectronCdpContractControl } from "@/cdp/control.js";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function userDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "electron-cdp-control-"));
  roots.push(root);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "DevToolsActivePort"), "43123\n/devtools/browser/test\n");
  return root;
}

function installCdpFixture(responses: Array<Readonly<{ error?: unknown; result?: unknown }>>): { fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async () => new Response(JSON.stringify([
    { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:43123/devtools/page/test" },
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
      userDataRoot: root,
      timeoutMs: 1_000,
      close: true,
      invocations: [{ path: ["updater", "status"], args: [] }],
    });

    expect(receipt.results).toEqual([{ state: "ready" }]);
    expect(fixture.fetch).toHaveBeenCalledTimes(3);
  });

  it("records an expected renderer context transition without exposing the bridge slot", async () => {
    const root = await userDataRoot();
    installCdpFixture([{ error: { code: -32_000, message: "Execution context was destroyed." } }]);

    const receipt = await executeElectronCdpContractControl({
      schemaVersion: 1,
      operation: "electron.cdp.contract.invoke",
      userDataRoot: root,
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
});
