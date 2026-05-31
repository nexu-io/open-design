import { describe, expect, it } from "vitest";

import { releaseAppVersionArgs, resolvePackagedWinInstallIdentity } from "@/vitest/packaged-win-identity";

describe("packaged windows smoke identity", () => {
  it("lets a nightly release version override the stable release namespace", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-stable-win",
      releaseVersion: "0.8.0.nightly.2",
    })).toEqual({
      displayName: "Open Design Nightly",
      namespaceToken: "release-stable-win",
    });
    expect(releaseAppVersionArgs("0.8.0.nightly.2")).toEqual(["--app-version", "0.8.0.nightly.2"]);
  });

  it("keeps stable release namespaces on the canonical display identity", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-stable-win",
      releaseVersion: "0.8.0",
    })).toEqual({
      displayName: "Open Design",
      namespaceToken: "release-stable-win",
    });
    expect(resolvePackagedWinInstallIdentity({
      namespace: "default",
      releaseVersion: undefined,
    })).toEqual({
      displayName: "Open Design",
      namespaceToken: "default",
    });
  });

  it("matches first-class preview and beta release identities", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-stable-win",
      releaseVersion: "0.8.0-preview.1",
    }).displayName).toBe("Open Design Preview");
    expect(resolvePackagedWinInstallIdentity({
      namespace: "release-beta-win",
      releaseVersion: undefined,
    }).displayName).toBe("Open Design Beta");
  });

  it("keeps ad hoc namespaces isolated from release channel identities", () => {
    expect(resolvePackagedWinInstallIdentity({
      namespace: "beta-local-flow",
      releaseVersion: undefined,
    })).toEqual({
      displayName: "Open Design beta-local-flow",
      namespaceToken: "beta-local-flow",
    });
    expect(releaseAppVersionArgs("   ")).toEqual([]);
  });
});
