import { describe, expect, it } from "vitest";

import {
  resolveElectronDistributionConfiguration,
  resolveElectronDistributionPlatform,
  validateElectronDistributionPolicy,
  type ElectronDistributionPolicy,
} from "@/distribution/index.js";
import type { ElectronShellManifest } from "@/contracts/index.js";

const policy: ElectronDistributionPolicy = {
  schemaVersion: 1,
  mac: {
    arch: "current",
    category: "public.app-category.developer-tools",
    targets: ["dir", "dmg"],
    dmg: { sign: false },
  },
  windows: {
    arch: "x64",
    targets: ["dir", "nsis"],
    nsis: {
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      displayLanguageSelector: false,
      installerLanguages: ["en_US", "zh_CN"],
      language: "1033",
      multiLanguageInstaller: true,
      oneClick: false,
      perMachine: false,
      warningsAsErrors: false,
    },
  },
};

const manifest: ElectronShellManifest = {
  schemaVersion: 1,
  appId: "io.example.desktop",
  productName: "Example Desktop",
  executableName: "example-desktop",
  version: "1.2.3",
  channel: "stable",
  namespace: "example-desktop",
  protocol: "example",
  window: { width: 1024, height: 768, title: "Example Desktop" },
  shell: {
    type: "electron",
    version: "1.2.3",
    buildHash: "a".repeat(64),
    digest: "b".repeat(64),
  },
};

describe("Electron distribution policy", () => {
  it("translates finite Shell policy into electron-builder configuration", () => {
    const configuration = resolveElectronDistributionConfiguration({
      manifest,
      policy,
      electronVersion: "41.3.0",
      outputRoot: "/tmp/example-output",
    });

    expect(configuration.mac).toEqual({ category: "public.app-category.developer-tools", target: ["dir", "dmg"] });
    expect(configuration.dmg).toEqual({ sign: false });
    expect(configuration.win).toEqual({ target: ["dir", "nsis"] });
    expect(configuration.nsis).toMatchObject({
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      installerLanguages: ["en_US", "zh_CN"],
      multiLanguageInstaller: true,
      oneClick: false,
      perMachine: false,
      warningsAsErrors: false,
      shortcutName: "Example Desktop",
    });
    expect(configuration.files).not.toContain("distribution.json");
    expect(configuration.files).toContain("scene.json");
    expect(configuration.files).not.toContain("scene-receipt.json");
  });

  it("fails explicitly outside the supported native build hosts", () => {
    expect(resolveElectronDistributionPlatform("darwin")).toBe("mac");
    expect(resolveElectronDistributionPlatform("win32")).toBe("win");
    expect(() => resolveElectronDistributionPlatform("linux")).toThrow(/unsupported Electron distribution platform/u);
  });

  it("rejects target drift and invalid NSIS locale declarations", () => {
    expect(() => validateElectronDistributionPolicy({
      ...policy,
      windows: { ...policy.windows, targets: ["dir", "portable"] as never },
    })).toThrow(/Windows distribution policy/u);
    expect(() => validateElectronDistributionPolicy({
      ...policy,
      windows: { ...policy.windows, nsis: { ...policy.windows.nsis, installerLanguages: ["zh-CN"] } },
    })).toThrow(/NSIS language policy/u);
  });
});
