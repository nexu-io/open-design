import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packElectronShell } from "@open-design/electron-kit/pack";
import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { resolveElectronStandaloneTarget } from "../src/adapters/standalone/installation.ts";
import { createElectronReleaseManifest, type ElectronReleaseIdentityRegistry } from "../src/composition/release-identity.ts";
import { loadElectronStandaloneAuthorityResources } from "./build-authority.ts";
import { materializeElectronDevInstallation } from "./dev-installation.ts";

export type ElectronPackRequest = Readonly<{
  schemaVersion: 1;
  operation: "electron.pack.build";
  bootstrapUrl: string;
  channel: string;
  installationRoot: string;
  namespace: string;
  outputDirectory: string;
  releaseVersion: string;
}>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) throw new Error(`${label} must be an absolute normalized path`);
  return value;
}

function token(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

export function parseElectronPackRequest(value: unknown): ElectronPackRequest {
  const request = object(value, "Electron pack request");
  const expected = ["bootstrapUrl", "channel", "installationRoot", "namespace", "operation", "outputDirectory", "releaseVersion", "schemaVersion"];
  if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(expected)) throw new Error("Electron pack request fields are invalid");
  if (request.schemaVersion !== 1 || request.operation !== "electron.pack.build") throw new Error("Electron pack request schema or operation is unsupported");
  if (typeof request.bootstrapUrl !== "string" || !/^https?:\/\//u.test(request.bootstrapUrl)) throw new Error("Electron pack bootstrap URL is invalid");
  if (typeof request.releaseVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[a-z0-9]+\.\d+)?$/u.test(request.releaseVersion)) throw new Error("Electron pack releaseVersion is invalid");
  return Object.freeze({
    schemaVersion: 1,
    operation: "electron.pack.build",
    bootstrapUrl: request.bootstrapUrl,
    channel: token(request.channel, "Electron pack channel"),
    namespace: token(request.namespace, "Electron pack namespace"),
    installationRoot: absolutePath(request.installationRoot, "Electron pack installation root"),
    outputDirectory: absolutePath(request.outputDirectory, "Electron pack output directory"),
    releaseVersion: request.releaseVersion,
  });
}

export function createElectronPackManifest(baseManifest: ElectronShellManifest, request: ElectronPackRequest): ElectronShellManifest {
  const identitiesPath = fileURLToPath(new URL("../config/release-identities.json", import.meta.url));
  const registry = JSON.parse(readFileSync(identitiesPath, "utf8")) as ElectronReleaseIdentityRegistry;
  return createElectronReleaseManifest(baseManifest, registry, {
    channel: request.channel,
    namespace: request.namespace,
    releaseVersion: request.releaseVersion,
  });
}

export async function executeElectronPack(request: ElectronPackRequest) {
  const baseManifestPath = fileURLToPath(new URL("../config/shell.json", import.meta.url));
  const baseManifest = validateElectronShellManifest(JSON.parse(await readFile(baseManifestPath, "utf8")) as ElectronShellManifest);
  const manifest = createElectronPackManifest(baseManifest, request);
  const stagedManifestPath = join(request.outputDirectory, "inputs", "shell.json");
  await mkdir(dirname(stagedManifestPath), { recursive: true });
  await writeFile(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const installation = await materializeElectronDevInstallation({
    bootstrapUrl: request.bootstrapUrl,
    operation: "electron.dev.installation.materialize",
    outputDirectory: request.installationRoot,
    schemaVersion: 1,
    target: resolveElectronStandaloneTarget(),
  });
  if (installation.channel !== request.channel || installation.releaseVersion !== request.releaseVersion) {
    throw new Error("Electron pack authority differs from its explicit channel release identity");
  }
  const distribution = await packElectronShell({
    authorityResources: await loadElectronStandaloneAuthorityResources(installation.resourceDirectory),
    distributionPath: fileURLToPath(new URL("../config/distribution.json", import.meta.url)),
    entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
    manifestPath: stagedManifestPath,
    nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
    runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
    windowsLifecyclePath: fileURLToPath(new URL("../config/platforms/windows.json", import.meta.url)),
    outputRoot: join(request.outputDirectory, "distribution"),
    projectRoot: fileURLToPath(new URL("..", import.meta.url)),
    rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    operation: request.operation,
    channel: request.channel,
    namespace: request.namespace,
    releaseVersion: request.releaseVersion,
    shellVersion: baseManifest.shell.version,
    identity: Object.freeze({
      appId: manifest.appId,
      appBundleName: `${manifest.executableName}.app`,
      executableName: manifest.executableName,
      productName: manifest.productName,
      version: manifest.version,
    }),
    distribution,
  });
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const request = parseElectronPackRequest(JSON.parse(await readFile(argument("--request"), "utf8")));
  const receiptPath = argument("--receipt");
  const receipt = await executeElectronPack(request);
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}
