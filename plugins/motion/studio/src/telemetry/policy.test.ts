// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { browserTelemetryAllowed } from "./policy";

afterEach(() => vi.unstubAllEnvs());
it.each(["", "0", "false", "1"])("refuses upstream measurement regardless of build opt-out %s", (value) => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_HYPERFRAMES_NO_TELEMETRY", value);
  localStorage.clear();
  expect(browserTelemetryAllowed()).toBe(false);
});
