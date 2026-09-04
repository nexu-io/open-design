import { describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  protocols: new Set<string>(),
  opened: [] as string[],
}));

vi.mock("electron", () => ({
  app: { getAppPath: () => "/electron-shell" },
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>) { electron.handlers.set(channel, handler); },
    removeHandler(channel: string) { electron.handlers.delete(channel); },
  },
  protocol: {
    handle(scheme: string) { electron.protocols.add(scheme); },
    unhandle(scheme: string) { electron.protocols.delete(scheme); },
  },
  shell: { openExternal(url: string) { electron.opened.push(url); } },
}));

import { createElectronRendererAdapter } from "@/adapters/renderer/renderer.js";
import { ELECTRON_CONTENT_UPDATE_CHANNELS } from "@/contracts/content-update.js";

describe("Electron renderer content updater binding", () => {
  it("accepts only the mounted renderer and removes both finite handlers on dispose", async () => {
    electron.handlers.clear();
    electron.protocols.clear();
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
      window: { webContents, async loadURL() {} },
    } as unknown as Parameters<typeof adapter.renderer.mount>[0]);

    const prepare = electron.handlers.get(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare)!;
    const apply = electron.handlers.get(ELECTRON_CONTENT_UPDATE_CHANNELS.apply)!;
    await expect(prepare({ sender: { id: 7 } })).rejects.toThrow("not the mounted renderer");
    await expect(prepare({ sender: webContents })).resolves.toMatchObject({ state: "current" });
    await expect(apply({ sender: webContents }, "yes")).rejects.toThrow("force flag must be boolean");
    await expect(apply({ sender: webContents }, true)).resolves.toMatchObject({ state: "blocked", reason: "transition-active" });
    expect(prepareLatest).toHaveBeenCalledWith("observe");
    expect(applyNow).toHaveBeenCalledWith({ force: true });
    expect(electron.protocols).toEqual(new Set(["od"]));
    expect(listeners.size).toBe(3);

    await lease.dispose();
    expect(electron.handlers.size).toBe(0);
    expect(electron.protocols.size).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it("removes renderer security and finite handlers when the document fails to load", async () => {
    electron.handlers.clear();
    electron.protocols.clear();
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
      window: { webContents, async loadURL() { throw new Error("load failed"); } },
    } as unknown as Parameters<typeof adapter.renderer.mount>[0])).rejects.toThrow("load failed");
    expect(electron.handlers.size).toBe(0);
    expect(electron.protocols.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
});
