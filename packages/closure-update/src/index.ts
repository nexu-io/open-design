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
} from "@open-design/closure-proto";
import type { ClosureBindingDescriptor } from "@open-design/closure-store";
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
} from "@open-design/closure-store";
import { downloadCopyAndClear } from "@open-design/download";
import { isProcessAlive } from "@open-design/platform";
import {
  compareReleaseVersions,
  isReleaseChannel,
  type ReleaseChannel,
} from "@open-design/release";
import extractZip from "extract-zip";

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

export type ClosureUpdateCommitReason = "newer-release-binding" | "no-committed-closure";

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

function requireHttpUrl(value: unknown, label: string): string {
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

type UpdateLock = {
  path: string;
  token: string;
};

type UpdateLockRecord = {
  createdAt: string;
  pid: number;
  token: string;
};

const INCOMPLETE_UPDATE_LOCK_GRACE_MS = 30_000;

function errorCode(error: unknown): string | null {
  if (error == null || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function isUpdateLockRecord(value: unknown): value is UpdateLockRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const lock = value as Partial<UpdateLockRecord>;
  return typeof lock.createdAt === "string"
    && typeof lock.pid === "number"
    && Number.isSafeInteger(lock.pid)
    && lock.pid > 0
    && typeof lock.token === "string"
    && lock.token.length > 0;
}

async function readUpdateLock(path: string): Promise<UpdateLockRecord | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isUpdateLockRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function acquireUpdateLock(paths: ClosureStorePaths): Promise<UpdateLock | null> {
  const path = join(paths.stateRoot, "update.lock");
  await mkdir(paths.stateRoot, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    try {
      await writeFile(path, `${JSON.stringify({
        createdAt: new Date().toISOString(),
        pid: process.pid,
        token,
      } satisfies UpdateLockRecord)}\n`, { flag: "wx" });
      return { path, token };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = await readUpdateLock(path);
      const lockStat = existing == null ? await stat(path).catch(() => null) : null;
      const incompleteLockIsStale = lockStat != null
        && Date.now() - lockStat.mtimeMs >= INCOMPLETE_UPDATE_LOCK_GRACE_MS;
      if (
        attempt === 0
        && (
          (existing == null && incompleteLockIsStale)
          || (existing != null && !isProcessAlive(existing.pid))
        )
      ) {
        await rm(path, { force: true }).catch(() => undefined);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function releaseUpdateLock(lock: UpdateLock): Promise<void> {
  const current = await readUpdateLock(lock.path);
  if (current?.token === lock.token) await rm(lock.path, { force: true }).catch(() => undefined);
}

function sameCandidate(
  pointer: Pick<ClosureRuntimePointer, "channel" | "digest" | "namespace" | "protocolVersion" | "target" | "version">,
  binding: ReturnType<typeof bindClosureCandidateIdentity>,
): boolean {
  return pointer.channel === binding.channel
    && pointer.digest === binding.digest
    && pointer.namespace === binding.namespace
    && pointer.target === binding.platform
    && pointer.protocolVersion === binding.protocolVersion
    && pointer.version === binding.version;
}

async function fetchJsonDocument(
  url: string,
  label: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new ClosureUpdateError(`${label} request returned HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 16 * 1024 * 1024) {
    throw new ClosureUpdateError(`${label} exceeds the 16 MiB metadata limit`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ClosureUpdateError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function inventoryDigest(files: ReturnType<typeof validateClosureFileInventory>["files"]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(files)).digest("hex")}`;
}

async function fetchCandidateDocuments(
  candidate: ClosureReleaseCandidate,
  fetchImpl: typeof globalThis.fetch,
): Promise<{
  inventory: ReturnType<typeof validateClosureFileInventory>;
  manifest: ClosureCandidateManifest;
}> {
  const [manifestValue, inventoryValue] = await Promise.all([
    fetchJsonDocument(candidate.assets.manifest, "Closure manifest", fetchImpl),
    fetchJsonDocument(candidate.assets.inventory, "Closure inventory", fetchImpl),
  ]);
  const manifest = validateClosureCandidateManifest(manifestValue);
  if (JSON.stringify(manifest) !== JSON.stringify(candidate.manifest)) {
    throw new ClosureUpdateError("downloaded Closure manifest does not match release metadata");
  }
  const inventory = validateClosureFileInventory(inventoryValue);
  if (inventoryDigest(inventory.files) !== manifest.artifact.inventoryDigest) {
    throw new ClosureUpdateError("downloaded Closure inventory does not match its manifest digest");
  }
  return { inventory, manifest };
}

function stagedVersionPaths(
  finalPaths: ClosureStoreVersionPaths,
  stageRoot: string,
): ClosureStoreVersionPaths {
  return {
    ...finalPaths,
    archivePath: join(stageRoot, "closure.zip"),
    inventoryPath: join(stageRoot, "inventory.json"),
    manifestPath: join(stageRoot, "manifest.json"),
    payloadRoot: join(stageRoot, "payload"),
    versionRoot: stageRoot,
  };
}

function candidateIsReferenced(
  descriptor: ClosureBindingDescriptor,
  binding: ReturnType<typeof bindClosureCandidateIdentity>,
): boolean {
  return descriptor.committed != null
    && sameCandidate(descriptor.committed.standalone, binding);
}

async function ensureCandidateMaterialized(input: {
  candidate: ClosureReleaseCandidate;
  descriptor: ClosureBindingDescriptor;
  fetchImpl: typeof globalThis.fetch;
  paths: ClosureStorePaths;
}): Promise<StoredClosureVerification> {
  const binding = bindClosureCandidateIdentity(input.candidate.manifest.identity, input.paths.namespace);
  const finalPaths = resolveClosureStoreVersionPaths(input.paths, binding);
  const existing = await stat(finalPaths.versionRoot).catch(() => null);
  if (existing != null) {
    try {
      return await verifyStoredClosureCandidate(input.paths, binding);
    } catch (error) {
      if (candidateIsReferenced(input.descriptor, binding)) throw error;
      await rm(finalPaths.versionRoot, { force: true, recursive: true });
    }
  }

  const stageRoot = join(
    input.paths.stagingRoot,
    `${binding.version}-${binding.digest.slice("sha256:".length)}-${randomUUID()}`,
  );
  const stagePaths = stagedVersionPaths(finalPaths, stageRoot);
  await mkdir(stagePaths.payloadRoot, { recursive: true });
  try {
    const documents = await fetchCandidateDocuments(input.candidate, input.fetchImpl);
    await Promise.all([
      writeFile(stagePaths.manifestPath, `${JSON.stringify(documents.manifest, null, 2)}\n`, "utf8"),
      writeFile(stagePaths.inventoryPath, `${JSON.stringify(documents.inventory, null, 2)}\n`, "utf8"),
      downloadCopyAndClear({
        basePath: join(input.paths.stagingRoot, "downloads"),
        bucket: "closure",
        fetch: input.fetchImpl,
        fileName: `${binding.digest.slice("sha256:".length)}.zip`,
        outputPath: stagePaths.archivePath,
        payload: {
          checksum: {
            algorithm: "sha256",
            value: binding.digest.slice("sha256:".length),
          },
          url: input.candidate.assets.archive,
        },
      }),
    ]);
    await extractZip(stagePaths.archivePath, { dir: stagePaths.payloadRoot });
    const stagedVerification = await verifyMaterializedClosureCandidate(input.paths, binding, stagePaths);
    await mkdir(dirname(finalPaths.versionRoot), { recursive: true });
    try {
      await rename(stageRoot, finalPaths.versionRoot);
    } catch (error) {
      if (errorCode(error) !== "EEXIST" && errorCode(error) !== "ENOTEMPTY") throw error;
      return await verifyStoredClosureCandidate(input.paths, binding);
    }
    return { ...stagedVerification, paths: finalPaths };
  } finally {
    await rm(stageRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function ensureDistributionBlob(input: {
  artifact: ClosureDistributionBlob;
  fetchImpl: typeof globalThis.fetch;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
}): Promise<string> {
  if (input.artifact.mediaType !== "application/zip") {
    throw new ClosureUpdateError(
      `unsupported Closure distribution blob media type: ${input.artifact.mediaType}`,
    );
  }
  try {
    return await verifyClosureDistributionBlob(input.paths, input.artifact);
  } catch {
    const digest = input.artifact.digest.slice("sha256:".length);
    const outputPath = join(input.paths.blobsRoot, digest);
    const accept = async (candidatePath: string): Promise<string> => {
      const metadata = await stat(candidatePath);
      if (metadata.size !== input.artifact.size) throw new ClosureUpdateError("Closure blob candidate size mismatch");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(candidatePath)) hash.update(chunk as Buffer);
      if (`sha256:${hash.digest("hex")}` !== input.artifact.digest) {
        throw new ClosureUpdateError("Closure blob candidate digest mismatch");
      }
      await mkdir(input.paths.blobsRoot, { recursive: true });
      try {
        await rename(candidatePath, outputPath);
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(errorCode(error) ?? "")) throw error;
        try {
          return await verifyClosureDistributionBlob(input.paths, input.artifact);
        } catch {
          await rm(outputPath, { force: true });
          await rename(candidatePath, outputPath);
        }
      }
      return await verifyClosureDistributionBlob(input.paths, input.artifact);
    };
    const candidatePath = () => join(
      input.paths.stagingRoot,
      "blob-downloads",
      `${digest}-${randomUUID()}.zip`,
    );

    for (const seed of input.repository?.localSeeds ?? []) {
      const temporaryPath = candidatePath();
      try {
        await mkdir(dirname(temporaryPath), { recursive: true });
        await copyFile(join(seed.root, input.paths.channel, "blobs", digest), temporaryPath);
        return await accept(temporaryPath);
      } catch {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    }

    const configuredUrls = (input.repository?.remoteOrigins ?? []).map(
      (origin) => `${origin}/${input.paths.channel}/blobs/${digest}`,
    );
    const urls = [...new Set([...configuredUrls, input.artifact.url])];
    let lastError: unknown = null;
    for (const url of urls) {
      const temporaryPath = candidatePath();
      try {
        await downloadCopyAndClear({
          basePath: join(input.paths.stagingRoot, "downloads"),
          bucket: "closure-blobs",
          fetch: input.fetchImpl,
          fileName: `${digest}.zip`,
          outputPath: temporaryPath,
          payload: {
            checksum: { algorithm: "sha256", value: digest },
            url,
          },
        });
        return await accept(temporaryPath);
      } catch (error) {
        lastError = error;
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    }
    const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
    throw new ClosureUpdateError(`Closure blob is unavailable from every configured source${detail}`, {
      cause: lastError,
    });
  }
}

export async function ensureClosureDistributionBlob(input: Readonly<{
  artifact: ClosureDistributionBlob;
  fetch?: typeof globalThis.fetch;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
}>): Promise<string> {
  return await ensureDistributionBlob({
    artifact: input.artifact,
    fetchImpl: input.fetch ?? globalThis.fetch,
    paths: input.paths,
    ...(input.repository == null ? {} : { repository: input.repository }),
  });
}

async function inspectResourceFiles(root: string, current = root): Promise<Array<{
  digest: `sha256:${string}`;
  path: string;
  size: number;
}>> {
  const files: Array<{ digest: `sha256:${string}`; path: string; size: number }> = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new ClosureUpdateError("Closure resource must not contain symlinks");
    if (entry.isDirectory()) files.push(...await inspectResourceFiles(root, path));
    else if (entry.isFile()) {
      const metadata = await stat(path);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
      files.push({
        digest: `sha256:${hash.digest("hex")}`,
        path: path.slice(root.length + 1).split("\\").join("/"),
        size: metadata.size,
      });
    } else throw new ClosureUpdateError("Closure resource contains an unsupported entry");
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function verifyResourceRoot(
  root: string,
  expected: `sha256:${string}`,
): Promise<void> {
  const files = await inspectResourceFiles(root);
  if (files.length === 0) throw new ClosureUpdateError("Closure resource is empty");
  const actual = createClosureComponentTreeDigest(files, (canonical) => (
    `sha256:${createHash("sha256").update(canonical).digest("hex")}`
  ));
  if (actual !== expected) throw new ClosureUpdateError("Closure resource tree does not match its manifest");
}

export async function ensureClosureResource(input: Readonly<{
  fetch?: typeof globalThis.fetch;
  id: string;
  manifest: ClosureDistributionManifest;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
  target: string;
}>): Promise<Readonly<{ id: string; path: string; reused: boolean; title: string }>> {
  const plan = planClosureDistributionGeneration(input.paths, 0, input.manifest, input.target);
  const resource = plan.resources.find((entry) => entry.id === input.id);
  if (resource == null) throw new ClosureUpdateError(`Closure resource is not locked by this version: ${input.id}`);
  try {
    await verifyResourceRoot(resource.resourceRoot, resource.treeDigest);
    return Object.freeze({ id: resource.id, path: resource.resourceRoot, reused: true, title: resource.title });
  } catch {
    // Continue through the same repository resolver as required components.
  }
  const blobPath = await ensureClosureDistributionBlob({
    artifact: resource.artifact,
    ...(input.fetch == null ? {} : { fetch: input.fetch }),
    paths: input.paths,
    ...(input.repository == null ? {} : { repository: input.repository }),
  });
  const stageRoot = join(input.paths.stagingRoot, `resource-${resource.id}-${randomUUID()}`);
  try {
    await mkdir(stageRoot, { recursive: true });
    await extractZip(blobPath, { dir: stageRoot });
    await verifyResourceRoot(stageRoot, resource.treeDigest);
    await mkdir(dirname(resource.resourceRoot), { recursive: true });
    try {
      await rename(stageRoot, resource.resourceRoot);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(errorCode(error) ?? "")) throw error;
      await verifyResourceRoot(resource.resourceRoot, resource.treeDigest);
    }
    return Object.freeze({ id: resource.id, path: resource.resourceRoot, reused: false, title: resource.title });
  } finally {
    await rm(stageRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function stageClosureDistributionGeneration(input: {
  candidate: ClosureDistributionReleaseCandidate;
  descriptor: ClosureBindingDescriptor;
  fetchImpl: typeof globalThis.fetch;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
}) {
  const plan = planClosureDistributionGeneration(
    input.paths,
    input.descriptor.nextGeneration,
    input.candidate.manifest,
    input.candidate.target,
  );
  const components = Object.entries(plan.required);
  const ensured = new Set<string>();
  for (const [, component] of components) {
    if (ensured.has(component.artifact.digest)) continue;
    await ensureDistributionBlob({
      artifact: component.artifact,
      fetchImpl: input.fetchImpl,
      paths: input.paths,
      ...(input.repository == null ? {} : { repository: input.repository }),
    });
    ensured.add(component.artifact.digest);
  }

  const stageRoot = join(
    input.paths.stagingRoot,
    `generation-${plan.generation}-${plan.identity.digest.slice("sha256:".length)}-${randomUUID()}`,
  );
  await mkdir(stageRoot, { recursive: true });
  try {
    await Promise.all(components.map(async ([name, component]) => {
      const componentRoot = join(stageRoot, name);
      await mkdir(componentRoot, { recursive: true });
      await extractZip(component.blobPath, { dir: componentRoot });
    }));
    await writeFile(
      join(stageRoot, "closure.json"),
      `${JSON.stringify(plan.manifest, null, 2)}\n`,
      "utf8",
    );
    return await verifyMaterializedClosureDistributionGeneration(
      input.paths,
      plan,
      stageRoot,
    );
  } catch (error) {
    await rm(stageRoot, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

/** Apply one already-selected v2 distribution graph to the local Store. */
export async function applyClosureDistributionUpdate(input: {
  candidate: ClosureDistributionReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
  shellType: string;
  shellVersion: string;
}): Promise<ApplyClosureDistributionUpdateResult> {
  const lock = await acquireUpdateLock(input.paths);
  if (lock == null) {
    return { candidate: input.candidate, reason: "another-updater-active", state: "busy" };
  }
  try {
    const descriptor = await readClosureBindingDescriptor(input.paths);
    const decision = decideClosureDistributionUpdate({
      candidate: input.candidate,
      descriptor,
      shellType: input.shellType,
      shellVersion: input.shellVersion,
    });
    if (decision.action === "retain") {
      return { candidate: input.candidate, reason: decision.reason, state: "retained" };
    }
    const verification = await stageClosureDistributionGeneration({
      candidate: input.candidate,
      descriptor,
      fetchImpl: input.fetch ?? globalThis.fetch,
      paths: input.paths,
      ...(input.repository == null ? {} : { repository: input.repository }),
    });
    try {
      const committed = await commitVerifiedClosureDistributionGeneration(
        input.paths,
        verification,
        input.candidate.releaseVersion,
      );
      return {
        candidate: input.candidate,
        pointer: committed.committed.standalone,
        reason: decision.reason,
        state: "committed",
      };
    } finally {
      await rm(verification.materializedRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  } finally {
    await releaseUpdateLock(lock);
  }
}

export async function applyClosureUpdate(input: {
  candidate: ClosureReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  paths: ClosureStorePaths;
  shellType: string;
  shellVersion: string;
}): Promise<ApplyClosureUpdateResult> {
  const lock = await acquireUpdateLock(input.paths);
  if (lock == null) {
    return { candidate: input.candidate, reason: "another-updater-active", state: "busy" };
  }
  try {
    const descriptor = await readClosureBindingDescriptor(input.paths);
    const decision = decideClosureUpdate({
      candidate: input.candidate,
      descriptor,
      shellType: input.shellType,
      shellVersion: input.shellVersion,
    });
    if (decision.action === "retain") {
      return { candidate: input.candidate, reason: decision.reason, state: "retained" };
    }
    const verification = await ensureCandidateMaterialized({
      candidate: input.candidate,
      descriptor,
      fetchImpl: input.fetch ?? globalThis.fetch,
      paths: input.paths,
    });

    const currentDescriptor = await readClosureBindingDescriptor(input.paths);
    const currentDecision = decideClosureUpdate({
      candidate: input.candidate,
      descriptor: currentDescriptor,
      shellType: input.shellType,
      shellVersion: input.shellVersion,
    });
    if (currentDecision.action === "retain") {
      return { candidate: input.candidate, reason: currentDecision.reason, state: "retained" };
    }
    const committed = await commitVerifiedStoredClosureCandidate(
      input.paths,
      verification,
      input.candidate.releaseVersion,
    );
    return {
      candidate: input.candidate,
      pointer: committed.committed.standalone,
      reason: currentDecision.reason,
      state: "committed",
    };
  } finally {
    await releaseUpdateLock(lock);
  }
}

export async function updateClosureFromRelease(input: {
  channel: string;
  fetch?: typeof globalThis.fetch;
  metadataUrl: string;
  paths: ClosureStorePaths;
  platform: string;
  releaseTarget: string;
  repository?: ClosureResourceRepositoryConfig;
  shellType: string;
  shellVersion: string;
}): Promise<ApplyClosureReleaseUpdateResult> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const metadataUrl = requireHttpUrl(input.metadataUrl, "Closure release metadata URL");
  const metadata = await fetchJsonDocument(metadataUrl, "Closure release metadata", fetchImpl);
  const distribution = selectClosureDistributionReleaseCandidate(metadata, {
    channel: input.channel,
    target: input.platform,
  });
  if (distribution != null) {
    return await applyClosureDistributionUpdate({
      candidate: distribution,
      fetch: fetchImpl,
      paths: input.paths,
      ...(input.repository == null ? {} : { repository: input.repository }),
      shellType: input.shellType,
      shellVersion: input.shellVersion,
    });
  }
  const candidate = selectClosureReleaseCandidate(metadata, input);
  return await applyClosureUpdate({
    candidate,
    fetch: fetchImpl,
    paths: input.paths,
    shellType: input.shellType,
    shellVersion: input.shellVersion,
  });
}
