import type { DesktopUpdater } from "../updater.js";

export const DESKTOP_UPDATE_CHECK_ACTIVATION_POLICIES = {
  AUTHORIZE_SILENT: "authorize-silent",
  REVOKE_SILENT: "revoke-silent",
} as const;

export type DesktopUpdateCheckActivationPolicy =
  typeof DESKTOP_UPDATE_CHECK_ACTIVATION_POLICIES[keyof typeof DESKTOP_UPDATE_CHECK_ACTIVATION_POLICIES];

export type DesktopUpdateCheckTrigger = "download" | "manual" | "scheduler" | "sidecar" | "test";

export async function checkDesktopUpdatesWithPolicy(input: Readonly<{
  autoDownload?: boolean;
  onPreferenceError?: (error: unknown) => void;
  resolveSilentActivation: () => Promise<boolean>;
  trigger: DesktopUpdateCheckTrigger;
  updater: DesktopUpdater;
}>) {
  let silent = false;
  try {
    silent = await input.resolveSilentActivation();
  } catch (error) {
    input.onPreferenceError?.(error);
  }
  return await input.updater.checkForUpdates({
    activationPolicy: silent
      ? DESKTOP_UPDATE_CHECK_ACTIVATION_POLICIES.AUTHORIZE_SILENT
      : DESKTOP_UPDATE_CHECK_ACTIVATION_POLICIES.REVOKE_SILENT,
    ...(input.autoDownload == null ? {} : { autoDownload: input.autoDownload }),
    trigger: input.trigger,
  });
}
