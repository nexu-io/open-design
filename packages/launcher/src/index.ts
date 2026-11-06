import { startLauncher } from "./lifecycle.js";
import { createMacLauncherPlatform } from "./platforms/macos/index.js";

import type { LauncherEntry, LauncherEntryOptions } from "./types.js";
export type { LauncherEntry, LauncherEntryOptions } from "./types.js";

/** Only macOS opts into hosted assembly today. Legacy carriers remain unchanged. */
export async function selectAppEntry(options: LauncherEntryOptions): Promise<LauncherEntry | null> {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(1);
  if ((options.platform ?? process.platform) !== "darwin" || env.ELECTRON_RUN_AS_NODE === "1" ||
      env.OD_SIDECAR_SUPERVISED_CONTEXT != null || argv.includes("--mcp-install")) {
    return { entry: options.bundledEntry, source: "legacy" };
  }
  return startLauncher({ ...options, adapter: createMacLauncherPlatform(options.electronVersion ?? process.versions.electron ?? "", options.arch ?? process.arch) });
}

export { startLauncher } from "./lifecycle.js";
export type { LauncherPlatform, LauncherRelaunch } from "./platform.js";
