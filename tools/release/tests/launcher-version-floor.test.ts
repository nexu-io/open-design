import { describe, expect, it } from "vitest";

import {
  assertLauncherVersionFloorSatisfiable,
  resolveLauncherVersionFloor,
} from "../src/storage/launcher-version-floor.js";

describe("launcher version floor channel policy", () => {
  it("resolves the channel-specific pair when the channel min is set", () => {
    const floor = resolveLauncherVersionFloor("beta", {
      RELEASE_LAUNCHER_VERSION_MIN_BETA: "1.2.0-beta.3",
      RELEASE_LAUNCHER_VERSION_MIN_URL_BETA: "https://example.test/beta-help",
      RELEASE_LAUNCHER_VERSION_MIN_STABLE: "1.1.0",
      RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: "https://example.test/stable-help",
    });
    expect(floor).toEqual({ min: "1.2.0-beta.3", url: "https://example.test/beta-help" });
  });

  it("falls back to the stable pair as a unit when the channel pair is unset", () => {
    // Pair-level fallback: a channel never mixes its own fields with stable's —
    // channel policy is one coherent pair.
    const floor = resolveLauncherVersionFloor("preview", {
      RELEASE_LAUNCHER_VERSION_MIN_STABLE: "1.1.0",
      RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: "https://example.test/stable-help",
    });
    expect(floor).toEqual({ min: "1.1.0", url: "https://example.test/stable-help" });
  });

  it("rejects an orphan channel url instead of silently falling back", () => {
    // An operator who set the channel url but not its min made a
    // misconfiguration; hiding it behind the stable fallback would silently
    // drop their intent.
    expect(() =>
      resolveLauncherVersionFloor("preview", {
        RELEASE_LAUNCHER_VERSION_MIN_URL_PREVIEW: "https://example.test/preview-only-url",
        RELEASE_LAUNCHER_VERSION_MIN_STABLE: "1.1.0",
      }),
    ).toThrow(/URL_PREVIEW requires RELEASE_LAUNCHER_VERSION_MIN_PREVIEW/);
  });

  it("resolves stable from its own pair only", () => {
    expect(
      resolveLauncherVersionFloor("stable", {
        RELEASE_LAUNCHER_VERSION_MIN_STABLE: "1.1.0",
      }),
    ).toEqual({ min: "1.1.0" });
  });

  it("returns null when neither the channel nor stable defines a floor", () => {
    expect(resolveLauncherVersionFloor("betas", {})).toBeNull();
    expect(resolveLauncherVersionFloor("stable", {})).toBeNull();
  });

  it("treats empty-string vars as unset (GitHub passes unset vars as empty)", () => {
    expect(
      resolveLauncherVersionFloor("beta", {
        RELEASE_LAUNCHER_VERSION_MIN_BETA: "",
        RELEASE_LAUNCHER_VERSION_MIN_STABLE: "",
      }),
    ).toBeNull();
  });

  it("rejects a channel url without a channel min at the source pair", () => {
    expect(() =>
      resolveLauncherVersionFloor("stable", {
        RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: "https://example.test/orphan",
      }),
    ).toThrow(/URL_STABLE requires RELEASE_LAUNCHER_VERSION_MIN_STABLE/);
  });

  it("rejects malformed versions and non-http urls", () => {
    expect(() =>
      resolveLauncherVersionFloor("beta", { RELEASE_LAUNCHER_VERSION_MIN_BETA: "not-a-version" }),
    ).toThrow(/not a valid version/);
    expect(() =>
      resolveLauncherVersionFloor("beta", {
        RELEASE_LAUNCHER_VERSION_MIN_BETA: "1.0.0",
        RELEASE_LAUNCHER_VERSION_MIN_URL_BETA: "ftp://example.test/help",
      }),
    ).toThrow(/http\(s\) URL/);
  });

  it("rejects a floor above the release version", () => {
    expect(() =>
      assertLauncherVersionFloorSatisfiable({ min: "2.0.0" }, "1.2.3-beta.4"),
    ).toThrow(/exceeds release version/);
    expect(() =>
      assertLauncherVersionFloorSatisfiable({ min: "1.2.3-beta.4" }, "1.2.3-beta.4"),
    ).not.toThrow();
  });
});
