import type { DesktopUpdateStatusSnapshot } from "@open-design/sidecar-proto";

export type DesktopUpdateMenuLabels = {
  check: string;
  checking: string;
  downloading: string;
  install: string;
  installing: string;
  restart: string;
};

export type DesktopUpdateMenuItem = {
  action: "open-dialog" | null;
  enabled: boolean;
  label: string;
  visible: boolean;
};

export const DEFAULT_DESKTOP_UPDATE_MENU_LABELS: DesktopUpdateMenuLabels = Object.freeze({
  check: "Check for Updates…",
  checking: "Checking for Updates…",
  downloading: "Downloading Update…",
  install: "Install Update…",
  installing: "Installing Update…",
  restart: "Restart to Update Open Design…",
});

const UPDATE_MENU_LABEL_KEYS = ["check", "checking", "downloading", "install", "installing", "restart"] as const;

export function parseDesktopUpdateMenuLabels(input: unknown): DesktopUpdateMenuLabels | null {
  if (typeof input !== "object" || input == null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const labels = {} as DesktopUpdateMenuLabels;
  for (const key of UPDATE_MENU_LABEL_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 160 || /[\u0000-\u001f]/.test(value)) {
      return null;
    }
    labels[key] = value;
  }
  return labels;
}

/**
 * Stable identity of a derived update menu item. Updater status ticks that do
 * not change this key (e.g. download progress percent) must not trigger an
 * application-menu rebuild.
 */
export function desktopUpdateMenuItemKey(item: DesktopUpdateMenuItem): string {
  return `${item.visible}|${item.enabled}|${item.action ?? "none"}|${item.label}`;
}

export function deriveDesktopUpdateMenuItem(input: {
  labels: DesktopUpdateMenuLabels;
  platform: NodeJS.Platform;
  status: DesktopUpdateStatusSnapshot;
}): DesktopUpdateMenuItem {
  const { labels, platform, status } = input;
  const visible = platform === "darwin" && status.enabled && status.supported && status.state !== "unsupported";
  if (!visible) {
    return { action: null, enabled: false, label: labels.check, visible: false };
  }
  if (status.installResult != null || status.state === "installing") {
    return { action: null, enabled: false, label: labels.installing, visible: true };
  }
  if (status.state === "checking") {
    return { action: null, enabled: false, label: labels.checking, visible: true };
  }
  if (status.state === "downloading") {
    return { action: null, enabled: false, label: labels.downloading, visible: true };
  }
  if (status.state === "downloaded") {
    const artifactType = status.artifact?.type ?? status.incoming?.artifact.type;
    return {
      action: "open-dialog",
      enabled: true,
      label: artifactType === "payload" ? labels.restart : labels.install,
      visible: true,
    };
  }
  return { action: "open-dialog", enabled: true, label: labels.check, visible: true };
}
