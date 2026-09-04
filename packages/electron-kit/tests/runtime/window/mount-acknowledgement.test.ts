import { describe, expect, it, vi } from "vitest";

import {
  ELECTRON_RENDERER_MOUNT_CHANNEL,
  createElectronRendererMountAcknowledgement,
  installElectronRendererMountBarrier,
  serializeElectronRendererMountAcknowledgement,
  type ElectronRendererMountIpc,
} from "@/runtime/window/mount-acknowledgement.js";
import { parseElectronRendererMountAcknowledgement } from "@/runtime/window/mount-protocol.js";

function fixtureIpc() {
  const listeners = new Map<string, Set<(event: { sender: unknown }, payload: unknown) => void>>();
  const ipc: ElectronRendererMountIpc = {
    on(channel, listener) {
      const registered = listeners.get(channel) ?? new Set();
      registered.add(listener);
      listeners.set(channel, registered);
    },
    removeListener(channel, listener) { listeners.get(channel)?.delete(listener); },
  };
  return {
    ipc,
    emit(channel: string, sender: unknown, payload: unknown) {
      for (const listener of listeners.get(channel) ?? []) listener({ sender }, payload);
    },
    listenerCount(channel: string) { return listeners.get(channel)?.size ?? 0; },
  };
}

describe("Electron renderer mount acknowledgement", () => {
  it("creates a nonce-bearing challenge fenced by startup attempt and binding", () => {
    const first = createElectronRendererMountAcknowledgement({ attemptId: "attempt-1", bindingDigest: "binding-1" });
    const second = createElectronRendererMountAcknowledgement({ attemptId: "attempt-1", bindingDigest: "binding-1" });
    expect(first).toMatchObject({
      attemptId: "attempt-1",
      bindingDigest: "binding-1",
      channel: ELECTRON_RENDERER_MOUNT_CHANNEL,
    });
    expect(first.nonce).toHaveLength(43);
    expect(second.nonce).not.toBe(first.nonce);
    const argument = serializeElectronRendererMountAcknowledgement(first);
    expect(argument).toMatch(/^--electron-renderer-mount=/u);
    expect(parseElectronRendererMountAcknowledgement([argument])).toEqual(first);
  });

  it("accepts exactly one acknowledgement from the bound renderer", async () => {
    const fixture = fixtureIpc();
    const sender = {};
    const acknowledgement = createElectronRendererMountAcknowledgement({ attemptId: "attempt-1", bindingDigest: "binding-1" });
    const barrier = installElectronRendererMountBarrier({
      acknowledgement,
      ipc: fixture.ipc,
      sender,
      signal: new AbortController().signal,
    });
    const settled = vi.fn();
    void barrier.ready.then(settled);
    fixture.emit(acknowledgement.channel, {}, acknowledgement);
    fixture.emit(acknowledgement.channel, sender, { ...acknowledgement, bindingDigest: "stale" });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    fixture.emit(acknowledgement.channel, sender, acknowledgement);
    await expect(barrier.ready).resolves.toBeUndefined();
    expect(fixture.listenerCount(acknowledgement.channel)).toBe(0);
    fixture.emit(acknowledgement.channel, sender, acknowledgement);
    expect(settled).toHaveBeenCalledOnce();
  });

  it("rejects and detaches when the warmup attempt is aborted", async () => {
    const fixture = fixtureIpc();
    const controller = new AbortController();
    const acknowledgement = createElectronRendererMountAcknowledgement({ attemptId: "attempt-1", bindingDigest: "binding-1" });
    const barrier = installElectronRendererMountBarrier({ acknowledgement, ipc: fixture.ipc, sender: {}, signal: controller.signal });
    const reason = new Error("renderer deadline exceeded");
    controller.abort(reason);
    await expect(barrier.ready).rejects.toBe(reason);
    expect(fixture.listenerCount(acknowledgement.channel)).toBe(0);
  });
});
