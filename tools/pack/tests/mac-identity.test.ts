import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveMacInstallIdentity } from "../src/mac/identity.js";
import { resolveMacPaths } from "../src/mac/paths.js";

function makeConfig(root: string, namespace: string): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform: "mac",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", namespace),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dmg",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

describe("resolveMacInstallIdentity", () => {
  it("keeps stable builds on the canonical mac identity", () => {
    expect(resolveMacInstallIdentity(makeConfig("/work", "release-stable"))).toMatchObject({
      appId: "io.open-design.desktop",
      installerTitle: "Open Design",
      productName: "Open Design",
      publicAppBundleName: "Open Design.app",
      systemAppBundleName: "Open Design.app",
    });
  });

  it("uses first-class beta app identity for beta release namespaces", () => {
    const config = makeConfig("/work", "release-beta");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.open-design.desktop.beta",
      executableName: "Open Design Beta",
      installerTitle: "Open Design Beta",
      productName: "Open Design Beta",
      publicAppBundleName: "Open Design Beta.app",
      systemAppBundleName: "Open Design Beta.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/Open Design Beta\.app$/);
  });

  it("uses first-class preview app identity for preview release namespaces", () => {
    const config = makeConfig("/work", "release-preview");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.open-design.desktop.preview",
      executableName: "Open Design Preview",
      installerTitle: "Open Design Preview",
      productName: "Open Design Preview",
      publicAppBundleName: "Open Design Preview.app",
      systemAppBundleName: "Open Design Preview.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/Open Design Preview\.app$/);
  });

  it("uses first-class prerelease app identity for prerelease release versions and namespaces", () => {
    const prereleaseVersionConfig = {
      ...makeConfig("/work", "release-stable"),
      appVersion: "0.8.0-prerelease.2",
    };
    const prereleaseNamespaceConfig = makeConfig("/work", "release-prerelease");

    expect(resolveMacInstallIdentity(prereleaseVersionConfig)).toEqual({
      appId: "io.open-design.desktop.prerelease",
      executableName: "Open Design Prerelease",
      installerTitle: "Open Design Prerelease",
      productName: "Open Design Prerelease",
      publicAppBundleName: "Open Design Prerelease.app",
      systemAppBundleName: "Open Design Prerelease.app",
    });
    expect(resolveMacPaths(prereleaseVersionConfig).appPath).toMatch(/Open Design Prerelease\.app$/);
    expect(resolveMacInstallIdentity(prereleaseNamespaceConfig)).toMatchObject({
      productName: "Open Design Prerelease",
      publicAppBundleName: "Open Design Prerelease.app",
    });
  });
});

describe("resolveMacInstallIdentity brand overlay", () => {
  it("uses branded productName/appId and drops the namespace suffix from the bundle name", () => {
    const config = {
      ...makeConfig("/work", "xdesign-local"),
      brand: { productName: "xDesign", appId: "io.xdesign.desktop", macIcon: "/x/icon.icns" },
    };

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.xdesign.desktop",
      executableName: "xDesign",
      installerTitle: "xDesign",
      productName: "xDesign",
      publicAppBundleName: "xDesign.app",
      systemAppBundleName: "xDesign.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/xDesign\.app$/);
  });

  it("throws when a brand omits appId (would collide with the upstream identity)", () => {
    const config = { ...makeConfig("/work", "xdesign-local"), brand: { productName: "xDesign" } };
    expect(() => resolveMacInstallIdentity(config)).toThrow(/OD_APP_ID/);
  });

  it("brand wins over a derived release channel for productName", () => {
    // A branded build carrying a beta-ish version still ships under the brand
    // name — brand is a fork identity, not a channel.
    const config = {
      ...makeConfig("/work", "release-beta"),
      appVersion: "0.8.0-beta.1",
      brand: { productName: "xDesign", appId: "io.xdesign.desktop" },
    };
    expect(resolveMacInstallIdentity(config).productName).toBe("xDesign");
  });

  it("brands the dmg/zip/payload artifact filenames (builder↔artifacts↔paths stay consistent)", () => {
    // The electron-builder artifactName, the artifacts.ts sourcePath lookup, and
    // the paths.ts destination must all derive the same name — otherwise a
    // branded `--to dmg` build fails with "no dmg artifact produced". This is the
    // witness that they share macArtifactProductName.
    const config = {
      ...makeConfig("/work", "xdesign-local"),
      brand: { productName: "xDesign", appId: "io.xdesign.desktop" },
    };
    const paths = resolveMacPaths(config);
    expect(paths.dmgPath).toMatch(/xDesign-xdesign-local\.dmg$/);
    expect(paths.zipPath).toMatch(/xDesign-xdesign-local\.zip$/);
    expect(paths.payloadZipPath).toMatch(/xDesign-xdesign-local-payload\.zip$/);
  });
});
