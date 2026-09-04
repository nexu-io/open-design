import { describe, expect, it, vi } from "vitest";

import {
  completeElectronStartupCancellation,
  installElectronStartupQuitBarrier,
  isElectronStartupCancelledError,
  type ElectronStartupQuitEvent,
} from "@/runtime/startup/cancellation.js";

function fixtureApp() {
  let listener: ((event: ElectronStartupQuitEvent) => void) | null = null;
  return {
    app: {
      on: vi.fn((_event: "before-quit", next: (event: ElectronStartupQuitEvent) => void) => { listener = next; }),
      removeListener: vi.fn((_event: "before-quit", current: (event: ElectronStartupQuitEvent) => void) => {
        if (listener === current) listener = null;
      }),
      quit: vi.fn(),
    },
    emit(event: ElectronStartupQuitEvent) { listener?.(event); },
  };
}

describe("Electron startup quit barrier", () => {
  it("cancels synchronously, cleans once, and quits only after cleanup", async () => {
    const fixture = fixtureApp();
    const order: string[] = [];
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const barrier = installElectronStartupQuitBarrier({
      app: fixture.app,
      cancelAttempt: () => { order.push("cancel"); },
      async cleanup() { order.push("cleanup"); await cleanupGate; order.push("released"); },
    });
    const first = { preventDefault: vi.fn() };
    const repeated = { preventDefault: vi.fn() };
    fixture.emit(first);
    fixture.emit(repeated);
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(repeated.preventDefault).toHaveBeenCalledOnce();
    expect(barrier.cancelled).toBe(true);
    expect(fixture.app.quit).not.toHaveBeenCalled();
    releaseCleanup();
    await barrier.settled;
    expect(order).toEqual(["cancel", "cleanup", "released"]);
    expect(fixture.app.quit).toHaveBeenCalledOnce();
  });

  it("rejects guarded startup work but consumes cleanup failure before quitting", async () => {
    const fixture = fixtureApp();
    const observeFailure = vi.fn();
    const barrier = installElectronStartupQuitBarrier({
      app: fixture.app,
      cancelAttempt: () => undefined,
      cleanup: () => { throw new Error("release failed"); },
      observeFailure,
    });
    const pending = barrier.guard(new Promise<void>(() => undefined));
    fixture.emit({ preventDefault: vi.fn() });
    await expect(pending).rejects.toSatisfy(isElectronStartupCancelledError);
    await barrier.settled;
    expect(observeFailure).toHaveBeenCalledWith(expect.objectContaining({ message: "release failed" }));
    expect(fixture.app.quit).toHaveBeenCalledOnce();
  });

  it("removes itself after commit and no longer intercepts runtime quit", () => {
    const fixture = fixtureApp();
    const cleanup = vi.fn();
    const barrier = installElectronStartupQuitBarrier({ app: fixture.app, cancelAttempt: vi.fn(), cleanup });
    barrier.commit();
    fixture.emit({ preventDefault: vi.fn() });
    expect(cleanup).not.toHaveBeenCalled();
    expect(fixture.app.removeListener).toHaveBeenCalledOnce();
  });

  it("lets startup failure reuse cleanup without converting it into a normal quit", async () => {
    const fixture = fixtureApp();
    const failure = new Error("bootstrap failed");
    const cleanup = vi.fn();
    const barrier = installElectronStartupQuitBarrier({ app: fixture.app, cancelAttempt: vi.fn(), cleanup });
    await barrier.cancel(failure);
    expect(cleanup).toHaveBeenCalledWith(failure);
    expect(fixture.app.quit).not.toHaveBeenCalled();
  });
});

describe("Electron startup cancellation ownership", () => {
  it("waits for in-flight owners and attempts every release before destroying windows", async () => {
    const order: string[] = [];
    await completeElectronStartupCancellation({
      disposeWarmup: () => { order.push("warmup"); },
      settleRendererMount: () => { order.push("renderer-settled"); },
      releaseRendererIntegration: () => { order.push("renderer-release"); },
      releaseStandaloneAttachment: () => { order.push("standalone"); },
      failActivation: () => { order.push("activation"); },
      observe: () => { order.push("observe"); },
      flushObservation: () => { order.push("flush"); },
      destroyWindows: () => { order.push("windows"); },
    });
    expect(order).toEqual(["warmup", "renderer-settled", "renderer-release", "standalone", "activation", "observe", "flush", "windows"]);
  });

  it("destroys windows after best-effort release and reports aggregate failure", async () => {
    const releaseStandaloneAttachment = vi.fn();
    const destroyWindows = vi.fn();
    await expect(completeElectronStartupCancellation({
      disposeWarmup: () => { throw new Error("warmup failed"); },
      settleRendererMount: () => undefined,
      releaseRendererIntegration: () => { throw new Error("renderer failed"); },
      releaseStandaloneAttachment,
      failActivation: () => undefined,
      observe: () => undefined,
      flushObservation: () => undefined,
      destroyWindows,
    })).rejects.toThrow("startup cancellation failed");
    expect(releaseStandaloneAttachment).toHaveBeenCalledOnce();
    expect(destroyWindows).toHaveBeenCalledOnce();
  });
});
