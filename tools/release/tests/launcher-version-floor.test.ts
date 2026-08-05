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

/**
 * The floor's operational shape, pinned against the real channel version
 * formats rather than illustrative ones.
 *
 * Setting a floor is a rare, deliberate act — it is how a release whose Electron
 * outer shell changed reaches installs that can only take payload updates. The
 * two rules below interact in a way that is invisible until publish time, and
 * publish time is a release outage:
 *
 *  - a non-stable channel with no pair of its own inherits STABLE's pair, and
 *  - a floor above the release version hard-fails publication.
 *
 * A bare stable floor (`0.17.0`) sorts ABOVE every same-base prerelease version
 * (`0.17.0-beta.N`), so inheriting it into the daily beta/preview/prerelease
 * lanes fails them all. These specs name that trap and pin the configuration
 * that avoids it: one explicit pair per active lane, each in its own lane's
 * version format.
 */
describe("launcher version floor operational configuration", () => {
  const STABLE_RELEASE = "0.17.0";
  const HELP_URL = "https://example.test/download";

  const stableOnly: NodeJS.ProcessEnv = {
    RELEASE_LAUNCHER_VERSION_MIN_STABLE: STABLE_RELEASE,
    RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: HELP_URL,
  };

  function publish(channel: Parameters<typeof resolveLauncherVersionFloor>[0], env: NodeJS.ProcessEnv, releaseVersion: string): void {
    const floor = resolveLauncherVersionFloor(channel, env);
    if (floor != null) assertLauncherVersionFloorSatisfiable(floor, releaseVersion);
  }

  it("lets a bare stable floor publish its own lane", () => {
    expect(() => publish("stable", stableOnly, STABLE_RELEASE)).not.toThrow();
    // And keeps working for later stable patches without being re-bumped.
    expect(() => publish("stable", stableOnly, "0.17.1")).not.toThrow();
  });

  it("breaks same-base non-stable lanes that inherit a bare stable floor", () => {
    // The trap. Each of these is a real lane that publishes on its own cadence,
    // and `0.17.0` > `0.17.0-<channel>.N` by semver.
    for (const [channel, releaseVersion] of [
      ["beta", "0.17.0-beta.3"],
      ["preview", "0.17.0-preview.1"],
      ["prerelease", "0.17.0-prerelease.1"],
    ] as const) {
      expect(() => publish(channel, stableOnly, releaseVersion)).toThrow(/exceeds release version/);
    }
  });

  it("stops breaking them once the base version moves past the floor", () => {
    // Why the trap is intermittent rather than permanent: it only bites while a
    // lane is still publishing the same base version the stable floor names.
    expect(() => publish("beta", stableOnly, "0.18.0-beta.1")).not.toThrow();
  });

  it("publishes every lane when each carries its own explicit pair", () => {
    const perChannel: NodeJS.ProcessEnv = {
      ...stableOnly,
      RELEASE_LAUNCHER_VERSION_MIN_BETA: "0.17.0-beta.1",
      RELEASE_LAUNCHER_VERSION_MIN_URL_BETA: HELP_URL,
      RELEASE_LAUNCHER_VERSION_MIN_PREVIEW: "0.17.0-preview.1",
      RELEASE_LAUNCHER_VERSION_MIN_URL_PREVIEW: HELP_URL,
      RELEASE_LAUNCHER_VERSION_MIN_PRERELEASE: "0.17.0-prerelease.1",
      RELEASE_LAUNCHER_VERSION_MIN_URL_PRERELEASE: HELP_URL,
    };
    for (const [channel, releaseVersion] of [
      ["stable", STABLE_RELEASE],
      ["beta", "0.17.0-beta.1"],
      ["beta", "0.17.0-beta.9"],
      ["preview", "0.17.0-preview.1"],
      ["prerelease", "0.17.0-prerelease.1"],
    ] as const) {
      expect(() => publish(channel, perChannel, releaseVersion)).not.toThrow();
    }
  });
});
