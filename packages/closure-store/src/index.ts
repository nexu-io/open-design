import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  bindClosureCandidateIdentity,
  validateClosureBindingIdentity,
  validateClosureCandidateManifest,
  validateClosureFileInventory,
  type ClosureBindingIdentity,
  type ClosureCandidateManifest,
  type ClosureFileInventory,
} from "@open-design/closure-proto";
import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";
import { writeJsonFile } from "@open-design/sidecar";
import { normalizeNamespace } from "@open-design/sidecar-proto";

export const CLOSURE_BINDING_SCHEMA_VERSION = 1 as const;

export type ClosureStoreRequest = {
  channel: string;
  namespace: string;
  root: string;
};

export type ClosureStorePaths = {
  bindingPath: string;
  channel: ReleaseChannel;
  channelRoot: string;
  closureRoot: string;
  namespace: string;
  namespaceRoot: string;
  root: string;
  stagingRoot: string;
  stateRoot: string;
  versionsRoot: string;
};

export type ClosureStoreVersionPaths = ClosureStorePaths & {
  archivePath: string;
  digest: string;
  inventoryPath: string;
  manifestPath: string;
  payloadRoot: string;
  version: string;
  versionRoot: string;
};

export type ClosureRuntimePointer = ClosureBindingIdentity & {
  generation: number;
};

export type CommittedClosureBinding = {
  releaseVersion: string;
  standalone: ClosureRuntimePointer;
};

export type ClosureBindingDescriptor = {
  channel: ReleaseChannel;
  committed: CommittedClosureBinding | null;
  namespace: string;
  nextGeneration: number;
  schemaVersion: typeof CLOSURE_BINDING_SCHEMA_VERSION;
  updatedAt: string;
};

export type StoredClosureVerification = {
  binding: ClosureBindingIdentity;
  inventory: ClosureFileInventory;
  inventoryDigest: string;
  manifest: ClosureCandidateManifest;
  paths: ClosureStoreVersionPaths;
};

export class ClosureStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureStoreError";
  }
}

function normalizeRoot(value: string): string {
  if (value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    throw new ClosureStoreError(`Closure store root must be a non-empty absolute path: ${value}`);
  }
  return resolve(value);
}

function normalizeChannel(value: string): ReleaseChannel {
  if (!isReleaseChannel(value)) throw new ClosureStoreError(`unsupported Closure store channel: ${value}`);
  return value;
}

function normalizeStoreNamespace(value: string): string {
  try {
    return normalizeNamespace(value);
  } catch (error) {
    throw new ClosureStoreError(error instanceof Error ? error.message : String(error));
  }
}

function assertUnderRoot(root: string, target: string): string {
  const normalized = resolve(target);
  if (normalized !== root && !normalized.startsWith(`${root}${sep}`)) {
    throw new ClosureStoreError(`Closure store path escapes root: ${normalized}`);
  }
  return normalized;
}

export function resolveClosureStorePaths(request: ClosureStoreRequest): ClosureStorePaths {
  const root = normalizeRoot(request.root);
  const channel = normalizeChannel(request.channel);
  const namespace = normalizeStoreNamespace(request.namespace);
  const closureRoot = assertUnderRoot(root, join(root, "closure"));
  const channelRoot = assertUnderRoot(root, join(closureRoot, "channels", channel));
  const namespaceRoot = assertUnderRoot(root, join(channelRoot, "namespaces", namespace));
  const stateRoot = assertUnderRoot(root, join(namespaceRoot, "state"));
  return {
    bindingPath: assertUnderRoot(root, join(stateRoot, "binding.json")),
    channel,
    channelRoot,
    closureRoot,
    namespace,
    namespaceRoot,
    root,
    stagingRoot: assertUnderRoot(root, join(namespaceRoot, "staging")),
    stateRoot,
    versionsRoot: assertUnderRoot(root, join(namespaceRoot, "versions")),
  };
}

function sameBinding(left: ClosureBindingIdentity, right: ClosureBindingIdentity): boolean {
  return left.channel === right.channel
    && left.namespace === right.namespace
    && left.platform === right.platform
    && left.protocolVersion === right.protocolVersion
    && left.version === right.version
    && left.digest === right.digest;
}

function normalizeGeneration(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ClosureStoreError(`Closure generation must be a non-negative safe integer: ${String(value)}`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ClosureStoreError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new ClosureStoreError(`${label} contains unsupported fields: ${extras.join(", ")}`);
}

function normalizeIsoString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw new ClosureStoreError(`${label} must be an ISO timestamp`);
  }
  return value;
}

function normalizeReleaseVersion(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new ClosureStoreError("Closure release version must be a non-empty trimmed string");
  }
  return value;
}

