import { describe, expect, it } from "vitest";

import type { ElectronShellManifest } from "@/contracts/index.js";
import {
  resolveElectronWindowsInstallIdentity,
  validateElectronWindowsLifecyclePolicy,
} from "@/platform/windows/index.js";

const manifest: ElectronShellManifest = {
  schemaVersion: 1,
  appId: "io.example.desktop",
  productName: "Example Desktop",
  publisher: "Example Company",
  executableName: "example-desktop",
  version: "1.2.3",
  channel: "stable",
  namespace: "example-desktop",
  protocol: "example",
  window: { width: 1024, height: 768, title: "Example Desktop" },
  splash: { width: 520, height: 320, minimumVisibleMs: 350, backgroundColor: "#151515", foregroundColor: "#ffffff", mutedColor: "#aaaaaa", initialLabel: "Preparing", readyLabel: "Ready" },
  shell: { type: "electron", version: "1.2.3", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};

describe("Electron Windows install identity", () => {
  it("derives every integration endpoint from one Shell identity", () => {
    expect(resolveElectronWindowsInstallIdentity({
      manifest,
      policy: {
        schemaVersion: 1,
        install: { scope: "current-user" },
        uninstall: { productData: "retain" },
      },
    })).toEqual({
      appId: "io.example.desktop",
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\example-desktop.exe",
      displayName: "Example Desktop",
      executableName: "example-desktop.exe",
      hive: "HKCU",
      installLocatorKey: "Software\\io.example.desktop",
      protocolKey: "Software\\Classes\\example",
      publisher: "Example Company",
      shortcutName: "Example Desktop.lnk",
      uninstallKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\io.example.desktop",
      uninstallerName: "Uninstall Example Desktop.exe",
    });
  });

  it("maps per-machine declarations to HKLM and rejects open-ended policy", () => {
    expect(resolveElectronWindowsInstallIdentity({
      manifest,
      policy: {
        schemaVersion: 1,
        install: { scope: "per-machine" },
        uninstall: { productData: "remove" },
      },
    }).hive).toBe("HKLM");
    expect(() => validateElectronWindowsLifecyclePolicy({
      schemaVersion: 1,
      install: { scope: "portable" as never },
      uninstall: { productData: "retain" },
    })).toThrow(/install scope/u);
    expect(() => resolveElectronWindowsInstallIdentity({
      manifest: { ...manifest, productName: "Example/Unsafe" },
      policy: {
        schemaVersion: 1,
        install: { scope: "current-user" },
        uninstall: { productData: "retain" },
      },
    })).toThrow(/safe Windows file segment/u);
  });
});
