import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import {
  bindClosureCandidateIdentity,
  createClosureComponentTreeDigest,
  validateClosureCandidateManifest,
  validateClosureDistributionManifest,
  validateClosureFileInventory,
  type ClosureCandidateManifest,
  type ClosureDistributionBlob,
  type ClosureDistributionManifest,
} from "../protocol/index.js";
import type { ClosureBindingDescriptor } from "../store/index.js";
import {
  commitVerifiedClosureDistributionGeneration,
  commitVerifiedStoredClosureCandidate,
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  resolveClosureStoreVersionPaths,
  verifyClosureDistributionBlob,
  verifyMaterializedClosureCandidate,
  verifyMaterializedClosureDistributionGeneration,
  verifyStoredClosureCandidate,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type ClosureStoreVersionPaths,
  type StoredClosureVerification,
} from "../store/index.js";
import { downloadCopyAndClear } from "@open-design/download";
import { isProcessAlive } from "@open-design/platform";
import {
  compareReleaseVersions,
  isReleaseChannel,
  type ReleaseChannel,
} from "@open-design/release";
import extractZip from "extract-zip";

import { fetchJsonDocument } from "./apply.js";

export type ClosureReleaseAssetUrls = {
  archive: string;
  inventory: string;
  manifest: string;
  provenance: string | null;
};

export type ClosureReleaseCandidate = {
  assets: ClosureReleaseAssetUrls;
  manifest: ClosureCandidateManifest;
  releaseTarget: string;
  releaseVersion: string;
};

export type ClosureDistributionReleaseCandidate = Readonly<{
  manifest: ClosureDistributionManifest;
  releaseVersion: string;
  target: string;
}>;

export type ClosureUpdateCommitReason =
  | "newer-release-binding"
  | "no-committed-closure"
  | "repair-committed-closure";

export type ClosureUpdateRetainReason =
  | "already-committed"
  | "candidate-not-newer"
  | "shell-incompatible";

export type ClosureUpdateDecision =
  | {
      action: "commit";
      candidate: ClosureReleaseCandidate;
      reason: ClosureUpdateCommitReason;
    }
  | {
      action: "retain";
      candidate: ClosureReleaseCandidate;
      reason: ClosureUpdateRetainReason;
    };

export class ClosureUpdateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClosureUpdateError";
  }
}

export const CLOSURE_RESOURCE_REPOSITORY_ENV = "OD_CLOSURE_RESOURCE_REPOSITORY_V1" as const;
export const CLOSURE_RESOURCE_REPOSITORY_SCHEMA_VERSION = 1 as const;

export type ClosureResourceRepositoryConfig = Readonly<{
  localSeeds: readonly Readonly<{ root: string }>[];
  remoteOrigins: readonly string[];
  schemaVersion: typeof CLOSURE_RESOURCE_REPOSITORY_SCHEMA_VERSION;
}>;

export function validateClosureResourceRepositoryConfig(
  value: unknown,
  options: Readonly<{ baseRoot?: string }> = {},
): ClosureResourceRepositoryConfig {
  const config = requireRecord(value, "Closure resource repository config");
  const extras = Object.keys(config).filter((key) => !["localSeeds", "remoteOrigins", "schemaVersion"].includes(key));
  if (extras.length > 0) throw new ClosureUpdateError(`Closure resource repository config contains unsupported fields: ${extras.join(", ")}`);
  if (config.schemaVersion !== CLOSURE_RESOURCE_REPOSITORY_SCHEMA_VERSION) {
    throw new ClosureUpdateError("Closure resource repository config schemaVersion is unsupported");
  }
  if (!Array.isArray(config.localSeeds) || !Array.isArray(config.remoteOrigins)) {
    throw new ClosureUpdateError("Closure resource repository config sources must be arrays");
  }
  const localSeeds = config.localSeeds.map((entry, index) => {
    const seed = requireRecord(entry, `Closure local seed ${index}`);
    if (Object.keys(seed).some((key) => key !== "root")) throw new ClosureUpdateError(`Closure local seed ${index} contains unsupported fields`);
    const configuredRoot = requireString(seed.root, `Closure local seed ${index} root`);
    const root = isAbsolute(configuredRoot)
      ? configuredRoot
      : options.baseRoot == null ? configuredRoot : join(options.baseRoot, configuredRoot);
    if (!isAbsolute(root)) throw new ClosureUpdateError(`Closure local seed ${index} root must resolve absolute`);
    return Object.freeze({ root });
  });
  const remoteOrigins = config.remoteOrigins.map((origin, index) => {
    const normalized = requireHttpUrl(origin, `Closure remote origin ${index}`);
    return normalized.replace(/\/+$/u, "");
  });
  return Object.freeze({
    localSeeds: Object.freeze(localSeeds),
    remoteOrigins: Object.freeze(remoteOrigins),
    schemaVersion: CLOSURE_RESOURCE_REPOSITORY_SCHEMA_VERSION,
  });
}

export async function readClosureResourceRepositoryConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ClosureResourceRepositoryConfig> {
  const path = env[CLOSURE_RESOURCE_REPOSITORY_ENV];
  if (path == null || path.length === 0 || !isAbsolute(path)) {
    throw new ClosureUpdateError(`${CLOSURE_RESOURCE_REPOSITORY_ENV} must point to an absolute config file`);
  }
  const bytes = await readFile(path);
  if (bytes.byteLength > 1024 * 1024) throw new ClosureUpdateError("Closure resource repository config exceeds 1 MiB");
  try {
    return validateClosureResourceRepositoryConfig(
      JSON.parse(bytes.toString("utf8")) as unknown,
      { baseRoot: dirname(path) },
    );
  } catch (error) {
    if (error instanceof ClosureUpdateError) throw error;
    throw new ClosureUpdateError(`Closure resource repository config is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type ApplyClosureUpdateResult =
  | {
      candidate: ClosureReleaseCandidate;
      pointer: ClosureRuntimePointer;
      reason: ClosureUpdateCommitReason;
      state: "committed";
    }
  | {
      candidate: ClosureReleaseCandidate;
      reason: ClosureUpdateRetainReason;
      state: "retained";
    }
  | {
      candidate: ClosureReleaseCandidate;
      reason: "another-updater-active";
      state: "busy";
    };

export type ApplyClosureDistributionUpdateResult =
  | {
      candidate: ClosureDistributionReleaseCandidate;
      pointer: ClosureRuntimePointer;
      reason: ClosureUpdateCommitReason;
      state: "committed";
    }
  | {
      candidate: ClosureDistributionReleaseCandidate;
      reason: ClosureUpdateRetainReason;
      state: "retained";
    }
  | {
      candidate: ClosureDistributionReleaseCandidate;
      reason: "another-updater-active";
      state: "busy";
    };

export type ClosureDistributionUpdateProgress =
  | Readonly<{
      completedBytes: number;
      phase: "download";
      totalBytes: number;
    }>
  | Readonly<{
      completedComponents: number;
      phase: "materialize";
      totalComponents: number;
    }>;

export function reportDistributionProgress(
  observer: ((progress: ClosureDistributionUpdateProgress) => void) | undefined,
  progress: ClosureDistributionUpdateProgress,
): void {
  try {
    observer?.(Object.freeze(progress));
  } catch {
    // Progress is optional presentation telemetry and must never change update authority.
  }
}

export type ApplyClosureReleaseUpdateResult =
  | ApplyClosureDistributionUpdateResult
  | ApplyClosureUpdateResult;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ClosureUpdateError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new ClosureUpdateError(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

export function requireHttpUrl(value: unknown, label: string): string {
  const normalized = requireString(value, label);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.toString();
  } catch {
    throw new ClosureUpdateError(`${label} must be an absolute http(s) URL`);
  }
}

function assetUrl(assets: Record<string, unknown>, name: string, required = true): string | null {
  const asset = assets[name];
  if (asset == null && !required) return null;
  const record = requireRecord(asset, `Closure ${name} asset`);
  return requireHttpUrl(record.url, `Closure ${name} asset URL`);
}

export function selectClosureReleaseCandidate(
  metadata: unknown,
  input: {
    channel: string;
    platform: string;
    releaseTarget: string;
  },
): ClosureReleaseCandidate {
  if (!isReleaseChannel(input.channel)) {
    throw new ClosureUpdateError(`unsupported Closure update channel: ${input.channel}`);
  }
  const root = requireRecord(metadata, "release metadata");
  if (root.channel !== input.channel) {
    throw new ClosureUpdateError(
      `release metadata channel ${String(root.channel)} does not match ${input.channel}`,
    );
  }
  if (root.releaseState !== "complete") {
    throw new ClosureUpdateError(`release metadata is not complete: ${String(root.releaseState)}`);
  }
  const releaseVersion = requireString(root.releaseVersion, "release metadata version");
  const targets = requireRecord(root.releaseTargets, "release metadata targets");
  const target = requireRecord(targets[input.releaseTarget], `release target ${input.releaseTarget}`);
  if (target.status !== "published" || target.enabled !== true) {
    throw new ClosureUpdateError(`release target ${input.releaseTarget} is not published and enabled`);
  }
  const closure = requireRecord(target.closure, `release target ${input.releaseTarget} Closure`);
  let manifest: ClosureCandidateManifest;
  try {
    manifest = validateClosureCandidateManifest(closure.manifest);
  } catch (error) {
    throw new ClosureUpdateError(
      `release target ${input.releaseTarget} Closure manifest is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (manifest.identity.channel !== input.channel) {
    throw new ClosureUpdateError("Closure candidate channel does not match its release metadata");
  }
  if (manifest.identity.platform !== input.platform) {
    throw new ClosureUpdateError(
      `Closure candidate platform ${manifest.identity.platform} does not match ${input.platform}`,
    );
  }
  const assets = requireRecord(closure.assets, "Closure release assets");
  const archive = assetUrl(assets, "archive")!;
  if (archive !== new URL(manifest.artifact.url).toString()) {
    throw new ClosureUpdateError("Closure archive asset URL does not match the candidate manifest");
  }
  return {
    assets: {
      archive,
      inventory: assetUrl(assets, "inventory")!,
      manifest: assetUrl(assets, "manifest")!,
      provenance: assetUrl(assets, "provenance", false),
    },
    manifest,
    releaseTarget: input.releaseTarget,
    releaseVersion,
  };
}

export async function discoverClosureReleaseCandidate(input: {
  channel: string;
  fetch?: typeof globalThis.fetch;
  metadataUrl: string;
  platform: string;
  releaseTarget: string;
}): Promise<ClosureReleaseCandidate> {
  const metadataUrl = requireHttpUrl(input.metadataUrl, "Closure release metadata URL");
  const metadata = await fetchJsonDocument(
    metadataUrl,
    "Closure release metadata",
    input.fetch ?? globalThis.fetch,
  );
  return selectClosureReleaseCandidate(metadata, input);
}

/** Select the sole version-wide v2 graph without consulting platform subtrees. */
export function selectClosureDistributionReleaseCandidate(
  metadata: unknown,
  input: Readonly<{ channel: string; target: string }>,
): ClosureDistributionReleaseCandidate | null {
  if (!isReleaseChannel(input.channel)) {
    throw new ClosureUpdateError(`unsupported Closure update channel: ${input.channel}`);
  }
  const root = requireRecord(metadata, "release metadata");
  if (root.channel !== input.channel) {
    throw new ClosureUpdateError(
      `release metadata channel ${String(root.channel)} does not match ${input.channel}`,
    );
  }
  if (root.releaseState !== "complete") {
    throw new ClosureUpdateError(`release metadata is not complete: ${String(root.releaseState)}`);
  }
  if (root.closure == null) return null;
  const releaseVersion = requireString(root.releaseVersion, "release metadata version");
  let manifest: ClosureDistributionManifest;
  try {
    manifest = validateClosureDistributionManifest(root.closure, (canonical) => (
      `sha256:${createHash("sha256").update(canonical).digest("hex")}`
    ));
  } catch (error) {
    throw new ClosureUpdateError(
      `release metadata Closure distribution is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (manifest.identity.channel !== input.channel) {
    throw new ClosureUpdateError("Closure distribution channel does not match its release metadata");
  }
  if (manifest.required.targets[input.target] == null) {
    throw new ClosureUpdateError(`Closure distribution does not contain target ${input.target}`);
  }
  return { manifest, releaseVersion, target: input.target };
}

export async function discoverClosureDistributionReleaseCandidate(input: Readonly<{
  channel: string;
  fetch?: typeof globalThis.fetch;
  metadataUrl: string;
  target: string;
}>): Promise<ClosureDistributionReleaseCandidate | null> {
  const metadataUrl = requireHttpUrl(input.metadataUrl, "Closure release metadata URL");
  const metadata = await fetchJsonDocument(
    metadataUrl,
    "Closure release metadata",
    input.fetch ?? globalThis.fetch,
  );
  return selectClosureDistributionReleaseCandidate(metadata, input);
}

/**
 * Resolve the first-install candidate without granting the Shell any version
 * selection policy. A seed exposes one conventional baseline index; if it is
 * absent or invalid, Standalone may consult the caller-provided release feed.
 */
export async function discoverClosureDistributionBootstrapCandidate(input: Readonly<{
  channel: string;
  fetch?: typeof globalThis.fetch;
  metadataUrl: string | null;
  repository: ClosureResourceRepositoryConfig;
  target: string;
}>): Promise<ClosureDistributionReleaseCandidate | null> {
  let localError: unknown = null;
  for (const seed of input.repository.localSeeds) {
    const path = join(seed.root, input.channel, "baseline.json");
    try {
      const bytes = await readFile(path);
      if (bytes.byteLength > 4 * 1024 * 1024) {
        throw new ClosureUpdateError("Closure baseline index exceeds 4 MiB");
      }
      return selectClosureDistributionReleaseCandidate(
        JSON.parse(bytes.toString("utf8")) as unknown,
        input,
      );
    } catch (error) {
      localError = error;
    }
  }
  if (input.metadataUrl != null) {
    return await discoverClosureDistributionReleaseCandidate({
      channel: input.channel,
      ...(input.fetch == null ? {} : { fetch: input.fetch }),
      metadataUrl: input.metadataUrl,
      target: input.target,
    });
  }
  if (localError != null) {
    throw new ClosureUpdateError("Closure baseline index is unusable", { cause: localError });
  }
  return null;
}

function versionMetadataUrl(latestMetadataUrl: string, version: string): string {
  const latest = new URL(requireHttpUrl(latestMetadataUrl, "Closure release metadata URL"));
  const suffix = "/latest/metadata.json";
  if (!latest.pathname.endsWith(suffix)) {
    throw new ClosureUpdateError(
      "Closure release metadata URL cannot resolve an immutable version endpoint",
    );
  }
  latest.pathname = `${latest.pathname.slice(0, -suffix.length)}/versions/${encodeURIComponent(version)}/metadata.json`;
  latest.search = "";
  latest.hash = "";
  return latest.toString();
}

function isExactDistributionCandidate(
  candidate: ClosureDistributionReleaseCandidate,
  version: string,
): boolean {
  return candidate.releaseVersion === version && candidate.manifest.identity.version === version;
}

/**
 * Resolve one exact product version for cold-start alignment or repair. Local
 * Shell resources remain candidates rather than launch authority; a mismatched
 * baseline is skipped before consulting the immutable version feed.
 */
export async function discoverClosureDistributionVersionCandidate(input: Readonly<{
  channel: string;
  fetch?: typeof globalThis.fetch;
  metadataUrl: string | null;
  repository: ClosureResourceRepositoryConfig;
  target: string;
  version: string;
}>): Promise<ClosureDistributionReleaseCandidate | null> {
  let localError: unknown = null;
  for (const seed of input.repository.localSeeds) {
    const path = join(seed.root, input.channel, "baseline.json");
    try {
      const bytes = await readFile(path);
      if (bytes.byteLength > 4 * 1024 * 1024) {
        throw new ClosureUpdateError("Closure baseline index exceeds 4 MiB");
      }
      const candidate = selectClosureDistributionReleaseCandidate(
        JSON.parse(bytes.toString("utf8")) as unknown,
        input,
      );
      if (candidate != null && isExactDistributionCandidate(candidate, input.version)) {
        return candidate;
      }
    } catch (error) {
      localError = error;
    }
  }
  if (input.metadataUrl != null) {
    const candidate = await discoverClosureDistributionReleaseCandidate({
      channel: input.channel,
      ...(input.fetch == null ? {} : { fetch: input.fetch }),
      metadataUrl: versionMetadataUrl(input.metadataUrl, input.version),
      target: input.target,
    });
    if (candidate == null || !isExactDistributionCandidate(candidate, input.version)) {
      throw new ClosureUpdateError(
        `Closure immutable version metadata does not describe exact version ${input.version}`,
      );
    }
    return candidate;
  }
  if (localError != null) {
    throw new ClosureUpdateError("Closure baseline index is unusable", { cause: localError });
  }
  return null;
}

type ComparableVersion = {
  core: readonly [number, number, number];
  prerelease: string[];
};

function comparableVersion(value: string): ComparableVersion {
  const normalized = value.trim().replace(/^v/iu, "").split("+", 1)[0] ?? "";
  const prereleaseSeparator = normalized.indexOf("-");
  const core = prereleaseSeparator === -1 ? normalized : normalized.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : normalized.slice(prereleaseSeparator + 1);
  const parts = core.split(".");
  const numbers = parts.map((part) => Number(part));
  if (
    parts.length !== 3
    || numbers.some((part) => !Number.isSafeInteger(part) || part < 0)
  ) {
    throw new ClosureUpdateError(`shell version is not comparable: ${value}`);
  }
  return {
    core: [numbers[0]!, numbers[1]!, numbers[2]!],
    prerelease: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/u.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/u.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

export function compareClosureShellVersions(left: string, right: string): number {
  const a = comparableVersion(left);
  const b = comparableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const comparison = Math.sign((a.core[index] ?? 0) - (b.core[index] ?? 0));
    if (comparison !== 0) return comparison;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    const comparison = compareIdentifier(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function resolveClosureShellMinimumVersion(
  manifest: Pick<ClosureCandidateManifest, "compatibility">,
  shellType: string,
): string | null {
  return manifest.compatibility.shell[shellType]?.version.min ?? null;
}

export function decideClosureUpdate(input: {
  candidate: ClosureReleaseCandidate;
  descriptor: ClosureBindingDescriptor;
  shellType: string;
  shellVersion: string;
}): ClosureUpdateDecision {
  const { candidate } = input;
  if (candidate.manifest.identity.channel !== input.descriptor.channel) {
    throw new ClosureUpdateError("Closure candidate channel does not match the local Store");
  }
  const minimumShellVersion = resolveClosureShellMinimumVersion(
    candidate.manifest,
    input.shellType,
  );
  if (
    minimumShellVersion == null
    ||
    compareClosureShellVersions(
      input.shellVersion,
      minimumShellVersion,
    ) < 0
  ) {
    return { action: "retain", candidate, reason: "shell-incompatible" };
  }
  const committed = input.descriptor.committed;
  if (committed == null) {
    return { action: "commit", candidate, reason: "no-committed-closure" };
  }
  const active = committed.standalone;
  if (
    active.version === candidate.manifest.identity.version
    && active.digest === candidate.manifest.identity.digest
    && committed.releaseVersion === candidate.releaseVersion
  ) {
    return { action: "retain", candidate, reason: "already-committed" };
  }
  const channel = candidate.manifest.identity.channel as ReleaseChannel;
  const comparison = compareReleaseVersions(candidate.releaseVersion, committed.releaseVersion, channel);
  if (comparison === 0) {
    throw new ClosureUpdateError(
      `Closure release ${committed.releaseVersion} has conflicting immutable bindings`,
    );
  }
  return comparison > 0
    ? { action: "commit", candidate, reason: "newer-release-binding" }
    : { action: "retain", candidate, reason: "candidate-not-newer" };
}

export type ClosureDistributionUpdateDecision =
  | {
      action: "commit";
      candidate: ClosureDistributionReleaseCandidate;
      reason: ClosureUpdateCommitReason;
    }
  | {
      action: "retain";
      candidate: ClosureDistributionReleaseCandidate;
      reason: ClosureUpdateRetainReason;
    };

export function decideClosureDistributionUpdate(input: {
  candidate: ClosureDistributionReleaseCandidate;
  descriptor: ClosureBindingDescriptor;
  shellType: string;
  shellVersion: string;
}): ClosureDistributionUpdateDecision {
  const { candidate } = input;
  if (candidate.manifest.identity.channel !== input.descriptor.channel) {
    throw new ClosureUpdateError("Closure distribution channel does not match the local Store");
  }
  if (candidate.manifest.required.targets[candidate.target] == null) {
    throw new ClosureUpdateError(`Closure distribution does not contain target ${candidate.target}`);
  }
  const minimumShellVersion = resolveClosureShellMinimumVersion(candidate.manifest, input.shellType);
  if (
    minimumShellVersion == null
    || compareClosureShellVersions(input.shellVersion, minimumShellVersion) < 0
  ) {
    return { action: "retain", candidate, reason: "shell-incompatible" };
  }
  const committed = input.descriptor.committed;
  if (committed == null) {
    return { action: "commit", candidate, reason: "no-committed-closure" };
  }
  const active = committed.standalone;
  if (
    active.version === candidate.manifest.identity.version
    && active.digest === candidate.manifest.identity.digest
    && active.target === candidate.target
    && committed.releaseVersion === candidate.releaseVersion
  ) {
    return { action: "retain", candidate, reason: "already-committed" };
  }
  const channel = candidate.manifest.identity.channel;
  const comparison = compareReleaseVersions(
    candidate.releaseVersion,
    committed.releaseVersion,
    channel,
  );
  if (comparison === 0) {
    throw new ClosureUpdateError(
      `Closure release ${committed.releaseVersion} has conflicting immutable distribution bindings`,
    );
  }
  return comparison > 0
    ? { action: "commit", candidate, reason: "newer-release-binding" }
    : { action: "retain", candidate, reason: "candidate-not-newer" };
}

export type UpdateLock = {
  path: string;
  token: string;
};

export type UpdateLockRecord = {
  createdAt: string;
  pid: number;
  token: string;
};

export const INCOMPLETE_UPDATE_LOCK_GRACE_MS = 30_000;


export * from "./apply.js";
