import { describe, expect, it, vi } from "vitest";
import type { OpenDesignElectronUpdaterStatusSnapshot } from "@open-design/electron-contract";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  ipcListeners: new Map<string, (...args: unknown[]) => void>(),
  opened: [] as string[],
}));

vi.mock("electron", () => ({
  app: { getAppPath: () => "/electron-shell" },
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>) { electron.handlers.set(channel, handler); },
    on(channel: string, listener: (...args: unknown[]) => void) { electron.ipcListeners.set(channel, listener); },
    removeHandler(channel: string) { electron.handlers.delete(channel); },
    removeListener(channel: string) { electron.ipcListeners.delete(channel); },
  },
  dialog: {},
  nativeTheme: { themeSource: "system" },
  session: { fromPartition: () => ({ clearStorageData: async () => undefined }) },
  shell: { openExternal(url: string) { electron.opened.push(url); } },
}));

import { createElectronRendererAdapter } from "@/adapters/renderer/renderer.js";
import { installElectronProductHandlers } from "@/adapters/renderer/product-handlers.js";
import { ELECTRON_CONTENT_UPDATE_CHANNELS } from "@/contracts/content-update.js";
import { ELECTRON_RENDERER_IPC } from "@/contracts/renderer-ipc.js";

function runtimeAccess() {
  return {
    attachment: { id: "electron-renderer" },
    binding: { digest: "b".repeat(64) },
    handle: {
      async invoke(command: { requestId: string; attachmentId: string; bindingDigest: string }) {
        return {
          requestId: command.requestId,
          attachmentId: command.attachmentId,
          bindingDigest: command.bindingDigest,
          outcome: "accepted",
          output: { schemaVersion: 1, daemon: { url: "http://127.0.0.1:17578" }, web: { url: "http://127.0.0.1:17579" } },
        };
      },
    },
  };
}

