import { describe, expect, it, vi } from "vitest";
import type { ElectronRendererLease } from "@/contracts/index.js";
import { mountElectronRendererLease, replaceElectronRendererLease } from "@/runtime/window/renderer-mount.js";

function lease(name: string, events: string[]): ElectronRendererLease {
  return { window: {} as ElectronRendererLease["window"], releaseIntegration: async () => { events.push(`${name}:release`); }, destroy: () => { events.push(`${name}:destroy`); } };
}

describe("Electron renderer generation mount", () => {
  it("retires the old binding handlers, mounts the new generation, then reveals and destroys the stale window", async () => {
    const events: string[] = [], previous = lease("old", events), next = lease("new", events);
    const replaced = await replaceElectronRendererLease({
      previous,
      async mount() { events.push("new:mounted"); return next; },
      reveal(value) { expect(value).toBe(next); events.push("new:reveal"); },
    });
    expect(replaced).toBe(next);
    expect(events).toEqual(["old:release", "new:mounted", "new:reveal", "old:destroy"]);
  });

  it("does not leave the old retired endpoint visible after remount failure", async () => {
    const events: string[] = [], reveal = vi.fn();
    await expect(replaceElectronRendererLease({ previous: lease("old", events), mount: async () => { throw new Error("new mount failed"); }, reveal })).rejects.toThrow("new mount failed");
    expect(reveal).not.toHaveBeenCalled();
    expect(events).toEqual(["old:release", "old:destroy"]);
  });

  it("cleans both generations if reveal is cancelled by shutdown", async () => {
    const events: string[] = [];
    await expect(replaceElectronRendererLease({ previous: lease("old", events), mount: async () => lease("new", events), reveal() { throw new Error("closing"); } })).rejects.toThrow("closing");
    expect(events).toEqual(["old:release", "new:release", "new:destroy", "old:destroy"]);
  });

  it("waits for the exact new sender/attempt acknowledgement and releases integration once", async () => {
    const acknowledgement = { attemptId: "new-attempt", bindingDigest: "b".repeat(64), channel: "mounted", nonce: "fresh" };
    let receive: (event: { sender: unknown }, value: unknown) => void = () => undefined;
    const window = { webContents: {}, isDestroyed: () => false, destroy: vi.fn() };
    const dispose = vi.fn(), mounted = vi.fn();
    const createWindow = vi.fn((_options: unknown) => window);
    const input = {
      context: { acknowledgement, manifest: {}, windowPolicy: { width: 800, height: 600, title: "test" } },
      createWindow,
      ipc: { on(_channel: string, listener: typeof receive) { receive = listener; }, removeListener: vi.fn() },
      renderer: { mount: async () => ({ dispose }) },
      signal: new AbortController().signal,
    } as unknown as Parameters<typeof mountElectronRendererLease>[0];
    const pending = mountElectronRendererLease(input);
    void pending.then(mounted);
    await Promise.resolve();
    receive({ sender: {} }, acknowledgement);
    receive({ sender: window.webContents }, { ...acknowledgement, attemptId: "old-attempt" });
    await Promise.resolve();
    expect(mounted).not.toHaveBeenCalled();
    receive({ sender: window.webContents }, acknowledgement);
    const current = await pending;
    expect(createWindow.mock.calls[0]?.[0]).toMatchObject({ show: false });
    await current.releaseIntegration(); await current.releaseIntegration();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
