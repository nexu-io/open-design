import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_DESKTOP_RUNTIME, resolveToolPackConfig } from "../src/config.js";

const savedTelemetryRelayUrl = process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
const savedPosthogKey = process.env.POSTHOG_KEY;
const savedPosthogHost = process.env.POSTHOG_HOST;

afterEach(() => {
  if (savedTelemetryRelayUrl == null) {
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  } else {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = savedTelemetryRelayUrl;
  }
  if (savedPosthogKey == null) {
    delete process.env.POSTHOG_KEY;
  } else {
    process.env.POSTHOG_KEY = savedPosthogKey;
  }
  if (savedPosthogHost == null) {
    delete process.env.POSTHOG_HOST;
  } else {
    process.env.POSTHOG_HOST = savedPosthogHost;
  }
});

describe("resolveToolPackConfig telemetry relay", () => {
  it("defaults to the Tauri desktop runtime during the transition window", () => {
    const config = resolveToolPackConfig("mac", { namespace: "runtime-default-test" });
    expect(DEFAULT_DESKTOP_RUNTIME).toBe("tauri");
    expect(config.desktopRuntime).toBe(DEFAULT_DESKTOP_RUNTIME);
    expect(config.tauriCliPath).toContain("@tauri-apps");
    expect(config.tauriConfigPath).toContain("apps/desktop/src-tauri/tauri.conf.json");
  });

  it("accepts the explicit Electron fallback without changing namespace-scoped roots", () => {
    const config = resolveToolPackConfig("mac", {
      desktopRuntime: "electron",
      namespace: "runtime-electron-test",
    });
    expect(config.desktopRuntime).toBe("electron");
    expect(config.roots.output.namespaceRoot).toContain("runtime-electron-test");
    expect(config.roots.runtime.namespaceRoot).toContain("runtime-electron-test");
  });

  it("rejects unsupported desktop runtimes", () => {
    expect(() => resolveToolPackConfig("mac", { desktopRuntime: "native" })).toThrow(
      /unsupported --desktop-runtime value: native/,
    );
  });

  it("reads and normalizes OPEN_DESIGN_TELEMETRY_RELAY_URL for packaged config", () => {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = "https://telemetry.open-design.ai/api/langfuse//";
    const config = resolveToolPackConfig("mac", { namespace: "telemetry-test" });
    expect(config.telemetryRelayUrl).toBe("https://telemetry.open-design.ai/api/langfuse");
  });

  it("rejects invalid telemetry relay URLs", () => {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = "not-a-url";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_TELEMETRY_RELAY_URL must be an absolute https URL/,
    );
  });

  it("rejects plaintext telemetry relay URLs for packaged config", () => {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = "http://telemetry.open-design.ai/api/langfuse";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_TELEMETRY_RELAY_URL must use https/,
    );
  });
});

describe("resolveToolPackConfig PostHog analytics", () => {
  it("bakes POSTHOG_KEY into packaged config when set at build time", () => {
    process.env.POSTHOG_KEY = "phc_test_abc123";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    const config = resolveToolPackConfig("mac", { namespace: "analytics-test" });
    expect(config.posthogKey).toBe("phc_test_abc123");
    expect(config.posthogHost).toBe("https://us.i.posthog.com");
  });

  it("omits POSTHOG_KEY for fork builds that lack the secret", () => {
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    const config = resolveToolPackConfig("mac", { namespace: "analytics-test" });
    expect(config.posthogKey).toBeUndefined();
    expect(config.posthogHost).toBeUndefined();
  });

  it("rejects POSTHOG_KEY values that contain whitespace", () => {
    process.env.POSTHOG_KEY = "phc_test abc";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /POSTHOG_KEY contains whitespace/,
    );
  });

  it("rejects invalid POSTHOG_HOST URLs", () => {
    process.env.POSTHOG_KEY = "phc_test_abc";
    process.env.POSTHOG_HOST = "not-a-url";
    expect(() => resolveToolPackConfig("mac")).toThrow(/POSTHOG_HOST must be an absolute URL/);
  });

  it("strips trailing slashes from POSTHOG_HOST", () => {
    process.env.POSTHOG_KEY = "phc_test_abc";
    process.env.POSTHOG_HOST = "https://eu.i.posthog.com///";
    const config = resolveToolPackConfig("mac");
    expect(config.posthogHost).toBe("https://eu.i.posthog.com");
  });
});
