import { describe, expect, it } from "vitest";

import { resolveWinInstallIdentity } from "../src/win/identity.js";

describe("resolveWinInstallIdentity", () => {
  it("keeps the default namespace on the canonical Windows display name", () => {
    expect(resolveWinInstallIdentity({ namespace: "default" })).toMatchObject({
      displayName: "Open Design",
      shortcutName: "Open Design.lnk",
      uninstallerName: "Uninstall Open Design.exe",
    });
  });

  it("uses first-class beta display identity for beta release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-beta-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design Beta.exe",
      displayName: "Open Design Beta",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-beta-win",
      shortcutName: "Open Design Beta.lnk",
      uninstallerName: "Uninstall Open Design Beta.exe",
    });
  });

  it("keeps non-release beta-like namespaces isolated from the real beta channel identity", () => {
    expect(resolveWinInstallIdentity({ namespace: "beta-local-flow" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design beta-local-flow.exe",
      displayName: "Open Design beta-local-flow",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-beta-local-flow",
      shortcutName: "Open Design beta-local-flow.lnk",
      uninstallerName: "Uninstall Open Design beta-local-flow.exe",
    });
  });

  it("uses first-class preview display identity for preview release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-preview-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design Preview.exe",
      displayName: "Open Design Preview",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-preview-win",
      shortcutName: "Open Design Preview.lnk",
      uninstallerName: "Uninstall Open Design Preview.exe",
    });
  });
});
