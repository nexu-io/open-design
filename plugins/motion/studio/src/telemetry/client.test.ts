// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { shouldTrack, trackEvent } from "./client";
import { trackStudioEvent, flushViaBeacon } from "../utils/studioTelemetry";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("never sends upstream analytics, including production, explicit opt-in and tab close", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_HYPERFRAMES_NO_TELEMETRY", "0");
  localStorage.clear();
  window.__HF_CLI_TELEMETRY_DISABLED = false;
  const send = vi.fn().mockResolvedValue(new Response());
  const beacon = vi.fn();
  vi.stubGlobal("fetch", send);
  vi.stubGlobal("navigator", { doNotTrack: "0", sendBeacon: beacon });
  // Call the real transports even if their policy is accidentally re-enabled.
  trackEvent("render_complete", { duration: 1 });
  trackStudioEvent("edit", { project: "private project" });
  await vi.advanceTimersByTimeAsync(31_000);
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("visibilitychange"));
  flushViaBeacon();
  expect(shouldTrack()).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(beacon).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  delete window.__HF_CLI_TELEMETRY_DISABLED;
});
