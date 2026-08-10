import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  bindClosureCandidateIdentity,
  validateClosureCandidateManifest,
  validateClosureFileInventory,
  type ClosureCandidateManifest,
} from "@open-design/closure-proto";
import type { ClosureBindingDescriptor } from "@open-design/closure-store";
import {
  commitVerifiedStoredClosureCandidate,
  readClosureBindingDescriptor,
  resolveClosureStoreVersionPaths,
  verifyMaterializedClosureCandidate,
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
  constructor(message: string) {
    super(message);
    this.name = "ClosureUpdateError";
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
  manifest: ClosureCandidateManifest,
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
  pointer: Pick<ClosureRuntimePointer, "channel" | "digest" | "namespace" | "platform" | "protocolVersion" | "version">,
  binding: ReturnType<typeof bindClosureCandidateIdentity>,
): boolean {
  return pointer.channel === binding.channel
    && pointer.digest === binding.digest
    && pointer.namespace === binding.namespace
    && pointer.platform === binding.platform
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
  shellType: string;
  shellVersion: string;
}): Promise<ApplyClosureUpdateResult> {
  const candidate = await discoverClosureReleaseCandidate(input);
  return await applyClosureUpdate({
    candidate,
    ...(input.fetch == null ? {} : { fetch: input.fetch }),
    paths: input.paths,
    shellType: input.shellType,
    shellVersion: input.shellVersion,
  });
}
