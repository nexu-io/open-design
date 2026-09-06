import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { APP_KEYS, SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { getSidecarStatus, launchSidecar, stopSidecar, type SidecarStamp } from "@open-design/sidecar";
import { prepareElectronDevShell } from "@open-design/electron-kit/dev";
import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { resolveElectronStandaloneTarget } from "../src/adapters/standalone/installation.ts";
import { loadElectronStandaloneAuthorityResources } from "./build-authority.ts";
import { materializeElectronDevInstallation } from "./dev-installation.ts";
import { inspectElectronCdpStatus } from "./cdp-inspection.ts";

export const ELECTRON_DEV_LIFECYCLE_SCHEMA_VERSION = 1 as const;

type RequestScope = Readonly<{
  channel: string;
  controlRuntimeRoot: string;
  namespace: string;
  schemaVersion: typeof ELECTRON_DEV_LIFECYCLE_SCHEMA_VERSION;
}>;

export type ElectronDevLifecycleRequest = Readonly<RequestScope & {
  bootstrapUrl: string;
  installationRoot: string;
  operation: "electron.dev.start";
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
  if (operation === "electron.dev.start") exactKeys(request, [...baseKeys, "bootstrapUrl", "installationRoot", "ownerPid"], "Electron dev start request");
  else if (operation === "electron.dev.inspect" || operation === "electron.dev.status" || operation === "electron.dev.stop") exactKeys(request, baseKeys, "Electron dev lifecycle request");
  else throw new Error("Electron dev lifecycle operation is unsupported");
  if (request.schemaVersion !== 1) throw new Error("Electron dev lifecycle schema is unsupported");
  const base = {
    schemaVersion: 1 as const,
    operation,
    channel: token(request.channel, "Electron dev channel"),
    namespace: token(request.namespace, "Electron dev namespace"),
    controlRuntimeRoot: absolutePath(request.controlRuntimeRoot, "Electron dev control runtime root"),
  };
  if (operation !== "electron.dev.start") return Object.freeze(base) as ElectronDevLifecycleRequest;
  if (typeof request.bootstrapUrl !== "string" || !/^https?:\/\//u.test(request.bootstrapUrl)) throw new Error("Electron dev bootstrap URL is invalid");
  const ownerPid = request.ownerPid;
  if (ownerPid !== null && (!Number.isSafeInteger(ownerPid) || Number(ownerPid) <= 0)) throw new Error("Electron dev owner pid is invalid");
  return Object.freeze({
    ...base,
    operation,
    bootstrapUrl: request.bootstrapUrl,
    installationRoot: absolutePath(request.installationRoot, "Electron dev installation root"),
    ownerPid: ownerPid as number | null,
  });
}

function stamp(request: RequestScope): SidecarStamp {
  return Object.freeze({ app: APP_KEYS.ELECTRON, channel: request.channel, mode: "dev", namespace: request.namespace, source: SIDECAR_SOURCES.TOOLS_DEV });
}

async function start(request: Extract<ElectronDevLifecycleRequest, { operation: "electron.dev.start" }>) {
  const manifestPath = fileURLToPath(new URL("../config/shell.json", import.meta.url));
  const baseManifest = validateElectronShellManifest(JSON.parse(await readFile(manifestPath, "utf8")) as ElectronShellManifest);
  if (baseManifest.channel !== request.channel) throw new Error("Electron dev request escaped the Shell channel");
  const stagedManifestPath = join(request.controlRuntimeRoot, "inputs", "shell.json");
  await mkdir(dirname(stagedManifestPath), { recursive: true });
  await writeFile(stagedManifestPath, `${JSON.stringify({ ...baseManifest, namespace: request.namespace }, null, 2)}\n`, "utf8");
  const installation = await materializeElectronDevInstallation({
    bootstrapUrl: request.bootstrapUrl,
    operation: "electron.dev.installation.materialize",
    outputDirectory: request.installationRoot,
    schemaVersion: 1,
    target: resolveElectronStandaloneTarget(),
  });
  const prepared = await prepareElectronDevShell({
    authorityResources: await loadElectronStandaloneAuthorityResources(installation.resourceDirectory),
    entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
    manifestPath: stagedManifestPath,
    nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
    projectRoot: fileURLToPath(new URL("..", import.meta.url)),
    rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
    runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
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
    logFd: 2,
    resources,
    stamp: stamp(request),
    supervisor: { command: process.execPath, entrypoint: join(prepared.scene.sceneRoot, "supervisor.mjs") },
  });
  const startedAt = Date.now();
  let runtimeStatus: unknown = null;
  while (Date.now() - startedAt < 120_000) {
    runtimeStatus = await getSidecarStatus(stamp(request), { generationPid: launched.pid, timeoutMs: 800 }).catch(() => null);
    if (runtimeStatus != null) break;
    try { process.kill(launched.pid, 0); }
    catch { throw new Error("Electron dev generation exited before publishing status"); }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  if (runtimeStatus == null) throw new Error("Electron dev generation did not publish status in time");
  return Object.freeze({
    operation: request.operation,
    schemaVersion: 1 as const,
    shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }),
    status: runtimeStatus,
  });
}

export async function executeElectronDevLifecycle(request: ElectronDevLifecycleRequest) {
  if (request.operation === "electron.dev.start") return await start(request);
  if (request.operation === "electron.dev.inspect") {
    const current = await getSidecarStatus(stamp(request), { timeoutMs: 1_000 }).catch(() => null);
    const status = current ?? Object.freeze({ state: "idle" as const });
    return Object.freeze({ operation: request.operation, schemaVersion: 1 as const, shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }), status, cdp: await inspectElectronCdpStatus(status) });
  }
  if (request.operation === "electron.dev.status") {
    const current = await getSidecarStatus(stamp(request), { timeoutMs: 1_000 }).catch(() => null);
    return Object.freeze({ operation: request.operation, schemaVersion: 1 as const, shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }), status: current ?? Object.freeze({ state: "idle" as const }) });
  }
  const stopped = await stopSidecar(stamp(request));
  return Object.freeze({ operation: request.operation, schemaVersion: 1 as const, shell: Object.freeze({ type: "electron" as const, channel: request.channel, namespace: request.namespace }), stopped });
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const request = parseElectronDevLifecycleRequest(JSON.parse(await readFile(argument("--request"), "utf8")));
  const receiptPath = argument("--receipt");
  const receipt = await executeElectronDevLifecycle(request);
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}
