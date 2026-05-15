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
      shortcutName: "Open Design Beta.lnk",
      uninstallerName: "Uninstall Open Design Beta.exe",
    });
  });

  it("uses first-class preview display identity for preview release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-preview-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design Preview.exe",
      displayName: "Open Design Preview",
      shortcutName: "Open Design Preview.lnk",
      uninstallerName: "Uninstall Open Design Preview.exe",
    });
  });
});