describe("Electron renderer content updater binding", () => {
  it("projects and applies independent Shell and Closure updater lines", async () => {
    electron.handlers.clear();
    electron.ipcListeners.clear();
    const webContents = { send: vi.fn() };
    const shellSnapshot = {
      schemaVersion: 3,
      revision: 4,
      shellType: "electron",
      state: "ready" as const,
      candidateId: "candidate-1",
      actions: [{ id: "install" as const }],
      blockedBy: [],
      handoff: { releaseVersion: "betahyx-2", artifact: { path: "/private/update.dmg" } },
    };
    const shellInvoke = vi.fn(async () => ({ outcome: "accepted", snapshot: { ...shellSnapshot, state: "applying" as const } }));
    const prepareLatest = vi.fn(async () => ({
      status: "prepared" as const,
      authorized: false,
      generation: { id: "g".repeat(64), releaseVersion: "betahyx-closure-2" },
    }));
    const applyNow = vi.fn(async () => ({
      status: "applied" as const,
      binding: {}, lifecycle: {}, generation: { id: "n".repeat(64), releaseVersion: "betahyx-closure-2" },
    }));
    const lease = await installElectronProductHandlers({
      daemonUrl: "http://127.0.0.1:17578",
      contentUpdater: { prepareLatest, applyNow },
      shellUpdater: { readSnapshot: async () => shellSnapshot, invoke: shellInvoke },
      runtime: {
        attachment: { id: "attachment", shell: { version: "betahyx-1" } },
        binding: { digest: "b".repeat(64), scope: { channel: "betahyx" } },
        handle: { invoke: vi.fn(async () => ({ outcome: "accepted" })) },
      },
      window: { webContents, isDestroyed: () => false },
    } as unknown as Parameters<typeof installElectronProductHandlers>[0]);
    const event = { sender: webContents };

    const initial = await electron.handlers.get(ELECTRON_RENDERER_IPC.updaterStatus)!(event) as OpenDesignElectronUpdaterStatusSnapshot;
    expect(initial.lines.shell).toMatchObject({ target: "shell", state: "ready", candidateVersion: "betahyx-2", actions: ["apply"] });
    expect(initial.lines.closure).toMatchObject({ target: "closure", state: "idle", actions: ["check"] });

    const checked = await electron.handlers.get(ELECTRON_RENDERER_IPC.updaterCheck)!(event, "closure") as OpenDesignElectronUpdaterStatusSnapshot;
    expect(checked.lines.closure).toMatchObject({ state: "ready", candidateVersion: "betahyx-closure-2", actions: ["apply", "later"] });
    expect(shellInvoke).not.toHaveBeenCalled();

    await electron.handlers.get(ELECTRON_RENDERER_IPC.updaterApply)!(event, "closure", { force: true });
    expect(applyNow).toHaveBeenCalledWith({ force: true });
    await electron.handlers.get(ELECTRON_RENDERER_IPC.updaterApply)!(event, "shell", { force: false });
    expect(shellInvoke).toHaveBeenCalledWith("install");

    lease.dispose();
  });

  it("accepts only the mounted renderer and removes both finite handlers on dispose", async () => {
    electron.handlers.clear();
    electron.ipcListeners.clear();
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const webContents = {
      id: 7,
      on(name: string, listener: (...args: unknown[]) => void) { listeners.set(name, listener); },
      removeListener(name: string) { listeners.delete(name); },
      setWindowOpenHandler() {},
    };
    const prepareLatest = vi.fn().mockResolvedValue({ status: "current", generationId: "a".repeat(64) });
    const applyNow = vi.fn().mockResolvedValue({ status: "blocked", reason: "transition-active", occupants: [] });
    const adapter = createElectronRendererAdapter("Electron");
    const lease = await adapter.renderer.mount({
      acknowledgement: { attemptId: "attempt", bindingDigest: "b".repeat(64), channel: "od:mounted", nonce: "nonce" },
      contentUpdater: { prepareLatest, applyNow },
      manifest: { protocol: "od" },
      preflight: {},
      presentation: "interactive",
      runtime: runtimeAccess(),
      window: { webContents, async loadURL(url: string) { expect(url).toBe("http://127.0.0.1:17579/"); } },
    } as unknown as Parameters<typeof adapter.renderer.mount>[0]);

    const prepare = electron.handlers.get(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare)!;
    const apply = electron.handlers.get(ELECTRON_CONTENT_UPDATE_CHANNELS.apply)!;
    await expect(prepare({ sender: { id: 7 } })).rejects.toThrow("not the mounted renderer");
    await expect(prepare({ sender: webContents })).resolves.toMatchObject({ state: "current" });
    await expect(apply({ sender: webContents }, "yes")).rejects.toThrow("force flag must be boolean");
    await expect(apply({ sender: webContents }, true)).resolves.toMatchObject({ state: "blocked", reason: "transition-active" });
    expect(prepareLatest).toHaveBeenCalledWith("observe");
    expect(applyNow).toHaveBeenCalledWith({ force: true });
    expect(listeners.size).toBe(3);

    await lease.dispose();
    expect(electron.handlers.size).toBe(0);
    expect(electron.ipcListeners.size).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it("removes renderer security and finite handlers when the document fails to load", async () => {
    electron.handlers.clear();
    electron.ipcListeners.clear();
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const webContents = {
      on(name: string, listener: (...args: unknown[]) => void) { listeners.set(name, listener); },
      removeListener(name: string) { listeners.delete(name); },
      setWindowOpenHandler() {},
    };
    const adapter = createElectronRendererAdapter("Electron");
    await expect(adapter.renderer.mount({
      acknowledgement: { attemptId: "attempt", bindingDigest: "b".repeat(64), channel: "od:mounted", nonce: "nonce" },
      contentUpdater: { prepareLatest: vi.fn(), applyNow: vi.fn() },
      manifest: { protocol: "od" },
      preflight: {},
      presentation: "interactive",
      runtime: runtimeAccess(),
      window: { webContents, async loadURL() { throw new Error("load failed"); } },
    } as unknown as Parameters<typeof adapter.renderer.mount>[0])).rejects.toThrow("load failed");
    expect(electron.handlers.size).toBe(0);
    expect(electron.ipcListeners.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
});
