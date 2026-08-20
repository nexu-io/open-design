import { spawn } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildLauncherAfterQuitArgs,
  buildLauncherDelegatedArgs,
} from "@open-design/launcher-proto";

import { HELPERS_DIR, ensureOwnedSubdir } from "./store.js";

/**
 * @module updater/deferred-launch
 *
 * Wait-for-my-pid-to-die launch helpers for the desktop updater: the
 * embedded mac shell and Windows PowerShell installer-opening scripts, and
 * the detached spawn of a prepared payload executable in after-quit mode.
 */

export const DEFERRED_INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;

export type DetachedProcess = Pick<ReturnType<typeof spawn>, "once" | "unref">;
export type SpawnInstallerHelper = (
  command: string,
  args: string[],
  options: { cwd?: string; detached?: true; stdio: "ignore"; windowsHide: true },
) => DetachedProcess;

export type DeferredInstallerLaunchInput = {
  appPid: number;
  /** Stable namespace root inherited by the installer helper process. */
  cwd: string;
  installerPath: string;
  root: string;
  timeoutMs: number;
};

export type DeferredAppLaunchInput = {
  appPid: number;
  /** Stable namespace root inherited by the next payload process. */
  cwd: string;
  /**
   * Pointer the activation pre-armed attempt.json for; passed to the spawned
   * payload as `--od-launcher-delegated-*` so it recognizes that attempt as
   * its own launch in progress rather than a previous failure.
   */
  delegated?: { generation: number; version: string };
  launchPath: string;
  root: string;
  timeoutMs: number;
};

export type DeferredLaunchResult = {
  error?: string;
  helperLogPath?: string;
};

export function macDeferredInstallerScript(): string {
  return `#!/bin/sh
set -eu
target_pid="$1"
installer_path="$2"
timeout_seconds="$3"
cleanup() {
  rm -f "$0"
}
trap cleanup EXIT
deadline=$(($(date +%s) + timeout_seconds))
while kill -0 "$target_pid" 2>/dev/null; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    exit 1
  fi
  sleep 1
done
open "$installer_path" >/dev/null 2>&1 &
exit 0
`;
}

export function windowsDeferredInstallerScript(): string {
  return `param(
  [Parameter(Mandatory = $true)]
  [int]$TargetPid,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [int]$TimeoutMs,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = "Stop"

function Write-HelperLog {
  param([string]$Message)
  try {
    Add-Content -LiteralPath $LogPath -Value ("{0:o} {1}" -f (Get-Date), $Message)
  } catch {
  }
}

try {
  Write-HelperLog ("armed for pid={0} installer={1}" -f $TargetPid, $InstallerPath)
  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  while ($null -ne (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue)) {
    if ((Get-Date) -ge $deadline) {
      throw ("timed out waiting for pid={0}" -f $TargetPid)
    }
    Start-Sleep -Milliseconds 250
  }

  Write-HelperLog ("observed pid={0} exit; opening installer" -f $TargetPid)
  Write-HelperLog "waiting for launch handoff"
  Start-Sleep -Milliseconds 1500
  Start-Process -FilePath $InstallerPath -WorkingDirectory (Split-Path -Parent $InstallerPath)
  Write-HelperLog "installer launch requested"
} catch {
  Write-HelperLog ("failed: {0}" -f $_.Exception.Message)
  exit 1
} finally {
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
`;
}

export function windowsDeferredInstallerLauncherScript(): string {
  return `param(
  [Parameter(Mandatory = $true)]
  [string]$PowerShellPath,

  [Parameter(Mandatory = $true)]
  [string]$HelperPath,

  [Parameter(Mandatory = $true)]
  [int]$TargetPid,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [int]$TimeoutMs,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = "Stop"

function Quote-WindowsPowerShellArgument {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\\"') + '"'
}

function Write-LauncherLog {
  param([string]$Message)
  try {
    Add-Content -LiteralPath $LogPath -Value ("{0:o} {1}" -f (Get-Date), $Message)
  } catch {
  }
}

try {
  Write-LauncherLog ("launching helper={0}" -f $HelperPath)
  $arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-WindowsPowerShellArgument $HelperPath),
    "-TargetPid",
    $TargetPid.ToString(),
    "-InstallerPath",
    (Quote-WindowsPowerShellArgument $InstallerPath),
    "-TimeoutMs",
    $TimeoutMs.ToString(),
    "-LogPath",
    (Quote-WindowsPowerShellArgument $LogPath)
  ) -join " "
  Start-Process -FilePath $PowerShellPath -WindowStyle Hidden -ArgumentList $arguments
  Write-LauncherLog "helper launch requested"
} catch {
  Write-LauncherLog ("launcher failed: {0}" -f $_.Exception.Message)
  exit 1
} finally {
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
`;
}

export function windowsPowerShellCommand(env: NodeJS.ProcessEnv = process.env): string {
  const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
  return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export async function launchMacInstallerAfterQuit(
  input: DeferredInstallerLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<string> {
  try {
    const helpersRoot = await ensureOwnedSubdir(input.root, HELPERS_DIR);
    const suffix = `${deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const scriptPath = join(helpersRoot, `open-installer-after-quit-${suffix}.sh`);
    await writeFile(scriptPath, macDeferredInstallerScript(), { encoding: "utf8", mode: 0o700 });
    await chmod(scriptPath, 0o700);
    const timeoutSeconds = Math.max(1, Math.ceil(input.timeoutMs / 1000)).toString();
    const child = deps.spawnDetached(
      "/bin/sh",
      [scriptPath, input.appPid.toString(), input.installerPath, timeoutSeconds],
      { cwd: input.cwd, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function launchWindowsInstallerAfterQuit(
  input: DeferredInstallerLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<string> {
  try {
    const helpersRoot = await ensureOwnedSubdir(input.root, HELPERS_DIR);
    const suffix = `${deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const scriptPath = join(helpersRoot, `open-installer-after-quit-${suffix}.ps1`);
    const launcherPath = join(helpersRoot, `open-installer-after-quit-${suffix}.launcher.ps1`);
    const logPath = join(helpersRoot, `open-installer-after-quit-${suffix}.log`);
    const powerShellPath = windowsPowerShellCommand();
    await writeFile(scriptPath, windowsDeferredInstallerScript(), { encoding: "utf8" });
    await writeFile(launcherPath, windowsDeferredInstallerLauncherScript(), { encoding: "utf8" });
    const child = deps.spawnDetached(
      powerShellPath,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        launcherPath,
        "-PowerShellPath",
        powerShellPath,
        "-HelperPath",
        scriptPath,
        "-TargetPid",
        input.appPid.toString(),
        "-InstallerPath",
        input.installerPath,
        "-TimeoutMs",
        input.timeoutMs.toString(),
        "-LogPath",
        logPath,
      ],
      { cwd: input.cwd, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function launchPayloadAppAfterQuit(
  input: DeferredAppLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<DeferredLaunchResult> {
  try {
    const child = deps.spawnDetached(
      input.launchPath,
      [
        ...buildLauncherAfterQuitArgs({ targetPid: input.appPid, timeoutMs: input.timeoutMs }),
        ...(input.delegated == null ? [] : buildLauncherDelegatedArgs(input.delegated)),
      ],
      { cwd: input.cwd, detached: true, stdio: "ignore", windowsHide: true },
    );
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once("spawn", () => resolveSpawn());
      child.once("error", rejectSpawn);
    });
    child.unref();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
