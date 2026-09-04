import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  prepareElectronNamespacePaths,
  resolveElectronNamespacePaths,
  resolveElectronSessionNamespace,
} from "@/runtime/session/namespace-paths.js";

describe("Electron namespace paths", () => {
  it("keeps headless acceptance outside the interactive product namespace", () => {
    expect(resolveElectronSessionNamespace("installed-mac", "interactive")).toBe("installed-mac");
    expect(resolveElectronSessionNamespace("installed-mac", "headless")).toBe("installed-mac-headless");
  });

  it("isolates Chromium and runtime state by exact channel and namespace", () => {
    const paths = resolveElectronNamespacePaths("/product-data", { channel: "betahyx", namespace: "installed-mac" });
    const root = join(resolve("/product-data"), "exact", "channels", "betahyx", "namespaces", "installed-mac");
    expect(paths).toEqual({
      namespaceRoot: root,
      userDataRoot: join(root, "electron"),
      sessionDataRoot: join(root, "electron-session"),
      logsRoot: join(root, "logs", "electron"),
      runtimeRoot: join(root, "runtime", "electron"),
    });
  });

  it("creates every target before applying Electron path identity", async () => {
    const calls: string[] = [];
    const app = {
      getPath: vi.fn(() => "/product-data"),
      setPath: vi.fn((name: string, path: string) => { calls.push(`set:${name}:${path}`); }),
    };
    const ensureDirectory = vi.fn(async (path: string) => { calls.push(`mkdir:${path}`); });
    const paths = await prepareElectronNamespacePaths(app, { channel: "betahyx", namespace: "installed-win" }, ensureDirectory);
    expect(ensureDirectory).toHaveBeenCalledTimes(4);
    expect(calls.slice(0, 4).every((call) => call.startsWith("mkdir:"))).toBe(true);
    expect(app.setPath.mock.calls).toEqual([
      ["userData", paths.userDataRoot],
      ["sessionData", paths.sessionDataRoot],
      ["logs", paths.logsRoot],
    ]);
  });

  it("rejects path traversal before touching Electron paths", async () => {
    const app = { getPath: vi.fn(() => "/product-data"), setPath: vi.fn() };
    await expect(prepareElectronNamespacePaths(app, { channel: "betahyx", namespace: "../shared" }))
      .rejects.toThrow("invalid Electron namespace scope");
    expect(app.setPath).not.toHaveBeenCalled();
  });
});
