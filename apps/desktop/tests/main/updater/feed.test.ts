import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { describe, expect, it } from "vitest";

import { resolveDesktopUpdaterConfig } from "../../../src/main/updater/config.js";
import { compareVersions, resolveInstalledOuterVersion } from "../../../src/main/updater/feed.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "od-updater-feed-test-"));
}

describe("desktop updater feed", () => {
  it("resolves the installed outer version from the platform bundle layout", async () => {
    const root = makeRoot();
    try {
      const appRoot = join(root, "Open Design.app");
      await mkdir(join(appRoot, "Contents", "Resources"), { recursive: true });
      await writeFile(join(appRoot, "Contents", "Resources", "open-design-config.json"), '{"appVersion":"0.7.0"}\n');
      const macConfig = resolveDesktopUpdaterConfig({
        env: {},
        launcherLaunchPath: appRoot,
        platform: "darwin",
        source: SIDECAR_SOURCES.PACKAGED,
      });
      expect(await resolveInstalledOuterVersion(macConfig)).toBe("0.7.0");

      const winExe = join(root, "win-install", "Open Design Beta.exe");
      await mkdir(join(root, "win-install", "resources"), { recursive: true });
      await writeFile(winExe, "");
      await writeFile(join(root, "win-install", "resources", "open-design-config.json"), '{"appVersion":"0.8.0-beta.2"}\n');
      const winConfig = resolveDesktopUpdaterConfig({
        env: {},
        launcherLaunchPath: winExe,
        platform: "win32",
        source: SIDECAR_SOURCES.PACKAGED,
      });
      expect(await resolveInstalledOuterVersion(winConfig)).toBe("0.8.0-beta.2");

      const malformedExe = join(root, "broken-install", "Open Design.exe");
      await mkdir(join(root, "broken-install", "resources"), { recursive: true });
      await writeFile(malformedExe, "");
      await writeFile(join(root, "broken-install", "resources", "open-design-config.json"), "not json\n");
      const malformedConfig = resolveDesktopUpdaterConfig({
        env: {},
        launcherLaunchPath: malformedExe,
        platform: "win32",
        source: SIDECAR_SOURCES.PACKAGED,
      });
      expect(await resolveInstalledOuterVersion(malformedConfig)).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("compares stable and prerelease versions", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBe(1);
    expect(compareVersions("1.0.0-beta-internal.2", "1.0.0-beta-internal.1")).toBe(1);
    expect(compareVersions("1.0.0-prerelease.10", "1.0.0-prerelease.2")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-beta.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
  });
});
