import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  bindClosureCandidateIdentity,
  validateClosureBindingIdentity,
  validateClosureCandidateManifest,
  validateClosureFileInventory,
  type ClosureBindingIdentity,
  type ClosureCandidateManifest,
  type ClosureFileInventory,
} from "../protocol/index.js";
import { writeJsonFile } from "@open-design/sidecar";

import {
  CLOSURE_BINDING_SCHEMA_VERSION,
  ClosureStoreError,
  assertUnderRoot,
  digestFile,
  normalizeReleaseVersion,
  readOptionalJson,
  readRequiredJson,
  resolveClosureStoreVersionPaths,
  sameBinding,
  validateClosureBindingDescriptor,
  type ClosureBindingDescriptor,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type ClosureStoreVersionPaths,
  type ClosureReleaseBinding,
  type StoredClosureVerification,
} from "./binding.js";

export function compareName(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const CLOSURE_VERIFY_IO_CONCURRENCY = 16;

async function collectPayloadFiles(root: string): Promise<ClosureFileInventory["files"]> {
  const directories = [root];
  const discovered: Array<{ absolutePath: string; archivePath: string }> = [];

  // Traverse in bounded batches: Windows Closure payloads contain thousands
  // of directories, so serial readdir/lstat turns Defender latency into a
  // multi-minute cold start. Dirent still rejects links and special files; the
  // queue only changes I/O scheduling, not the verified inventory contract.
  while (directories.length > 0) {
    const batch = directories.splice(0, CLOSURE_VERIFY_IO_CONCURRENCY);
    const batches = await Promise.all(batch.map(async (current) => {
      const entries = await readdir(current, { withFileTypes: true }).catch((error) => {
        throw new ClosureStoreError(`Closure payload is missing or unreadable at ${current}: ${
          error instanceof Error ? error.message : String(error)
        }`);
      });
      return { current, entries: entries.sort((left, right) => compareName(left.name, right.name)) };
    }));
    for (const { current, entries } of batches) {
      for (const entry of entries) {
        const absolutePath = join(current, entry.name);
        const archivePath = relative(root, absolutePath).split(sep).join("/");
        if (entry.isSymbolicLink()) {
          throw new ClosureStoreError(`Closure payload contains a symlink: ${archivePath}`);
        }
        if (entry.isDirectory()) {
          directories.push(absolutePath);
          continue;
        }
        if (!entry.isFile()) {
          const metadata = await lstat(absolutePath);
          if (metadata.isSymbolicLink()) {
            throw new ClosureStoreError(`Closure payload contains a symlink: ${archivePath}`);
          }
          if (metadata.isDirectory()) {
            directories.push(absolutePath);
            continue;
          }
          if (!metadata.isFile()) {
            throw new ClosureStoreError(`Closure payload contains an unsupported entry: ${archivePath}`);
          }
        }
        discovered.push({ absolutePath, archivePath });
      }
    }
  }

  discovered.sort((left, right) => compareName(left.archivePath, right.archivePath));
  const files = new Array<ClosureFileInventory["files"][number]>(discovered.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(CLOSURE_VERIFY_IO_CONCURRENCY, discovered.length) },
    async () => {
      while (nextIndex < discovered.length) {
        const index = nextIndex++;
        const file = discovered[index]!;
        const identity = await digestFile(file.absolutePath);
        files[index] = {
          digest: identity.digest as `sha256:${string}`,
          path: file.archivePath,
          size: identity.size,
        };
      }
    },
  );
  await Promise.all(workers);
  return files;
}

