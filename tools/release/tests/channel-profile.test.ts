import { describe, expect, it } from "vitest";

import { nextCountedReleaseVersion, parseCountedReleaseMetadata } from "../src/channel/counted-version.js";
import { countedReleaseChannelProfile, releaseChannelProfile } from "../src/channel/profiles.js";

describe("registered release channel profiles", () => {
  it("keeps activation policy explicit per release ritual", () => {
    expect(releaseChannelProfile("beta")).toMatchObject({
      activation: "accepted-publication",
      counted: true,
      workflow: "release-beta",
    });
    expect(releaseChannelProfile("qa2")).toMatchObject({
      activation: "accepted-publication",
      channel: "qa2",
      workflow: "release-beta",
    });
    expect(releaseChannelProfile("prerelease")).toMatchObject({ activation: "direct-latest", workflow: "release-prerelease" });
    expect(releaseChannelProfile("stable")).toMatchObject({
      activation: "stable-promotion",
      counted: false,
      releaseNoteRequired: true,
      stableFloor: "prerelease-metadata",
      workflow: "release-stable",
    });
  });

  it("rejects unregistered and non-counted channels", () => {
    expect(() => releaseChannelProfile("nightly-release")).toThrow(/RELEASE_CHANNEL must be/);
    expect(() => countedReleaseChannelProfile("stable")).toThrow(/not a counted release channel/);
  });

  it("normalizes generic and compatibility metadata fields", () => {
    const profile = countedReleaseChannelProfile("beta");
    expect(parseCountedReleaseMetadata(profile, JSON.stringify({
      baseVersion: "1.2.3",
      betaNumber: 4,
      betaVersion: "1.2.3-beta.4",
    }))).toEqual({ baseVersion: "1.2.3", releaseNumber: 4, releaseVersion: "1.2.3-beta.4" });
    expect(parseCountedReleaseMetadata(profile, JSON.stringify({
      baseVersion: "1.2.3",
      releaseNumber: 5,
      releaseVersion: "1.2.3-beta.5",
    }))).toEqual({ baseVersion: "1.2.3", releaseNumber: 5, releaseVersion: "1.2.3-beta.5" });
  });

  it("increments only within the same base version", () => {
    const profile = countedReleaseChannelProfile("preview");
    expect(nextCountedReleaseVersion({
      allowRegression: false,
      baseVersion: "1.3.0",
      latest: { baseVersion: "1.2.0", releaseNumber: 9, releaseVersion: "1.2.0-preview.9" },
      profile,
    })).toMatchObject({ releaseNumber: 1, releaseVersion: "1.3.0-preview.1" });
    expect(nextCountedReleaseVersion({
      allowRegression: false,
      baseVersion: "1.3.0",
      latest: { baseVersion: "1.3.0", releaseNumber: 2, releaseVersion: "1.3.0-preview.2" },
      profile,
    })).toMatchObject({ releaseNumber: 3, releaseVersion: "1.3.0-preview.3" });
  });
});
