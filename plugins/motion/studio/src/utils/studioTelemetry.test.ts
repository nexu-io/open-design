// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { trackStudioEvent, flushViaBeacon } from "./studioTelemetry";

vi.mock("../telemetry/policy", () => ({ browserTelemetryAllowed: () => true }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("has no transport even if an upstream caller enables measurement", async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  vi.stubGlobal("navigator", { sendBeacon: send });
  trackStudioEvent("edit", { project: "private project" });
  await vi.advanceTimersByTimeAsync(31_000);
  flushViaBeacon();
  expect(send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
