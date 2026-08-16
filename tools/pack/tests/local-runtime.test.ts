import { describe, expect, it } from "vitest";

import { resolvePackagedUpdateEnabled } from "../src/local-runtime.js";

describe("resolvePackagedUpdateEnabled", () => {
  it("persists the disabled override for a genuinely local package", () => {
    expect(resolvePackagedUpdateEnabled({
      debugChannel: "local",
      namespace: "local",
    })).toBe(false);
  });

  it.each([
    ["beta", "release-beta-win", "0.19.4-beta.12"],
    ["prerelease", "release-prerelease-win", "0.19.4-prerelease.3"],
    ["stable", "default", "0.19.4"],
  ] as const)("lets packaged %s releases use the updater default", (_channel, namespace, releaseVersion) => {
    expect(resolvePackagedUpdateEnabled({
      debugChannel: "local",
      namespace,
      releaseVersion,
    })).toBeUndefined();
  });

  it("lets an explicitly selected exact debug product use the updater default", () => {
    expect(resolvePackagedUpdateEnabled({
      debugChannel: "beta",
      namespace: "release-beta-win",
    })).toBeUndefined();
  });
});
