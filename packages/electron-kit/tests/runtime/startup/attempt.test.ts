import { describe, expect, it } from "vitest";

import { ElectronStartupAttemptFence } from "@/runtime/startup/attempt.js";

describe("Electron startup attempt fencing", () => {
  it("commits only the exact activation and generation binding in order", () => {
    const fence = new ElectronStartupAttemptFence("startup-1");
    const signal = fence.bind("a".repeat(64));
    fence.advance(signal, "runtime-ready");
    fence.advance(signal, "renderer-mounted");
    fence.advance(signal, "committed");
    expect(fence.phase).toBe("committed");
  });

  it("rejects a stale attempt, binding and skipped stage", () => {
    const fence = new ElectronStartupAttemptFence("startup-1");
    const signal = fence.bind("a".repeat(64));
    expect(() => fence.advance({ ...signal, attemptId: "startup-2" }, "runtime-ready")).toThrow("stale Electron startup signal");
    expect(() => fence.advance({ ...signal, bindingDigest: "b".repeat(64) }, "runtime-ready")).toThrow("stale Electron startup signal");
    expect(() => fence.advance(signal, "renderer-mounted")).toThrow("invalid Electron startup phase transition");
  });

  it("makes cancellation terminal for late readiness", () => {
    const fence = new ElectronStartupAttemptFence("startup-1");
    const signal = fence.bind("a".repeat(64));
    fence.cancel();
    expect(fence.accepts(signal)).toBe(false);
    expect(() => fence.advance(signal, "runtime-ready")).toThrow("cancelled");
    expect(fence.phase).toBe("cancelled");
  });
});
