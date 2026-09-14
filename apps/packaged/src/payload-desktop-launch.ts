import { dirname } from "node:path";

import { buildLauncherAfterQuitArgs, buildLauncherDelegatedArgs } from "@open-design/launcher-proto";
import { handoffCurrentSidecarGeneration } from "@open-design/sidecar";

import {
  armPackagedLauncherRuntimeAttempt,
  recordPackagedLauncherRuntimeFailedAttempt,
  type PackagedLauncherRuntime,
} from "./launcher-runtime.js";

const DEFAULT_DELEGATION_TIMEOUT_MS = 60_000;

export function findPackagedDeeplinkArg(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith("opendesign://")) ?? null;
}

export type PackagedPayloadDesktopLaunchPlan = {
  args: string[];
  command: string;
  cwd: string;
};

export function planPackagedPayloadDesktopDelegation(
  runtime: PackagedLauncherRuntime,
  options: {
    currentPid?: number;
    forwardedArgs?: readonly string[];
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
      // A normal active delegation is pre-armed by the parent, so the child
      // needs the delegated pointer to tell its own in-progress attempt apart
      // from a previous failed launch. A rollback (last-successful)
      // delegation deliberately carries no marker: the attempt on disk is the
      // rollback evidence and the child must re-derive the rollback from it.
      ...(runtime.selection.selected && runtime.selection.reason === "active"
        ? buildLauncherDelegatedArgs(runtime.selection.pointer)
        : []),
      // The stable outer owns the OS protocol registration. On a cold start
      // after a payload update, Electron delivers the invite URL to that outer
      // process first; preserve only this explicit protocol argument when the
      // outer delegates to the versioned payload.
      ...(options.forwardedArgs ?? process.argv).filter((arg) =>
        arg.startsWith("opendesign://")
      ),
    ],
    command: runtime.desktopExecutablePath,
    cwd: dirname(runtime.desktopExecutablePath),
  };
}

export async function launchPackagedPayloadDesktop(
  runtime: PackagedLauncherRuntime,
  options: {
    currentPid?: number;
    forwardedArgs?: readonly string[];
    recordFailedAttempt?: (runtime: PackagedLauncherRuntime) => Promise<void>;
    handoff?: typeof handoffCurrentSidecarGeneration;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const plan = planPackagedPayloadDesktopDelegation(runtime, options);
  if (plan == null) return false;

  // Pre-arm BEFORE spawn: a payload that spawns successfully but dies before
  // reaching its own launcher bookkeeping would otherwise leave no rollback
  // evidence, and every later cold start would retry the same broken payload.
  await armPackagedLauncherRuntimeAttempt(runtime);
  try {
    await (options.handoff ?? handoffCurrentSidecarGeneration)({
      args: plan.args,
      command: plan.command,
      cwd: plan.cwd,
      env: process.env,
    }, { timeoutMs: options.timeoutMs ?? DEFAULT_DELEGATION_TIMEOUT_MS });
  } catch (error) {
    await (options.recordFailedAttempt ?? recordPackagedLauncherRuntimeFailedAttempt)(runtime);
    throw error;
  }
  return true;
}
