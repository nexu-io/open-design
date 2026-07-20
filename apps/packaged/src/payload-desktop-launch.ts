import { spawn } from "node:child_process";
import { dirname } from "node:path";

import { buildLauncherAfterQuitArgs } from "@open-design/launcher-proto";
import { createProcessStampArgs } from "@open-design/platform";
import { OPEN_DESIGN_SIDECAR_CONTRACT, type SidecarStamp } from "@open-design/sidecar-proto";

import {
  recordPackagedLauncherRuntimeFailedAttempt,
  type PackagedLauncherRuntime,
} from "./launcher-runtime.js";

const DEFAULT_DELEGATION_TIMEOUT_MS = 60_000;

export type PackagedPayloadDesktopLaunchPlan = {
  args: string[];
  command: string;
  cwd: string;
};

export function planPackagedPayloadDesktopDelegation(
  runtime: PackagedLauncherRuntime,
  stamp: SidecarStamp,
  options: {
    currentPid?: number;
    timeoutMs?: number;
  } = {},
): PackagedPayloadDesktopLaunchPlan | null {
  if (runtime.source !== "payload" || runtime.payloadDesktopProcess) return null;
  if (runtime.desktopExecutablePath == null) return null;

  return {
    args: [
      ...buildLauncherAfterQuitArgs({
        targetPid: options.currentPid ?? process.pid,
        timeoutMs: options.timeoutMs ?? DEFAULT_DELEGATION_TIMEOUT_MS,
      }),
      ...createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
    ],
    command: runtime.desktopExecutablePath,
    cwd: dirname(runtime.desktopExecutablePath),
  };
}

export async function launchPackagedPayloadDesktop(
  runtime: PackagedLauncherRuntime,
  stamp: SidecarStamp,
  options: {
    currentPid?: number;
    recordFailedAttempt?: (runtime: PackagedLauncherRuntime) => Promise<void>;
    spawn?: typeof spawn;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const plan = planPackagedPayloadDesktopDelegation(runtime, stamp, options);
  if (plan == null) return false;

  try {
    const child = (options.spawn ?? spawn)(plan.command, plan.args, {
      cwd: plan.cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once("spawn", () => resolveSpawn());
      child.once("error", rejectSpawn);
    });
    child.unref();
  } catch (error) {
    await (options.recordFailedAttempt ?? recordPackagedLauncherRuntimeFailedAttempt)(runtime);
    throw error;
  }
  return true;
}
