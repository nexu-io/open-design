import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
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


import {
  ClosureReleaseCandidate,
  ClosureDistributionReleaseCandidate,
  ClosureUpdateError,
  ClosureResourceRepositoryConfig,
  ApplyClosureUpdateResult,
  ApplyClosureDistributionUpdateResult,
  ClosureDistributionUpdateProgress,
  reportDistributionProgress,
  ApplyClosureReleaseUpdateResult,
  requireHttpUrl,
  selectClosureReleaseCandidate,
  selectClosureDistributionReleaseCandidate,
  compareClosureShellVersions,
  resolveClosureShellMinimumVersion,
  decideClosureUpdate,
  decideClosureDistributionUpdate,
  UpdateLock,
  UpdateLockRecord,
  INCOMPLETE_UPDATE_LOCK_GRACE_MS,
} from "./index.js";

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

export async function fetchJsonDocument(
  url: string,
  label: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const requestUrl = new URL(url);
    const requestLocation = `${requestUrl.origin}${requestUrl.pathname}`;
    throw new ClosureUpdateError(
      `${label} request to ${requestLocation} returned HTTP ${response.status}`,
    );
  }
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

async function cloneOrCopy(source: string, destination: string): Promise<void> {
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_FICLONE);
  } catch {
    await rm(destination, { force: true });
    await copyFile(source, destination);
  }
}

async function ensureDistributionBlob(input: {
  artifact: ClosureDistributionBlob;
  fetchImpl: typeof globalThis.fetch;
  onProgress?: (completedBytes: number) => void;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
}): Promise<string> {
  if (input.artifact.mediaType !== "application/zip") {
    throw new ClosureUpdateError(
      `unsupported Closure distribution blob media type: ${input.artifact.mediaType}`,
    );
  }
  try {
    const verified = await verifyClosureDistributionBlob(input.paths, input.artifact);
    input.onProgress?.(input.artifact.size);
    return verified;
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
          const verified = await verifyClosureDistributionBlob(input.paths, input.artifact);
          input.onProgress?.(input.artifact.size);
          return verified;
        } catch {
          await rm(outputPath, { force: true });
          await rename(candidatePath, outputPath);
        }
      }
      const verified = await verifyClosureDistributionBlob(input.paths, input.artifact);
      input.onProgress?.(input.artifact.size);
      return verified;
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
        await cloneOrCopy(join(seed.root, input.paths.channel, "blobs", digest), temporaryPath);
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
          onProgress(progress) {
            input.onProgress?.(Math.min(progress.receivedBytes, input.artifact.size));
          },
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
  onProgress?: (progress: ClosureDistributionUpdateProgress) => void;
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
  const uniqueComponents = [...new Map(
    components.map(([, component]) => [component.artifact.digest, component] as const),
  ).values()];
  const totalBytes = uniqueComponents.reduce(
    (total, component) => total + component.artifact.size,
    0,
  );
  let completedBytes = 0;
  reportDistributionProgress(input.onProgress, { completedBytes, phase: "download", totalBytes });
  for (const component of uniqueComponents) {
    let reportedArtifactBytes = 0;
    await ensureDistributionBlob({
      artifact: component.artifact,
      fetchImpl: input.fetchImpl,
      onProgress(artifactBytes) {
        reportedArtifactBytes = Math.max(
          reportedArtifactBytes,
          Math.min(artifactBytes, component.artifact.size),
        );
        reportDistributionProgress(input.onProgress, {
          completedBytes: completedBytes + reportedArtifactBytes,
          phase: "download",
          totalBytes,
        });
      },
      paths: input.paths,
      ...(input.repository == null ? {} : { repository: input.repository }),
    });
    completedBytes += component.artifact.size;
    reportDistributionProgress(input.onProgress, { completedBytes, phase: "download", totalBytes });
  }

  const stageRoot = join(
    input.paths.stagingRoot,
    `generation-${plan.generation}-${plan.identity.digest.slice("sha256:".length)}-${randomUUID()}`,
  );
  await mkdir(stageRoot, { recursive: true });
  try {
    let completedComponents = 0;
    reportDistributionProgress(input.onProgress, {
      completedComponents,
      phase: "materialize",
      totalComponents: components.length,
    });
    await Promise.all(components.map(async ([name, component]) => {
      const componentRoot = join(stageRoot, name);
      await mkdir(componentRoot, { recursive: true });
      await extractZip(component.blobPath, { dir: componentRoot });
      completedComponents += 1;
      reportDistributionProgress(input.onProgress, {
        completedComponents,
        phase: "materialize",
        totalComponents: components.length,
      });
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
  onProgress?: (progress: ClosureDistributionUpdateProgress) => void;
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
      ...(input.onProgress == null ? {} : { onProgress: input.onProgress }),
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

/**
 * Re-materialize the exact content identity and advance only the runtime fence.
 */
export async function repairCommittedClosureDistribution(input: {
  candidate: ClosureDistributionReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  onProgress?: (progress: ClosureDistributionUpdateProgress) => void;
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
    const committed = descriptor.committed;
    if (committed == null) {
      throw new ClosureUpdateError("Closure repair requires a committed binding");
    }
    const minimum = resolveClosureShellMinimumVersion(input.candidate.manifest, input.shellType);
    if (minimum == null || compareClosureShellVersions(input.shellVersion, minimum) < 0) {
      return { candidate: input.candidate, reason: "shell-incompatible", state: "retained" };
    }
    if (
      input.candidate.releaseVersion !== committed.releaseVersion
      || input.candidate.manifest.identity.version !== committed.standalone.version
      || input.candidate.manifest.identity.digest !== committed.standalone.digest
      || input.candidate.target !== committed.standalone.target
    ) {
      throw new ClosureUpdateError("Closure repair candidate does not match the committed immutable binding");
    }
    const verification = await stageClosureDistributionGeneration({
      candidate: input.candidate,
      descriptor,
      fetchImpl: input.fetch ?? globalThis.fetch,
      ...(input.onProgress == null ? {} : { onProgress: input.onProgress }),
      paths: input.paths,
      ...(input.repository == null ? {} : { repository: input.repository }),
    });
    try {
      const repaired = await commitVerifiedClosureDistributionGeneration(
        input.paths,
        verification,
        input.candidate.releaseVersion,
      );
      return {
        candidate: input.candidate,
        pointer: repaired.committed.standalone,
        reason: "repair-committed-closure",
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
