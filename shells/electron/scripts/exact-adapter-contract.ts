import { resolve } from "node:path";

export const ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION = 1 as const;
export const ELECTRON_EXACT_TARGETS = ["darwin-arm64", "darwin-x64", "win32-x64"] as const;

export type ElectronExactTarget = (typeof ELECTRON_EXACT_TARGETS)[number];

export type ElectronExactSceneRequest = Readonly<{
  acceptedClosureBaselineFile: string;
  operation: "electron.scene.build";
  sceneDirectory: string;
  schemaVersion: typeof ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION;
  shellManifestFile: string;
  standaloneLauncherFile: string;
  target: ElectronExactTarget;
}>;

export type ElectronExactDistributionRequest = Readonly<{
  acceptedContentMetadataFile: string;
  acceptedTrustFile: string;
  channelHeadUrl: string;
  operation: "electron.distribution.build";
  outputDirectory: string;
  sceneDirectory: string;
  sceneManifestSha256: string;
  schemaVersion: typeof ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION;
  target: ElectronExactTarget;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(input: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function target(value: unknown, label: string): ElectronExactTarget {
  if (!ELECTRON_EXACT_TARGETS.includes(value as ElectronExactTarget)) throw new Error(`${label} target is invalid`);
  return value as ElectronExactTarget;
}

function absolutePath(input: Record<string, unknown>, field: string, label: string): string {
  const value = input[field];
  if (typeof value !== "string" || resolve(value) !== value) throw new Error(`${label} ${field} must be absolute and normalized`);
  return value;
}

export function parseElectronExactSceneRequest(value: unknown): ElectronExactSceneRequest {
  const input = record(value, "Electron exact scene request");
  exactKeys(input, ["acceptedClosureBaselineFile", "operation", "sceneDirectory", "schemaVersion", "shellManifestFile", "standaloneLauncherFile", "target"], "Electron exact scene request");
  if (input.schemaVersion !== ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION || input.operation !== "electron.scene.build") {
    throw new Error("Electron exact scene request identity is invalid");
  }
  return Object.freeze({
    acceptedClosureBaselineFile: absolutePath(input, "acceptedClosureBaselineFile", "Electron exact scene"),
    operation: "electron.scene.build",
    sceneDirectory: absolutePath(input, "sceneDirectory", "Electron exact scene"),
    schemaVersion: ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION,
    shellManifestFile: absolutePath(input, "shellManifestFile", "Electron exact scene"),
    standaloneLauncherFile: absolutePath(input, "standaloneLauncherFile", "Electron exact scene"),
    target: target(input.target, "Electron exact scene"),
  });
}

export function parseElectronExactDistributionRequest(value: unknown): ElectronExactDistributionRequest {
  const input = record(value, "Electron exact distribution request");
  exactKeys(input, ["acceptedContentMetadataFile", "acceptedTrustFile", "channelHeadUrl", "operation", "outputDirectory", "sceneDirectory", "sceneManifestSha256", "schemaVersion", "target"], "Electron exact distribution request");
  if (input.schemaVersion !== ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION || input.operation !== "electron.distribution.build") {
    throw new Error("Electron exact distribution request identity is invalid");
  }
  if (typeof input.sceneManifestSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.sceneManifestSha256)) throw new Error("Electron exact scene digest is invalid");
  if (typeof input.channelHeadUrl !== "string" || !/^https?:\/\/[^\s]+$/u.test(input.channelHeadUrl)) throw new Error("Electron exact channel head URL is invalid");
  return Object.freeze({
    acceptedContentMetadataFile: absolutePath(input, "acceptedContentMetadataFile", "Electron exact distribution"),
    acceptedTrustFile: absolutePath(input, "acceptedTrustFile", "Electron exact distribution"),
    channelHeadUrl: input.channelHeadUrl,
    operation: "electron.distribution.build",
    outputDirectory: absolutePath(input, "outputDirectory", "Electron exact distribution"),
    sceneDirectory: absolutePath(input, "sceneDirectory", "Electron exact distribution"),
    sceneManifestSha256: input.sceneManifestSha256,
    schemaVersion: ELECTRON_EXACT_ADAPTER_SCHEMA_VERSION,
    target: target(input.target, "Electron exact distribution"),
  });
}
