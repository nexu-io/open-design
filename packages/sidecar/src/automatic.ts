import { fileURLToPath } from "node:url";

import {
  bootstrapSidecarProcessWithSupervisor,
  launchSidecarWithSupervisor,
  restartSidecarWithSupervisor,
  spawnSidecarWithSupervisor,
  type SidecarAuthorityLaunchRequest,
  type SidecarLaunchRequest,
  type SidecarRestartOptions,
  type SidecarRestartResult,
  type SpawnedSidecar,
} from "./operations.js";
import type { SidecarResources } from "./client.js";
import type { SidecarStamp } from "./stamp.js";

const sourceModule = import.meta.url.endsWith(".ts");

function withAutomaticSupervisor(request: SidecarLaunchRequest): SidecarAuthorityLaunchRequest {
  return {
    ...request,
    supervisor: request.supervisor ?? {
      args: sourceModule ? ["--import", "tsx"] : [],
      command: process.execPath,
      entrypoint: sourceModule
        ? fileURLToPath(new URL("./supervisor.ts", import.meta.url))
        : fileURLToPath(new URL("./supervisor.mjs", import.meta.url)),
    },
  };
}

export async function launchSidecar(request: SidecarLaunchRequest): Promise<{ pid: number }> {
  return await launchSidecarWithSupervisor(withAutomaticSupervisor(request));
}

export async function spawnSidecar(request: SidecarLaunchRequest): Promise<SpawnedSidecar> {
  return await spawnSidecarWithSupervisor(withAutomaticSupervisor(request));
}

export async function restartSidecar(
  request: SidecarLaunchRequest,
  options: SidecarRestartOptions = {},
): Promise<SidecarRestartResult> {
  return await restartSidecarWithSupervisor(withAutomaticSupervisor(request), options);
}

export async function bootstrapSidecarProcess(
  stamp: SidecarStamp,
  resources: Omit<SidecarResources, "pid">,
  options: {
    args?: readonly string[];
    command?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    launch?: typeof launchSidecar;
    supervisor?: SidecarLaunchRequest["supervisor"];
    waitUntilReady?: (stamp: SidecarStamp, pid: number) => Promise<void>;
  } = {},
): Promise<boolean> {
  const request = withAutomaticSupervisor({
    args: options.args,
    command: options.command ?? process.execPath,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    logFd: null,
    resources,
    stamp,
    supervisor: options.supervisor,
  });
  return await bootstrapSidecarProcessWithSupervisor(stamp, resources, {
    ...options,
    launch: options.launch == null
      ? undefined
      : async (input) => await options.launch!(input),
    supervisor: request.supervisor,
  });
}
