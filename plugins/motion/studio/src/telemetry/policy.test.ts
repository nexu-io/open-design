// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each control the browser telemetry policy enforces, asserted individually.
// This is the SSOT that `telemetry/client.ts`, `utils/studioTelemetry.ts` and
// canary enrolment all consult, so a gap here is a gap in all three — which is
// how `navigator.doNotTrack` and Vite dev mode came to suppress one transport
// but not the other, nor enrolment.

const DOCUMENTED_OPT_OUT = "hyperframes-studio:telemetryDisabled";
const LEGACY_OPT_OUT = "hf-studio-telemetry-opt-out";

describe("browserTelemetryAllowed", () => {
  let browserTelemetryAllowed: typeof import("./policy").browserTelemetryAllowed;

  beforeEach(async () => {
    localStorage.clear();
    delete window.__HF_CLI_TELEMETRY_DISABLED;
    vi.resetModules();
    // vitest sets import.meta.env.DEV; the policy suppresses under it, so the
    // baseline has to be an explicitly production-like env.
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_HYPERFRAMES_NO_TELEMETRY", "");
    Object.defineProperty(navigator, "doNotTrack", { value: null, configurable: true });
    ({ browserTelemetryAllowed } = await import("./policy"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a CLI opt-out even when browser storage permits telemetry", () => {
    expect(browserTelemetryAllowed()).toBe(true);
    window.__HF_CLI_TELEMETRY_DISABLED = true;
    expect(browserTelemetryAllowed()).toBe(false);
    expect(localStorage.getItem(DOCUMENTED_OPT_OUT)).toBeNull();
    window.__HF_CLI_TELEMETRY_DISABLED = false;
    expect(browserTelemetryAllowed()).toBe(true);
  });

  it("allows telemetry with no control set", () => {
    expect(browserTelemetryAllowed()).toBe(true);
  });

  it("refuses when the documented localStorage key is set", () => {
    localStorage.setItem(DOCUMENTED_OPT_OUT, "1");
    expect(browserTelemetryAllowed()).toBe(false);
  });

  // Anyone already opted out this way must never be quietly re-enabled by the
  // move to the documented key.
  it("refuses when the legacy localStorage key is set", () => {
    localStorage.setItem(LEGACY_OPT_OUT, "1");
    expect(browserTelemetryAllowed()).toBe(false);
  });

  it("refuses when navigator.doNotTrack is on", () => {
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    expect(browserTelemetryAllowed()).toBe(false);
  });

  it("refuses under Vite dev mode", async () => {
    vi.stubEnv("DEV", true);
    vi.resetModules();
    ({ browserTelemetryAllowed } = await import("./policy"));
    expect(browserTelemetryAllowed()).toBe(false);
  });

  it.each(["1", "true", "yes", "on", " ON "])(
    "refuses when VITE_HYPERFRAMES_NO_TELEMETRY=%s",
    async (value) => {
      vi.stubEnv("VITE_HYPERFRAMES_NO_TELEMETRY", value);
      vi.resetModules();
      ({ browserTelemetryAllowed } = await import("./policy"));
      expect(browserTelemetryAllowed()).toBe(false);
    },
  );

  it("ignores an unset or unrelated VITE_HYPERFRAMES_NO_TELEMETRY value", async () => {
    vi.stubEnv("VITE_HYPERFRAMES_NO_TELEMETRY", "0");
    vi.resetModules();
    ({ browserTelemetryAllowed } = await import("./policy"));
    expect(browserTelemetryAllowed()).toBe(true);
  });

  it("is not memoized — a mid-session opt-out takes effect immediately", () => {
    expect(browserTelemetryAllowed()).toBe(true);
    localStorage.setItem(DOCUMENTED_OPT_OUT, "1");
    expect(browserTelemetryAllowed()).toBe(false);
  });
});
