import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { APP_KEYS, SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { launchSidecar, type SidecarStamp } from "@open-design/sidecar";
import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { resolveElectronStandaloneTarget } from "../../standalone/installation.ts";
import { loadElectronStandaloneAuthorityResources } from "../../standalone/installation.ts";
import { withElectronInstallation, parseElectronInstallationInput, type ElectronInstallationInput } from "../../standalone/assemble-installation.ts";
import { inspectElectronCdpStatus } from "@open-design/electron-kit/cdp";
import { observeElectronLifecycle, waitForElectronGeneration, stopElectronGeneration } from "./observation.ts";
import { electronShellRoot, electronShellSource } from "../resources.ts";

export const ELECTRON_DEV_LIFECYCLE_SCHEMA_VERSION = 2 as const;

type RequestScope = Readonly<{
  channel: string;
  controlRuntimeRoot: string;
  namespace: string;
  schemaVersion: typeof ELECTRON_DEV_LIFECYCLE_SCHEMA_VERSION;
}>;

export type ElectronDevLifecycleRequest = Readonly<RequestScope & {
  installationInput: ElectronInstallationInput;
  installationRoot: string;
  operation: "electron.dev.start";
  platformArchivePath: string;
  ownerPid: number | null;
}> | Readonly<RequestScope & { operation: "electron.dev.inspect" | "electron.dev.status" | "electron.dev.stop" }>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function token(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) throw new Error(`${label} must be an absolute normalized path`);
  return value;
}

export function parseElectronDevLifecycleRequest(value: unknown): ElectronDevLifecycleRequest {
  const request = object(value, "Electron dev lifecycle request");
  const operation = request.operation;
  const baseKeys = ["channel", "controlRuntimeRoot", "namespace", "operation", "schemaVersion"];
  if (operation === "electron.dev.start") exactKeys(request, [...baseKeys, "installationInput", "installationRoot", "ownerPid", "platformArchivePath"], "Electron dev start request");
  else if (operation === "electron.dev.inspect" || operation === "electron.dev.status" || operation === "electron.dev.stop") exactKeys(request, baseKeys, "Electron dev lifecycle request");
  else throw new Error("Electron dev lifecycle operation is unsupported");
  if (request.schemaVersion !== 2) throw new Error("Electron dev lifecycle schema is unsupported");
  const base = {
    schemaVersion: 2 as const,
    operation,
    channel: token(request.channel, "Electron dev channel"),
    namespace: token(request.namespace, "Electron dev namespace"),
    controlRuntimeRoot: absolutePath(request.controlRuntimeRoot, "Electron dev control runtime root"),
  };
  if (operation !== "electron.dev.start") return Object.freeze(base) as ElectronDevLifecycleRequest;
  const ownerPid = request.ownerPid;
  if (ownerPid !== null && (!Number.isSafeInteger(ownerPid) || Number(ownerPid) <= 0)) throw new Error("Electron dev owner pid is invalid");
  return Object.freeze({
    ...base,
    operation,
    installationInput: parseElectronInstallationInput(request.installationInput),
    installationRoot: absolutePath(request.installationRoot, "Electron dev installation root"),
    platformArchivePath: absolutePath(request.platformArchivePath, "Electron platform archive"),
    ownerPid: ownerPid as number | null,
  });
}

function stamp(request: RequestScope): SidecarStamp {
  return Object.freeze({ app: APP_KEYS.ELECTRON, channel: request.channel, mode: "dev", namespace: request.namespace, source: SIDECAR_SOURCES.TOOLS_DEV });
}

async function start(request: Extract<ElectronDevLifecycleRequest, { operation: "electron.dev.start" }>, logFd: number) {
  const { prepareElectronDevShell } = await import("@open-design/electron-kit/dev");
  const { withElectronPhysicalPlatform } = await import("../../../platform/build.ts");
  const manifestPath = join(electronShellRoot, "config/shell.json");
  const baseManifest = validateElectronShellManifest(JSON.parse(await readFile(manifestPath, "utf8")) as ElectronShellManifest);
  if (baseManifest.channel !== request.channel) throw new Error("Electron dev request escaped the Shell channel");
  if (request.installationInput.channel !== request.channel) throw new Error("Electron dev installation input escaped the Shell channel");
  const prepared = await withElectronInstallation({ input: request.installationInput, outputDirectory: request.installationRoot, target: resolveElectronStandaloneTarget(), carrierVersion: baseManifest.shell.version }, async (installation) => {
    return await withElectronPhysicalPlatform({ archivePath: request.platformArchivePath, target: resolveElectronStandaloneTarget() }, async platformRoot => prepareElectronDevShell({
    authorityResources: [...await loadElectronStandaloneAuthorityResources(installation.resourceDirectory), { name: "platform", path: platformRoot }],
    entryPath: electronShellSource("main.ts"),
    manifest: { ...baseManifest, namespace: request.namespace },
    projectRoot: electronShellRoot,
    rendererPreloadEntryPath: electronShellSource("adapters/renderer/preload.ts"),
    carrierConfigPath: join(electronShellRoot, "config/carrier.json"),
  }));
  });
  const resources = Object.freeze({ dataRoot: null, ownerPid: request.ownerPid, port: 0, runtimeRoot: request.controlRuntimeRoot });
  const environment: NodeJS.ProcessEnv = { ...process.env, OD_ELECTRON_CONTROL_RESOURCES: JSON.stringify(resources) };
  for (const key of Object.keys(environment)) if (key.toUpperCase() === "ELECTRON_RUN_AS_NODE") delete environment[key];
  const launched = await launchSidecar({
    args: ["--remote-debugging-port=0", prepared.scene.sceneRoot],
    command: prepared.electronPath,
    cwd: prepared.scene.sceneRoot,
    detached: true,
    env: environment,
    logFd,
    resources,
    stamp: stamp(request),
    supervisor: { command: process.execPath, entrypoint: join(prepared.scene.sceneRoot, "supervisor.mjs") },
  });
  const runtimeStatus = await waitForElectronGeneration(stamp(request), launched.pid, request.controlRuntimeRoot);
  return Object.freeze({
    operation: request.operation,
    schemaVersion: 2 as const,
    shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }),
    status: runtimeStatus,
  });
}

export async function executeElectronDevLifecycle(request: ElectronDevLifecycleRequest, options: Readonly<{ logFd: number }>) {
  if (request.operation === "electron.dev.start") return await start(request, options.logFd);
  if (request.operation === "electron.dev.inspect") {
    const status = await observeElectronLifecycle(stamp(request), request.controlRuntimeRoot);
    return Object.freeze({ operation: request.operation, schemaVersion: 2 as const, shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }), status, cdp: await inspectElectronCdpStatus(status) });
  }
  if (request.operation === "electron.dev.status") {
    return Object.freeze({ operation: request.operation, schemaVersion: 2 as const, shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }), status: await observeElectronLifecycle(stamp(request), request.controlRuntimeRoot) });
  }
  const { electron, remainingPids } = await stopElectronGeneration(stamp(request));
  const stopped = Object.freeze({ ...electron, remainingPids });
  return Object.freeze({ operation: request.operation, schemaVersion: 2 as const, shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }), stopped });
}
