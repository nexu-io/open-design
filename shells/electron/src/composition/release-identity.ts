import { createHash } from "node:crypto";

import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";

export type ElectronReleaseIdentityDeclaration = Readonly<{
  appId: string;
  executableName: string;
  namespace: string;
  productName: string;
  windowTitle: string;
}>;

export type ElectronReleaseIdentityRegistry = Readonly<{
  schemaVersion: 1;
  channels: Readonly<Record<string, ElectronReleaseIdentityDeclaration>>;
}>;

export type ElectronReleaseManifestRequest = Readonly<{
  channel: string;
  releaseVersion: string;
  buildHash?: string;
  namespace?: string;
}>;

export type ElectronAcceptedContentIdentity = Readonly<{
  channel: string;
  releaseVersion: string;
}>;

const channelToken = /^[a-z0-9]{1,12}$/u;
const digest = /^[a-f0-9]{64}$/u;

export function createElectronSceneManifest(baseManifest: ElectronShellManifest, buildHash: string): ElectronShellManifest {
  if (!digest.test(buildHash)) throw new Error("Electron scene Shell buildHash is invalid");
  const shell = { type: "electron" as const, version: baseManifest.shell.version, buildHash };
  const shellDigest = createHash("sha256").update(JSON.stringify(shell, Object.keys(shell).sort())).digest("hex");
  return validateElectronShellManifest({ ...baseManifest, shell: { ...shell, digest: shellDigest } });
}

function validateDeclaration(value: ElectronReleaseIdentityDeclaration, channel: string): ElectronReleaseIdentityDeclaration {
  if (!channelToken.test(channel)
    || typeof value?.appId !== "string"
    || typeof value.executableName !== "string"
    || typeof value.namespace !== "string"
    || typeof value.productName !== "string"
    || typeof value.windowTitle !== "string") throw new Error(`Electron release identity declaration is invalid: ${channel}`);
  return value;
}

export function createElectronReleaseManifest(
  baseManifest: ElectronShellManifest,
  registry: ElectronReleaseIdentityRegistry,
  request: ElectronReleaseManifestRequest,
): ElectronShellManifest {
  if (registry.schemaVersion !== 1 || registry.channels == null || typeof registry.channels !== "object") {
    throw new Error("Electron release identity registry is invalid");
  }
  const declaration = validateDeclaration(registry.channels[request.channel]!, request.channel);
  const neutral = createElectronSceneManifest(baseManifest, request.buildHash ?? baseManifest.shell.buildHash);
  return validateElectronShellManifest({
    ...neutral,
    appId: declaration.appId,
    channel: request.channel,
    executableName: declaration.executableName,
    namespace: request.namespace ?? declaration.namespace,
    productName: declaration.productName,
    version: request.releaseVersion,
    window: { ...baseManifest.window, title: declaration.windowTitle },
  });
}

export function assertElectronDistributionBinding(
  sceneManifest: ElectronShellManifest,
  releaseManifest: ElectronShellManifest,
  acceptedContent: ElectronAcceptedContentIdentity,
): void {
  const scene = validateElectronShellManifest(sceneManifest);
  const release = validateElectronShellManifest(releaseManifest);
  if (release.shell.type !== scene.shell.type
    || release.shell.version !== scene.shell.version
    || release.shell.buildHash !== scene.shell.buildHash
    || release.shell.digest !== scene.shell.digest) {
    throw new Error("Electron release identity differs from its release-neutral scene Shell binding");
  }
  if (acceptedContent.channel !== release.channel || acceptedContent.releaseVersion !== release.version) {
    throw new Error("Electron exact content differs from its Shell channel identity");
  }
}
