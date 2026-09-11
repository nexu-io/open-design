import { open, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  convergeSidecarLaunch,
  type SidecarStamp,
} from "@open-design/sidecar";
import { APP_KEYS, SIDECAR_MODES, SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { inspectElectronCdpStatus } from "@open-design/electron-kit/cdp";
import { bindElectronLaunchNamespace } from "@open-design/electron-kit";
import { observeElectronLifecycle, waitForElectronGeneration, stopElectronGeneration } from "./observation.ts";

type RequestScope = Readonly<{
  channel: string;
  controlRuntimeRoot: string;
  namespace: string;
  schemaVersion: 1;
}>;

export type ElectronRuntimeLifecycleRequest = Readonly<RequestScope & {
  operation: "electron.runtime.start";
  appPath: string;
  argv: readonly string[];
  executablePath: string;
  logPath: string;
  runtimeRoot: string;
}> | Readonly<RequestScope & {
  operation: "electron.runtime.inspect";
}> | Readonly<RequestScope & {
  operation: "electron.runtime.status";
}> | Readonly<RequestScope & {
  operation: "electron.runtime.stop";
}>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function token(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) throw new Error(`${label} must be an absolute normalized path`);
  return value;
}

export function parseElectronRuntimeLifecycleRequest(input: unknown): ElectronRuntimeLifecycleRequest {
  const value = object(input, "Electron runtime lifecycle request");
  const operation = value.operation;
  const base = ["channel", "controlRuntimeRoot", "namespace", "operation", "schemaVersion"];
  const expected = operation === "electron.runtime.start"
    ? [...base, "appPath", "argv", "executablePath", "logPath", "runtimeRoot"]
    : base;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected.sort())) throw new Error("Electron runtime lifecycle request fields are invalid");
  if (value.schemaVersion !== 1 || !["electron.runtime.start", "electron.runtime.inspect", "electron.runtime.status", "electron.runtime.stop"].includes(String(operation))) {
    throw new Error("Electron runtime lifecycle request schema or operation is unsupported");
  }
  const scope = {
    schemaVersion: 1 as const,
    operation: operation as "electron.runtime.inspect" | "electron.runtime.status" | "electron.runtime.stop",
    channel: token(value.channel, "Electron runtime channel"),
    controlRuntimeRoot: absolutePath(value.controlRuntimeRoot, "Electron control runtime root"),
    namespace: token(value.namespace, "Electron runtime namespace"),
  };
  if (operation !== "electron.runtime.start") return Object.freeze(scope);
  if (!Array.isArray(value.argv) || value.argv.some((argument) => typeof argument !== "string" || argument.includes("\0"))) throw new Error("Electron runtime argv is invalid");
  return Object.freeze({
    ...scope,
    operation,
    appPath: absolutePath(value.appPath, "Electron runtime appPath"),
    argv: bindElectronLaunchNamespace(scope.namespace, value.argv as string[]),
    executablePath: absolutePath(value.executablePath, "Electron runtime executablePath"),
    logPath: absolutePath(value.logPath, "Electron runtime logPath"),
    runtimeRoot: absolutePath(value.runtimeRoot, "Electron runtime root"),
  });
}

function electronStamp(request: ElectronRuntimeLifecycleRequest): SidecarStamp {
  return Object.freeze({ app: APP_KEYS.ELECTRON, channel: request.channel, mode: SIDECAR_MODES.RUNTIME, namespace: request.namespace, source: SIDECAR_SOURCES.TOOLS_PACK });
}

export async function executeElectronRuntimeLifecycle(request: ElectronRuntimeLifecycleRequest) {
  const stamp = electronStamp(request);
  if (request.operation === "electron.runtime.inspect") {
    const status = await observeElectronLifecycle(stamp, request.controlRuntimeRoot);
    return Object.freeze({ schemaVersion: 1 as const, operation: request.operation, status, cdp: await inspectElectronCdpStatus(status) });
  }
  if (request.operation === "electron.runtime.status") {
    return Object.freeze({ schemaVersion: 1 as const, operation: request.operation, status: await observeElectronLifecycle(stamp, request.controlRuntimeRoot) });
  }
  if (request.operation === "electron.runtime.stop") {
    const { electron, remainingPids } = await stopElectronGeneration(stamp);
    return Object.freeze({
      schemaVersion: 1 as const,
      operation: request.operation,
      electron,
      remainingPids,
    });
  }
  const argv = bindElectronLaunchNamespace(request.namespace, request.argv);
  await mkdir(dirname(request.logPath), { recursive: true });
  const log = await open(request.logPath, "w");
  let convergence: Awaited<ReturnType<typeof convergeSidecarLaunch>>;
  try {
    const resources = Object.freeze({ dataRoot: null, ownerPid: null, port: 0, runtimeRoot: request.runtimeRoot });
    const environment: NodeJS.ProcessEnv = { ...process.env, OD_ELECTRON_CONTROL_RESOURCES: JSON.stringify(resources) };
    for (const key of Object.keys(environment)) if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") delete environment[key];
    convergence = await convergeSidecarLaunch({
      args: [...argv],
      command: request.executablePath,
      cwd: request.appPath,
      detached: true,
      env: environment,
      logFd: log.fd,
      resources,
      stamp,
    }, { ownerStamps: [stamp] });
  } finally {
    await log.close();
  }
  convergence.launcherProcess.unref();
  const pid = convergence.description.resources.pid;
  return Object.freeze({ schemaVersion: 1 as const, operation: request.operation, pid, status: await waitForElectronGeneration(stamp, pid, request.controlRuntimeRoot) });
}
