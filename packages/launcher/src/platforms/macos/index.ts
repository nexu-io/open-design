import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { LauncherPlatform, LauncherRelaunch } from "../../platform.js";
import { repairMacDockEntries } from "./dock-entry.js";
import { refreshMacApplicationRegistration } from "./launch-services.js";

function updateEnvironmentArgs(): string[] {
  // LaunchServices does not inherit the caller's environment automatically.
  // Carry updater overrides explicitly, without inheriting sidecar ownership.
  return Object.entries(process.env).flatMap(([key, value]) =>
    key.startsWith("OD_UPDATE_") && value != null ? ["--env", `${key}=${value}`] : []);
}

async function openInstalled(path: string, argv: readonly string[]): Promise<void> {
  const args = [...updateEnvironmentArgs(), ...(argv.includes("--headless") ? ["-g", "-j"] : []), path, ...(argv.length === 0 ? [] : ["--args", ...argv])];
  const child = spawn("/usr/bin/open", args, { stdio: "ignore", timeout: 10_000 });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`LaunchServices open failed (${signal ?? code}) for ${path}`));
    });
  });
}
export async function relaunchInstalledApp(path: string, request: LauncherRelaunch): Promise<void> {
  if (!Number.isSafeInteger(request.predecessorPid) || request.predecessorPid <= 0) throw new Error("invalid launcher predecessor pid");
  const delegated = request.target == null ? [] : ["--args", "--od-launcher-delegated-generation", String(request.target.generation), "--od-launcher-delegated-version", request.target.version];
  // LaunchServices must create the successor's own responsibility coalition.
  const script = 'pid="$1"; shift; deadline=$(($(date +%s) + 60)); while kill -0 "$pid" 2>/dev/null; do [ "$(date +%s)" -lt "$deadline" ] || exit 1; sleep 0.05; done; exec /usr/bin/open "$@"';
  const child = spawn("/bin/sh", ["-c", script, "od-launcher", String(request.predecessorPid), ...updateEnvironmentArgs(), path, ...delegated], {
    detached: true, stdio: "ignore", env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin" },
  });
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("spawn", resolve); });
  child.unref();
}


export function createMacLauncherPlatform(electronVersion: string, arch: string): LauncherPlatform {
  return {
    environment: { contractVersion: 1, platform: "darwin", arch, electronVersion },
    installedAppPath: executable => resolve(executable, "..", "..", ".."),
    installedConfigPath: installed => join(installed, "Contents", "Resources", "open-design-config.json"),
    openInstalled,
    async relaunchInstalled(path, request) {
      const target = await lstat(path);
      if (!target.isDirectory() || target.isSymbolicLink() || await realpath(path) !== resolve(path)) {
        throw new Error("installed launcher is not a canonical application directory");
      }
      await relaunchInstalledApp(path, request);
    },
    async synchronizeSystemEntries({ installedAppPath, executablePath, paths }) {
      const appBundleName = `${basename(executablePath)}.app`;
      const results = await Promise.all([
        refreshMacApplicationRegistration({ executablePath, appBundleName, versionsRoot: paths.versionsRoot }),
        repairMacDockEntries({ canonicalAppBundlePath: installedAppPath, appBundleName, versionsRoot: paths.versionsRoot }),
      ]);
      for (const result of results) if (result.status === "failed") console.warn("[launcher] system entry repair failed", result.error);
    },
  };
}
