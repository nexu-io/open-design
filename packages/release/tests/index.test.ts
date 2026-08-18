import { describe, expect, it } from "vitest";

import {
  formatReleaseVersion,
  compareReleaseBaseVersions,
  parseReleaseBaseVersion,
  parseReleaseVersion,
  releaseChannelDescriptor,
  releaseChannelFromNamespace,
  releaseChannelFromVersion,
  releaseInstallIdentity,
  releaseMetadataVersionFields,
  releaseNamespace,
  releaseNamespaceCandidates,
} from "../src/index.js";

describe("@open-design/release", () => {
  it("formats and parses counted release versions", () => {
    expect(formatReleaseVersion("prerelease", "1.2.3", 4)).toBe("1.2.3-prerelease.4");
    expect(parseReleaseVersion("1.2.3-prerelease.4", "prerelease")).toEqual({
      baseVersion: "1.2.3",
      channel: "prerelease",
      number: 4,
      releaseVersion: "1.2.3-prerelease.4",
    });
  });

  it("parses and compares stable base versions", () => {
    expect(parseReleaseBaseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseReleaseBaseVersion("1.2")).toBeNull();
    expect(compareReleaseBaseVersions([1, 2, 4], [1, 2, 3])).toBe(1);
    expect(compareReleaseBaseVersions([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(compareReleaseBaseVersions([1, 2, 3], [1, 3, 0])).toBe(-1);
  });

  it("derives metadata fields from the channel descriptor", () => {
    expect(releaseMetadataVersionFields("stable", "1.2.3")).toEqual({
      baseVersion: "1.2.3",
      releaseVersion: "1.2.3",
      stableVersion: "1.2.3",
    });
    expect(releaseMetadataVersionFields("preview", "1.2.3-preview.5")).toMatchObject({
      baseVersion: "1.2.3",
      releaseNumber: 5,
      releaseVersion: "1.2.3-preview.5",
    });
    expect(releaseMetadataVersionFields("betas", "1.2.3-betas.6")).toMatchObject({
      baseVersion: "1.2.3",
      releaseNumber: 6,
      releaseVersion: "1.2.3-betas.6",
    });
  });

  it("centralizes release identity and namespace derivation", () => {
    expect(releaseChannelDescriptor("prerelease").productName).toBe("Open Design Prerelease");
    expect(releaseChannelDescriptor("betas").productName).toBe("Open Design Betas");
    expect(releaseInstallIdentity("prerelease")).toEqual({
      appId: "io.open-design.desktop.prerelease",
      executableName: "Open Design Prerelease",
      productName: "Open Design Prerelease",
    });
    expect(releaseNamespace("prerelease")).toBe("release-prerelease");
    expect(releaseNamespace("prerelease", "win")).toBe("release-prerelease-win");
    expect(releaseNamespace("prerelease", "macIntel")).toBe("release-prerelease-intel");
    expect(releaseNamespace("betas", "win")).toBe("release-betas-win");
  });

  // Regression coverage for nexu-io/open-design#6425: every channel/platform
  // pair with no known legacy alias must resolve to exactly the canonical
  // releaseNamespace() value, and the one known outlier (beta on Intel mac,
  // where release-beta.yml bakes "release-beta-x64" instead of the standard
  // "-intel" suffix every other channel's Intel-mac build uses) must return
  // the canonical name FIRST, then the alias.
  it("surfaces legacy namespace aliases alongside the canonical name", () => {
    expect(releaseNamespaceCandidates("beta", "macIntel")).toEqual(["release-beta-intel", "release-beta-x64"]);
    expect(releaseNamespaceCandidates("prerelease", "macIntel")).toEqual(["release-prerelease-intel"]);
    expect(releaseNamespaceCandidates("preview", "macIntel")).toEqual(["release-preview-intel"]);
    expect(releaseNamespaceCandidates("beta", "mac")).toEqual(["release-beta"]);
    expect(releaseNamespaceCandidates("beta", "win")).toEqual(["release-beta-win"]);
    expect(releaseNamespaceCandidates("stable")).toEqual(["release-stable"]);
  });

  it("infers release channels from versions and namespaces", () => {
    expect(releaseChannelFromVersion("1.2.3-beta.1")).toBe("beta");
    expect(releaseChannelFromVersion("1.2.3-betas.1")).toBe("betas");
    expect(releaseChannelFromVersion("1.2.3-prerelease.1")).toBe("prerelease");
    expect(releaseChannelFromNamespace("release-preview-linux")).toBe("preview");
    expect(releaseChannelFromNamespace("release-betas-win")).toBe("betas");
    expect(releaseChannelFromNamespace("open-design")).toBe("stable");
    expect(releaseChannelFromNamespace("beta-local-flow")).toBeNull();
  });
});
