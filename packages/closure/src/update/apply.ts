import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import {
  bindClosureCandidateIdentity,
  validateClosureCandidateManifest,
  validateClosureDistributionManifest,
  validateClosureFileInventory,
  type ClosureCandidateManifest,
  type ClosureDistributionManifest,
} from "../protocol/index.js";
import type { ClosureBindingDescriptor } from "../store/index.js";
import {
  acquireClosureChannelLock,
  prepareVerifiedClosureDistributionGeneration,
  prepareVerifiedStoredClosureCandidate,
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  resolveClosureStoreVersionPaths,
  verifyMaterializedClosureCandidate,
  verifyMaterializedClosureDistributionGeneration,
  verifyStoredClosureCandidate,
  releaseClosureChannelLock,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type ClosureStoreVersionPaths,
  type StoredClosureVerification,
} from "../store/index.js";
import { downloadCopyAndClear } from "@open-design/download";
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
} from "./index.js";
import { ensureDistributionBlob } from "./resource.js";

function errorCode(error: unknown): string | null {
  if (error == null || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
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
  return [descriptor.active, descriptor.attempt, descriptor.lastSuccessful, descriptor.prepared]
    .some((reference) => reference != null && sameCandidate(reference.standalone, binding));
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
      onProgress(progress) {
        const artifactBytes = progress.phase === "copying" || progress.phase === "downloading"
          ? progress.completedBytes
          : progress.phase === "ready" ? component.artifact.size : reportedArtifactBytes;
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
  const lock = await acquireClosureChannelLock(input.paths, { waitMs: 250 });
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
      const prepared = await prepareVerifiedClosureDistributionGeneration(
        input.paths,
        verification,
        input.candidate.releaseVersion,
      );
      return {
        candidate: input.candidate,
        pointer: prepared.prepared.standalone,
        reason: decision.reason,
        state: "prepared",
      };
    } finally {
      await rm(verification.materializedRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  } finally {
    await releaseClosureChannelLock(lock);
  }
}

/**
 * Re-materialize the exact content identity and advance only the runtime fence.
 */
export async function repairActiveClosureDistribution(input: {
  candidate: ClosureDistributionReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  onProgress?: (progress: ClosureDistributionUpdateProgress) => void;
  paths: ClosureStorePaths;
  repository?: ClosureResourceRepositoryConfig;
  shellType: string;
  shellVersion: string;
}): Promise<ApplyClosureDistributionUpdateResult> {
  const lock = await acquireClosureChannelLock(input.paths, { waitMs: 250 });
  if (lock == null) {
    return { candidate: input.candidate, reason: "another-updater-active", state: "busy" };
  }
  try {
    const descriptor = await readClosureBindingDescriptor(input.paths);
    const active = descriptor.active;
    if (active == null) {
      throw new ClosureUpdateError("Closure repair requires an active binding");
    }
    const minimum = resolveClosureShellMinimumVersion(input.candidate.manifest, input.shellType);
    if (minimum == null || compareClosureShellVersions(input.shellVersion, minimum) < 0) {
      return { candidate: input.candidate, reason: "shell-incompatible", state: "retained" };
    }
    if (
      input.candidate.releaseVersion !== active.releaseVersion
      || input.candidate.manifest.identity.version !== active.standalone.version
      || input.candidate.manifest.identity.digest !== active.standalone.digest
      || input.candidate.target !== active.standalone.target
    ) {
      throw new ClosureUpdateError("Closure repair candidate does not match the active immutable binding");
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
      const repaired = await prepareVerifiedClosureDistributionGeneration(
        input.paths,
        verification,
        input.candidate.releaseVersion,
      );
      return {
        candidate: input.candidate,
        pointer: repaired.prepared.standalone,
        reason: "repair-active-closure",
        state: "prepared",
      };
    } finally {
      await rm(verification.materializedRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  } finally {
    await releaseClosureChannelLock(lock);
  }
}

export async function applyClosureUpdate(input: {
  candidate: ClosureReleaseCandidate;
  fetch?: typeof globalThis.fetch;
  paths: ClosureStorePaths;
  shellType: string;
  shellVersion: string;
}): Promise<ApplyClosureUpdateResult> {
  const lock = await acquireClosureChannelLock(input.paths, { waitMs: 250 });
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
    const prepared = await prepareVerifiedStoredClosureCandidate(
      input.paths,
      verification,
      input.candidate.releaseVersion,
    );
    return {
      candidate: input.candidate,
      pointer: prepared.prepared.standalone,
      reason: currentDecision.reason,
      state: "prepared",
    };
  } finally {
    await releaseClosureChannelLock(lock);
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
