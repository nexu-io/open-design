import { afterEach, describe, expect, it } from "vitest";

import { resolveToolPackConfig } from "../src/config.js";

const savedTelemetryRelayUrl = process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
const savedPosthogKey = process.env.POSTHOG_KEY;
const savedPosthogHost = process.env.POSTHOG_HOST;
const savedAmrProfile = process.env.OPEN_DESIGN_AMR_PROFILE;

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
  if (savedAmrProfile == null) {
    delete process.env.OPEN_DESIGN_AMR_PROFILE;
  } else {
    process.env.OPEN_DESIGN_AMR_PROFILE = savedAmrProfile;
  }
});

describe("resolveToolPackConfig AMR profile", () => {
  it("bakes OPEN_DESIGN_AMR_PROFILE into packaged config when set at build time", () => {
    process.env.OPEN_DESIGN_AMR_PROFILE = "test";
    const config = resolveToolPackConfig("mac", { namespace: "amr-profile-test" });
    expect(config.amrProfile).toBe("test");
  });

  it("rejects unsupported AMR profiles before packaging", () => {
    process.env.OPEN_DESIGN_AMR_PROFILE = "staging";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_AMR_PROFILE must be prod, test, or local/,
    );
  });
});

describe("resolveToolPackConfig Vela CLI requirement", () => {
  it("defaults to optional Vela CLI bundling", () => {
    const config = resolveToolPackConfig("mac", { namespace: "vela-optional-test" });
    expect(config.requireVelaCli).toBe(false);
  });

  it("reads --require-vela-cli from build options", () => {
    const config = resolveToolPackConfig("mac", {
      namespace: "vela-required-test",
      requireVelaCli: true,
    });
    expect(config.requireVelaCli).toBe(true);
  });
});

describe("resolveToolPackConfig win build target", () => {
  it("accepts the portable zip target and rejects unsupported values", () => {
    expect(resolveToolPackConfig("win", { to: "zip" }).to).toBe("zip");
    expect(resolveToolPackConfig("win", { to: "all" }).to).toBe("all");
    expect(resolveToolPackConfig("win", { to: "nsis" }).to).toBe("nsis");
    expect(() => resolveToolPackConfig("win", { to: "dmg" })).toThrow(/unsupported win --to target: dmg/);
  });
});

describe("resolveToolPackConfig namespace defaults", () => {
  it("keeps ordinary local builds on the default namespace", () => {
    expect(resolveToolPackConfig("mac").namespace).toBe("default");
    expect(resolveToolPackConfig("win", { appVersion: "0.8.0" }).namespace).toBe("default");
  });

  it("defaults prerelease mac builds to their release channel namespace", () => {
    expect(resolveToolPackConfig("mac", { appVersion: "0.8.0-beta.4" }).namespace).toBe("release-beta");
    expect(resolveToolPackConfig("mac", { appVersion: "0.8.0-preview.4" }).namespace).toBe("release-preview");
    expect(resolveToolPackConfig("mac", { appVersion: "0.8.0.nightly.4" }).namespace).toBe("release-nightly");
  });

  it("defaults prerelease non-mac builds to platform-specific release channel namespaces", () => {
    expect(resolveToolPackConfig("win", { appVersion: "0.8.0-beta.4" }).namespace).toBe("release-beta-win");
    expect(resolveToolPackConfig("linux", { appVersion: "0.8.0-preview.4" }).namespace).toBe("release-preview-linux");
    expect(resolveToolPackConfig("win", { appVersion: "0.8.0.nightly.4" }).namespace).toBe("release-nightly-win");
  });

  it("keeps an explicit namespace ahead of the prerelease channel default", () => {
    expect(resolveToolPackConfig("mac", { appVersion: "0.8.0-beta.4", namespace: "custom-beta" }).namespace).toBe(
      "custom-beta",
    );
  });
});

describe("resolveToolPackConfig telemetry relay", () => {
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