function normalizePointer(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureRuntimePointer {
  const pointer = requireRecord(value, "Closure runtime pointer");
  assertExactKeys(pointer, [
    "channel",
    "digest",
    "generation",
    "namespace",
    "platform",
    "protocolVersion",
    "version",
  ], "Closure runtime pointer");
  return {
    ...validateClosureBindingIdentity(pointer, expected),
    generation: normalizeGeneration(pointer.generation),
  };
}

function normalizeCommittedBinding(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): CommittedClosureBinding {
  const committed = requireRecord(value, "Committed Closure binding");
  assertExactKeys(committed, ["releaseVersion", "standalone"], "Committed Closure binding");
  return {
    releaseVersion: normalizeReleaseVersion(committed.releaseVersion),
    standalone: normalizePointer(committed.standalone, expected),
  };
}

export function validateClosureBindingDescriptor(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureBindingDescriptor {
  const descriptor = requireRecord(value, "Closure binding descriptor");
  assertExactKeys(descriptor, [
    "channel",
    "committed",
    "namespace",
    "nextGeneration",
    "schemaVersion",
    "updatedAt",
  ], "Closure binding descriptor");
  if (descriptor.schemaVersion !== CLOSURE_BINDING_SCHEMA_VERSION) {
    throw new ClosureStoreError(`unsupported Closure binding schema: ${String(descriptor.schemaVersion)}`);
  }
  const channel = normalizeChannel(String(descriptor.channel));
  const namespace = normalizeStoreNamespace(String(descriptor.namespace));
  if (channel !== expected.channel || namespace !== expected.namespace) {
    throw new ClosureStoreError("Closure binding descriptor does not match its channel/namespace store");
  }
  const committed = descriptor.committed == null
    ? null
    : normalizeCommittedBinding(descriptor.committed, expected);
  const nextGeneration = normalizeGeneration(descriptor.nextGeneration);
  if (committed != null && committed.standalone.generation >= nextGeneration) {
    throw new ClosureStoreError("Closure nextGeneration must be greater than the committed generation");
  }
  return {
    channel,
    committed,
    namespace,
    nextGeneration,
    schemaVersion: CLOSURE_BINDING_SCHEMA_VERSION,
    updatedAt: normalizeIsoString(descriptor.updatedAt, "Closure binding updatedAt"),
  };
}

export function resolveClosureStoreVersionPaths(
  paths: ClosureStorePaths,
  binding: ClosureBindingIdentity,
): ClosureStoreVersionPaths {
  const identity = validateClosureBindingIdentity(binding, paths);
  const digest = identity.digest.slice("sha256:".length);
  const versionRoot = assertUnderRoot(paths.root, join(paths.versionsRoot, identity.version, digest));
  return {
    ...paths,
    archivePath: assertUnderRoot(paths.root, join(versionRoot, "closure.zip")),
    digest,
    inventoryPath: assertUnderRoot(paths.root, join(versionRoot, "inventory.json")),
    manifestPath: assertUnderRoot(paths.root, join(versionRoot, "manifest.json")),
    payloadRoot: assertUnderRoot(paths.root, join(versionRoot, "payload")),
    version: identity.version,
    versionRoot,
  };
}

async function readRequiredJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new ClosureStoreError(`${label} is missing or unreadable at ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

async function readOptionalJson(path: string, label: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ClosureStoreError(`${label} is unreadable at ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

async function digestFile(path: string): Promise<{ digest: string; size: number }> {
  const metadata = await stat(path).catch(() => null);
  if (metadata == null || !metadata.isFile()) throw new ClosureStoreError(`Closure file is missing: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { digest: `sha256:${hash.digest("hex")}`, size: metadata.size };
}

function compareName(left: string, right: string): number {
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
    channel: paths.channel,
    committed: null,
    namespace: paths.namespace,
    nextGeneration: 0,
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

export async function commitStoredClosureCandidate(
  paths: ClosureStorePaths,
  binding: ClosureBindingIdentity,
  releaseVersion: string,
): Promise<{
  committed: CommittedClosureBinding;
  descriptor: ClosureBindingDescriptor;
  verification: StoredClosureVerification;
}> {
  const verification = await verifyStoredClosureCandidate(paths, binding);
  return await commitVerifiedStoredClosureCandidate(paths, verification, releaseVersion);
}

/**
 * Commit a candidate whose exact materialized bytes were already verified.
 *
 * Fresh update staging verifies every inventory entry before an atomic rename
 * into the Store. Carrying that proof across the rename avoids hashing a large
 * Windows Closure two more times while preserving the one full byte-level
 * verification before the binding becomes visible.
 */
export async function commitVerifiedStoredClosureCandidate(
  paths: ClosureStorePaths,
  verification: StoredClosureVerification,
  releaseVersion: string,
): Promise<{
  committed: CommittedClosureBinding;
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
    throw new ClosureStoreError("verified Closure paths do not match the committed Store location");
  }
  const current = await readClosureBindingDescriptor(paths);
  const generation = current.nextGeneration;
  const pointer: ClosureRuntimePointer = { ...binding, generation };
  const committed: CommittedClosureBinding = {
    releaseVersion: normalizeReleaseVersion(releaseVersion),
    standalone: pointer,
  };
  const descriptor: ClosureBindingDescriptor = {
    ...current,
    committed,
    nextGeneration: generation + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.bindingPath, descriptor);
  return { committed, descriptor, verification };
}
