import { describe, expect, it, vi } from "vitest";

import { completeElectronShutdown } from "@/runtime/session/shutdown.js";

describe("Electron shutdown ownership", () => {
  it("destroys the last window only after lifecycle, activation, and diagnostics finish", async () => {
    const order: string[] = [];
    await completeElectronShutdown({
      waitForHeartbeat: () => { order.push("heartbeat"); },
      releaseRendererIntegration: () => { order.push("renderer-integration"); },
      disposeWarmup: () => { order.push("warmup"); },
      releaseStandalone: () => { order.push("standalone"); },
      stopActivation: () => { order.push("activation"); },
      observe: () => { order.push("observe"); },
      flushObservation: () => { order.push("flush"); },
      destroyWindow: () => { order.push("window"); },
    });
    expect(order).toEqual([
      "heartbeat",
      "renderer-integration",
      "warmup",
      "standalone",
      "activation",
      "observe",
      "flush",
      "window",
    ]);
  });

  it("attempts every owner and destroys the window before reporting aggregate failure", async () => {
    const destroyWindow = vi.fn();
    const stopActivation = vi.fn();
    await expect(completeElectronShutdown({
      waitForHeartbeat: () => undefined,
      releaseRendererIntegration: () => { throw new Error("renderer release failed"); },
      disposeWarmup: () => undefined,
      releaseStandalone: () => { throw new Error("Standalone release failed"); },
      stopActivation,
      observe: () => undefined,
      flushObservation: () => undefined,
      destroyWindow,
    })).rejects.toThrow(/shutdown failed/u);
    expect(stopActivation).toHaveBeenCalledOnce();
    expect(destroyWindow).toHaveBeenCalledOnce();
  });
});
