import { describe, expect, it } from "vitest";

import { electronBuilderVersionForAppVersion, versionCoreForAppVersion, versionFamilyForAppVersion } from "../src/versions.js";

describe("tools-pack version helpers", () => {
  it("keeps runtime app versions intact for electron-builder", () => {
    expect(electronBuilderVersionForAppVersion("0.8.0")).toBe("0.8.0");
    expect(electronBuilderVersionForAppVersion("0.8.0-beta.6")).toBe("0.8.0-beta.6");
    expect(electronBuilderVersionForAppVersion("0.8.0-preview.1")).toBe("0.8.0-preview.1");
    expect(electronBuilderVersionForAppVersion("0.8.0-prerelease.2")).toBe("0.8.0-prerelease.2");
  });

  it("collapses prerelease build counters down to the X.Y.Z cache line", () => {
    expect(versionCoreForAppVersion("0.8.0")).toBe("0.8.0");
    expect(versionCoreForAppVersion("0.8.0-beta.6")).toBe("0.8.0");
    expect(versionCoreForAppVersion("0.8.0-preview.1")).toBe("0.8.0");
    expect(versionCoreForAppVersion("0.8.0-prerelease.2")).toBe("0.8.0");
  });

  it("collapses app versions down to the X.Y cache family", () => {
    expect(versionFamilyForAppVersion("0.9.0")).toBe("0.9");
    expect(versionFamilyForAppVersion("0.9.1-beta.6")).toBe("0.9");
    expect(versionFamilyForAppVersion("0.9.1-preview.1")).toBe("0.9");
    expect(versionFamilyForAppVersion("1.10.2-prerelease.3")).toBe("1.10");
    expect(versionFamilyForAppVersion("not-semver")).toBeNull();
  });
});
