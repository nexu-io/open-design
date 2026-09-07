import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packElectronShell } from "@open-design/electron-kit/pack";
import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { resolveElectronStandaloneTarget } from "../standalone/installation.ts";
import { createElectronReleaseManifest, type ElectronReleaseIdentityRegistry } from "../../composition/release-identity.ts";
import { loadElectronStandaloneAuthorityResources } from "../standalone/installation.ts";
import { withElectronInstallation, parseElectronInstallationInput, type ElectronInstallationInput } from "../standalone/assemble-installation.ts";
import { electronShellSource } from "./resources.ts";
import { withElectronPhysicalPlatform } from "../../platform/build.ts";

export type ElectronPackRequest = Readonly<{
  schemaVersion: 2;
  operation: "electron.pack.build";
  installationInput: ElectronInstallationInput;
  channel: string;
  installationRoot: string;
  namespace: string;
  outputDirectory: string;
  platformArchivePath: string;
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
  const expected = ["channel", "installationInput", "installationRoot", "namespace", "operation", "outputDirectory", "platformArchivePath", "releaseVersion", "schemaVersion"];
  if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(expected)) throw new Error("Electron pack request fields are invalid");
  if (request.schemaVersion !== 2 || request.operation !== "electron.pack.build") throw new Error("Electron pack request schema or operation is unsupported");
  if (typeof request.releaseVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[a-z0-9]+\.\d+)?$/u.test(request.releaseVersion)) throw new Error("Electron pack releaseVersion is invalid");
  return Object.freeze({
    schemaVersion: 2,
    operation: "electron.pack.build",
    installationInput: parseElectronInstallationInput(request.installationInput),
    channel: token(request.channel, "Electron pack channel"),
    namespace: token(request.namespace, "Electron pack namespace"),
    installationRoot: absolutePath(request.installationRoot, "Electron pack installation root"),
    outputDirectory: absolutePath(request.outputDirectory, "Electron pack output directory"),
    platformArchivePath: absolutePath(request.platformArchivePath, "Electron platform archive"),
    releaseVersion: request.releaseVersion,
  });
}

export function createElectronPackManifest(baseManifest: ElectronShellManifest, request: ElectronPackRequest): ElectronShellManifest {
  const identitiesPath = fileURLToPath(new URL("../../../config/release-identities.json", import.meta.url));
  const registry = JSON.parse(readFileSync(identitiesPath, "utf8")) as ElectronReleaseIdentityRegistry;
  return createElectronReleaseManifest(baseManifest, registry, {
    channel: request.channel,
    namespace: request.namespace,
    releaseVersion: request.releaseVersion,
  });
}

export async function executeElectronPack(request: ElectronPackRequest) {
  const baseManifestPath = fileURLToPath(new URL("../../../config/shell.json", import.meta.url));
  const baseManifest = validateElectronShellManifest(JSON.parse(await readFile(baseManifestPath, "utf8")) as ElectronShellManifest);
  const manifest = createElectronPackManifest(baseManifest, request);
  const distribution = await withElectronInstallation({ input: request.installationInput, outputDirectory: request.installationRoot, target: resolveElectronStandaloneTarget() }, async (installation) => {
  if (installation.channel !== request.channel || installation.releaseVersion !== request.releaseVersion) {
    throw new Error("Electron pack authority differs from its explicit channel release identity");
  }
  return await withElectronPhysicalPlatform({ archivePath: request.platformArchivePath, target: resolveElectronStandaloneTarget() }, async platformRoot => packElectronShell({
    authorityResources: [...await loadElectronStandaloneAuthorityResources(installation.resourceDirectory), { name: "platform", path: platformRoot }],
    distributionPath: fileURLToPath(new URL("../../../config/distribution.json", import.meta.url)),
    entryPath: electronShellSource("main.ts"),
    manifest,
    nodeCarrierLockPath: fileURLToPath(new URL("../../../config/carriers/node-lock.json", import.meta.url)),
    runtimeConfigPath: fileURLToPath(new URL("../../../config/runtime.json", import.meta.url)),
    windowsLifecyclePath: fileURLToPath(new URL("../../../config/platforms/windows.json", import.meta.url)),
    outputRoot: join(request.outputDirectory, "distribution"),
    projectRoot: fileURLToPath(new URL("../../..", import.meta.url)),
    rendererPreloadEntryPath: electronShellSource("adapters/renderer/preload.ts"),
  }));
  });
  return Object.freeze({
    schemaVersion: 2 as const,
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