function inventoryDigest(inventory: ClosureFileInventory): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(inventory.files)).digest("hex")}`;
}

export async function verifyStoredClosureCandidate(
  paths: ClosureStorePaths,
  expectedBinding: ClosureBindingIdentity,
): Promise<StoredClosureVerification> {
  const binding = validateClosureBindingIdentity(expectedBinding, paths);
  const versionPaths = resolveClosureStoreVersionPaths(paths, binding);
  return await verifyMaterializedClosureCandidate(paths, binding, versionPaths);
}

export async function verifyMaterializedClosureCandidate(
  paths: ClosureStorePaths,
  expectedBinding: ClosureBindingIdentity,
  materializedPaths: ClosureStoreVersionPaths,
): Promise<StoredClosureVerification> {
  const binding = validateClosureBindingIdentity(expectedBinding, paths);
  if (
    materializedPaths.root !== paths.root
    || materializedPaths.channel !== paths.channel
    || materializedPaths.namespace !== paths.namespace
    || materializedPaths.version !== binding.version
    || materializedPaths.digest !== binding.digest.slice("sha256:".length)
  ) {
    throw new ClosureStoreError("materialized Closure paths do not match their Store binding");
  }
  const versionPaths: ClosureStoreVersionPaths = {
    ...materializedPaths,
    archivePath: assertUnderRoot(paths.root, materializedPaths.archivePath),
    inventoryPath: assertUnderRoot(paths.root, materializedPaths.inventoryPath),
    manifestPath: assertUnderRoot(paths.root, materializedPaths.manifestPath),
    payloadRoot: assertUnderRoot(paths.root, materializedPaths.payloadRoot),
    versionRoot: assertUnderRoot(paths.root, materializedPaths.versionRoot),
  };
  const manifest = validateClosureCandidateManifest(
    await readRequiredJson(versionPaths.manifestPath, "Closure candidate manifest"),
  );
  const manifestBinding = bindClosureCandidateIdentity(manifest.identity, paths.namespace);
  if (!sameBinding(binding, manifestBinding)) {
    throw new ClosureStoreError("stored Closure manifest does not match the requested binding");
  }
  const archive = await digestFile(versionPaths.archivePath);
  if (archive.digest !== manifest.artifact.digest || archive.size !== manifest.artifact.size) {
    throw new ClosureStoreError("stored Closure archive does not match its manifest digest and size");
  }
  const inventory = validateClosureFileInventory(
    await readRequiredJson(versionPaths.inventoryPath, "Closure file inventory"),
  );
  const expectedInventoryDigest = inventoryDigest(inventory);
  if (expectedInventoryDigest !== manifest.artifact.inventoryDigest) {
    throw new ClosureStoreError("stored Closure inventory does not match its manifest digest");
  }
  const actualFiles = (await collectPayloadFiles(versionPaths.payloadRoot)).sort(
    (left, right) => compareName(left.path, right.path),
  );
  if (JSON.stringify(actualFiles) !== JSON.stringify(inventory.files)) {
    throw new ClosureStoreError("materialized Closure payload does not match its inventory");
  }
  if (!(await stat(join(versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH)).catch(() => null))?.isFile()) {
    throw new ClosureStoreError(`materialized Closure entry is missing: ${CLOSURE_ARCHIVE_ENTRY_PATH}`);
  }
  return {
    binding,
    inventory,
    inventoryDigest: expectedInventoryDigest,
    manifest,
    paths: versionPaths,
  };
}

function emptyBinding(paths: ClosureStorePaths, now: string): ClosureBindingDescriptor {
  return {
    active: null,
    attempt: null,
    activationIntent: null,
    channel: paths.channel,
    lastSuccessful: null,
    namespace: paths.namespace,
    nextGeneration: 0,
    prepared: null,
    schemaVersion: CLOSURE_BINDING_SCHEMA_VERSION,
    updatedAt: now,
  };
}

export async function readClosureBindingDescriptor(paths: ClosureStorePaths): Promise<ClosureBindingDescriptor> {
  const raw = await readOptionalJson(paths.bindingPath, "Closure binding descriptor");
  return raw == null
    ? emptyBinding(paths, new Date(0).toISOString())
    : validateClosureBindingDescriptor(raw, paths);
}

export async function prepareStoredClosureCandidate(
  paths: ClosureStorePaths,
  binding: ClosureBindingIdentity,
  releaseVersion: string,
): Promise<{
  prepared: ClosureReleaseBinding;
  descriptor: ClosureBindingDescriptor;
  verification: StoredClosureVerification;
}> {
  const verification = await verifyStoredClosureCandidate(paths, binding);
  return await prepareVerifiedStoredClosureCandidate(paths, verification, releaseVersion);
}

/**
 * Prepare a candidate whose exact materialized bytes were already verified.
 *
 * Fresh update staging verifies every inventory entry before an atomic rename
 * into the Store. Carrying that proof across the rename avoids hashing a large
 * Windows Closure two more times while preserving the one full byte-level
 * verification before the binding becomes visible.
 */
export async function prepareVerifiedStoredClosureCandidate(
  paths: ClosureStorePaths,
  verification: StoredClosureVerification,
  releaseVersion: string,
): Promise<{
  prepared: ClosureReleaseBinding;
  descriptor: ClosureBindingDescriptor;
  verification: StoredClosureVerification;
}> {
  const binding = validateClosureBindingIdentity(verification.binding, paths);
  const expectedPaths = resolveClosureStoreVersionPaths(paths, binding);
  if (
    verification.paths.versionRoot !== expectedPaths.versionRoot
    || verification.paths.archivePath !== expectedPaths.archivePath
    || verification.paths.inventoryPath !== expectedPaths.inventoryPath
    || verification.paths.manifestPath !== expectedPaths.manifestPath
    || verification.paths.payloadRoot !== expectedPaths.payloadRoot
  ) {
    throw new ClosureStoreError("verified Closure paths do not match the prepared Store location");
  }
  const current = await readClosureBindingDescriptor(paths);
  const generation = current.nextGeneration;
  const pointer: ClosureRuntimePointer = {
    channel: binding.channel,
    digest: binding.digest,
    generation,
    namespace: binding.namespace,
    protocolVersion: binding.protocolVersion,
    target: binding.platform,
    version: binding.version,
  };
  const prepared: ClosureReleaseBinding = {
    releaseVersion: normalizeReleaseVersion(releaseVersion),
    standalone: pointer,
  };
  const descriptor: ClosureBindingDescriptor = {
    ...current,
    activationIntent: null,
    prepared,
    nextGeneration: generation + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.bindingPath, descriptor);
  return { prepared, descriptor, verification };
}
