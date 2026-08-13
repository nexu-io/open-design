import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import {
  electronBuilderVersionForShellVersion,
  readReleaseBindingVersion,
  versionCoreForShellVersion,
  versionFamilyForShellVersion,
} from "../src/versions.js";

describe("tools-pack version helpers", () => {
  it("keeps the release binding independent from reusable Shell bytes", async () => {
    await expect(readReleaseBindingVersion({
      releaseVersion: "0.19.0-beta.11",
      shellVersion: "0.19.0-beta.10",
    } as ToolPackConfig)).resolves.toBe("0.19.0-beta.11");
  });

  it("keeps Shell compatibility versions intact for electron-builder", () => {
    expect(electronBuilderVersionForShellVersion("0.8.0")).toBe("0.8.0");
    expect(electronBuilderVersionForShellVersion("0.8.0-beta.6")).toBe("0.8.0-beta.6");
    expect(electronBuilderVersionForShellVersion("0.8.0-preview.1")).toBe("0.8.0-preview.1");
    expect(electronBuilderVersionForShellVersion("0.8.0-prerelease.2")).toBe("0.8.0-prerelease.2");
  });

  it("collapses prerelease build counters down to the X.Y.Z cache line", () => {
    expect(versionCoreForShellVersion("0.8.0")).toBe("0.8.0");
    expect(versionCoreForShellVersion("0.8.0-beta.6")).toBe("0.8.0");
    expect(versionCoreForShellVersion("0.8.0-preview.1")).toBe("0.8.0");
    expect(versionCoreForShellVersion("0.8.0-prerelease.2")).toBe("0.8.0");
  });

  it("collapses Shell versions down to the X.Y cache family", () => {
    expect(versionFamilyForShellVersion("0.9.0")).toBe("0.9");
    expect(versionFamilyForShellVersion("0.9.1-beta.6")).toBe("0.9");
    expect(versionFamilyForShellVersion("0.9.1-preview.1")).toBe("0.9");
    expect(versionFamilyForShellVersion("1.10.2-prerelease.3")).toBe("1.10");
    expect(versionFamilyForShellVersion("not-semver")).toBeNull();
  });
});
