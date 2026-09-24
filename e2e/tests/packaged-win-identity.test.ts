import { describe, expect, it } from "vitest";

import { releaseAppVersionArgs, resolvePackagedWinInstallIdentity } from "@/vitest/packaged-win-identity";

describe("packaged windows smoke identity", () => {
  it("[P2] lets a prerelease version override the stable release namespace", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-stable-win",
      releaseVersion: "0.8.0-prerelease.2",
    })).toEqual({
      displayName: "OpenDesign Prerelease",
      namespaceToken: "release-stable-win",
      productName: "Open Design Prerelease",
    });
    expect(releaseAppVersionArgs("0.8.0-prerelease.2")).toEqual(["--app-version", "0.8.0-prerelease.2"]);
  });

  it("[P2] keeps stable release namespaces on the canonical display identity", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-stable-win",
      releaseVersion: "0.8.0",
    })).toEqual({
      displayName: "OpenDesign",
      namespaceToken: "release-stable-win",
      productName: "Open Design",
    });
    expect(resolvePackagedWinInstallIdentity({
      namespace: "default",
      releaseVersion: undefined,
    })).toEqual({
      displayName: "OpenDesign",
      namespaceToken: "default",
      productName: "Open Design",
    });
  });

  it("[P2] matches first-class preview and beta release identities", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-stable-win",
      releaseVersion: "0.8.0-preview.1",
    })).toEqual({
      displayName: "OpenDesign Preview",
      namespaceToken: "release-stable-win",
      productName: "Open Design Preview",
    });
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-beta-win",
      releaseVersion: undefined,
    })).toEqual({
      displayName: "OpenDesign Beta",
      namespaceToken: "release-beta-win",
      productName: "Open Design Beta",
    });
  });

  it("[P2] keeps ad hoc namespaces isolated from release channel identities", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "beta-local-flow",
      releaseVersion: undefined,
    })).toEqual({
      displayName: "Open Design beta-local-flow",
      namespaceToken: "beta-local-flow",
      productName: "Open Design beta-local-flow",
    });
    expect(releaseAppVersionArgs("   ")).toEqual([]);
  });
});
