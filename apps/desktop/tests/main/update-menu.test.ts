import { describe, expect, it } from "vitest";
import type { DesktopUpdateStatusSnapshot } from "@open-design/sidecar-proto";

import {
  DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
  deriveDesktopUpdateMenuItem,
  desktopUpdateMenuItemKey,
  parseDesktopUpdateMenuLabels,
} from "../../src/main/update-menu.js";

function status(
  state: DesktopUpdateStatusSnapshot["state"],
  overrides: Partial<DesktopUpdateStatusSnapshot> = {},
): DesktopUpdateStatusSnapshot {
  return {
    arch: "arm64",
    capabilities: {
      canApplyInPlace: true,
      canDownload: true,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: "beta",
    currentVersion: "0.10.0-beta.1",
    enabled: true,
    mode: "package-launcher",
    platform: "darwin",
    state,
    supported: true,
    ...overrides,
  };
}

describe("macOS update menu", () => {
  it("shows the familiar check action only for a supported macOS updater", () => {
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("idle"),
    })).toEqual({
      action: "open-dialog",
      enabled: true,
      label: "Check for Updates…",
      visible: true,
    });

    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "win32",
      status: status("idle", { platform: "win32" }),
    }).visible).toBe(false);
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("unsupported", { enabled: false, supported: false }),
    }).visible).toBe(false);
  });

  it("maps busy and ready updater states to honest menu copy", () => {
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("checking"),
    })).toMatchObject({ label: "Checking for Updates…", enabled: false, action: null });
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("downloading"),
    })).toMatchObject({ label: "Downloading Update…", enabled: false, action: null });
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("downloaded", {
        artifact: { type: "payload", url: "https://example.test/payload.zip" },
      }),
    })).toMatchObject({ label: "Restart to Update Open Design…", enabled: true, action: "open-dialog" });
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("downloaded", {
        artifact: { type: "dmg", url: "https://example.test/OpenDesign.dmg" },
      }),
    })).toMatchObject({ label: "Install Update…", enabled: true, action: "open-dialog" });
    expect(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: status("downloaded", {
        artifact: { type: "payload", url: "https://example.test/payload.zip" },
        installResult: { openedAt: new Date(0).toISOString(), path: "/tmp/payload.zip" },
      }),
    })).toMatchObject({ label: "Installing Update…", enabled: false, action: null });
  });

  it("uses renderer-provided localized labels without changing behavior", () => {
    const item = deriveDesktopUpdateMenuItem({
      labels: {
        ...DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
        restart: "重新启动以更新 Open Design…",
      },
      platform: "darwin",
      status: status("downloaded", {
        artifact: { type: "payload", url: "https://example.test/payload.zip" },
      }),
    });
    expect(item).toMatchObject({
      action: "open-dialog",
      enabled: true,
      label: "重新启动以更新 Open Design…",
      visible: true,
    });
  });

  it("keeps a stable item key across progress-only ticks and changes it on real transitions", () => {
    const derive = (snapshot: DesktopUpdateStatusSnapshot) => desktopUpdateMenuItemKey(deriveDesktopUpdateMenuItem({
      labels: DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
      platform: "darwin",
      status: snapshot,
    }));
    const downloadingAt = (receivedBytes: number) => status("downloading", {
      progress: { receivedBytes, totalBytes: 400_000_000 },
    });
    expect(derive(downloadingAt(10_000_000))).toBe(derive(downloadingAt(390_000_000)));
    expect(derive(downloadingAt(390_000_000))).not.toBe(derive(status("downloaded", {
      artifact: { type: "payload", url: "https://example.test/payload.zip" },
    })));
    expect(derive(status("idle"))).not.toBe(derive(status("checking")));
  });

  it("rejects malformed renderer label payloads at the privileged boundary", () => {
    expect(parseDesktopUpdateMenuLabels(DEFAULT_DESKTOP_UPDATE_MENU_LABELS)).toEqual(
      DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
    );
    expect(parseDesktopUpdateMenuLabels({ ...DEFAULT_DESKTOP_UPDATE_MENU_LABELS, check: "" })).toBeNull();
    expect(parseDesktopUpdateMenuLabels({ ...DEFAULT_DESKTOP_UPDATE_MENU_LABELS, restart: 42 })).toBeNull();
    expect(parseDesktopUpdateMenuLabels({ ...DEFAULT_DESKTOP_UPDATE_MENU_LABELS, extra: "ignored" })).toEqual(
      DEFAULT_DESKTOP_UPDATE_MENU_LABELS,
    );
  });
});
