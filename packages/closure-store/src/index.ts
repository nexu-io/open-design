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
import { removeFile, writeJsonFile } from "@open-design/sidecar";
import { normalizeNamespace } from "@open-design/sidecar-proto";

export const CLOSURE_STORE_SCHEMA_VERSION = 1 as const;

export type ClosureStoreRequest = {
  channel: string;
  namespace: string;
  root: string;
};

export type ClosureStorePaths = {
  attemptsPath: string;
  channel: ReleaseChannel;
  channelRoot: string;
  closureRoot: string;
  namespace: string;
  namespaceRoot: string;
  root: string;
  runtimePath: string;
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

export type ClosureRuntimeDescriptor = {
  active: ClosureRuntimePointer | null;
  channel: ReleaseChannel;
  lastSuccessful: ClosureRuntimePointer | null;
  namespace: string;
  nextGeneration: number;
  schemaVersion: typeof CLOSURE_STORE_SCHEMA_VERSION;
  updatedAt: string;
};

export type ClosureAttemptDescriptor = ClosureRuntimePointer & {
  schemaVersion: typeof CLOSURE_STORE_SCHEMA_VERSION;
  startedAt: string;
};

export type ClosureRuntimeSelection =
  | { pointer: ClosureRuntimePointer; reason: "active" | "last-successful"; selected: true }
  | { reason: "no-runtime-target"; selected: false };

export type ClosureRecoveryResult = {
  descriptor: ClosureRuntimeDescriptor;
  recovered: boolean;
  selection: ClosureRuntimeSelection;
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
    attemptsPath: assertUnderRoot(root, join(stateRoot, "attempt.json")),
    channel,
    channelRoot,
    closureRoot,
    namespace,
    namespaceRoot,
    root,
    runtimePath: assertUnderRoot(root, join(stateRoot, "runtime.json")),
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

function samePointer(left: ClosureRuntimePointer, right: ClosureRuntimePointer): boolean {
  return left.generation === right.generation && sameBinding(left, right);
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

export function validateClosureRuntimeDescriptor(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureRuntimeDescriptor {
  const runtime = requireRecord(value, "Closure runtime descriptor");
  assertExactKeys(runtime, [
    "active",
    "channel",
    "lastSuccessful",
    "namespace",
    "nextGeneration",
    "schemaVersion",
    "updatedAt",
  ], "Closure runtime descriptor");
  if (runtime.schemaVersion !== CLOSURE_STORE_SCHEMA_VERSION) {
    throw new ClosureStoreError(`unsupported Closure store schema: ${String(runtime.schemaVersion)}`);
  }
  const channel = normalizeChannel(String(runtime.channel));
  const namespace = normalizeStoreNamespace(String(runtime.namespace));
  if (channel !== expected.channel || namespace !== expected.namespace) {
    throw new ClosureStoreError("Closure runtime descriptor does not match its channel/namespace store");
  }
  const active = runtime.active == null ? null : normalizePointer(runtime.active, expected);
  const lastSuccessful = runtime.lastSuccessful == null
    ? null
    : normalizePointer(runtime.lastSuccessful, expected);
  const nextGeneration = normalizeGeneration(runtime.nextGeneration);
  if (
    (active != null && active.generation >= nextGeneration)
    || (lastSuccessful != null && lastSuccessful.generation >= nextGeneration)
  ) {
    throw new ClosureStoreError("Closure nextGeneration must be greater than every retained pointer generation");
  }
  return {
    active,
    channel,
    lastSuccessful,
    namespace,
    nextGeneration,
    schemaVersion: CLOSURE_STORE_SCHEMA_VERSION,
    updatedAt: normalizeIsoString(runtime.updatedAt, "Closure runtime updatedAt"),
  };
}

export function validateClosureAttemptDescriptor(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureAttemptDescriptor {
  const attempt = requireRecord(value, "Closure attempt descriptor");
  assertExactKeys(attempt, [
    "channel",
    "digest",
    "generation",
    "namespace",
    "platform",
    "protocolVersion",
    "schemaVersion",
    "startedAt",
    "version",
  ], "Closure attempt descriptor");
  if (attempt.schemaVersion !== CLOSURE_STORE_SCHEMA_VERSION) {
    throw new ClosureStoreError(`unsupported Closure attempt schema: ${String(attempt.schemaVersion)}`);
  }
  const pointer = {
    channel: attempt.channel,
    digest: attempt.digest,
    generation: attempt.generation,
    namespace: attempt.namespace,
    platform: attempt.platform,
    protocolVersion: attempt.protocolVersion,
    version: attempt.version,
  };
  return {
    ...normalizePointer(pointer, expected),
    schemaVersion: CLOSURE_STORE_SCHEMA_VERSION,
    startedAt: normalizeIsoString(attempt.startedAt, "Closure attempt startedAt"),
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

async function collectPayloadFiles(
  root: string,
  current = root,
): Promise<ClosureFileInventory["files"]> {
  const entries = await readdir(current, { withFileTypes: true }).catch((error) => {
    throw new ClosureStoreError(`Closure payload is missing or unreadable at ${current}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  });
  const files: ClosureFileInventory["files"] = [];
  for (const entry of entries.sort((left, right) => compareName(left.name, right.name))) {
    const absolutePath = join(current, entry.name);
    const metadata = await lstat(absolutePath);
    const archivePath = relative(root, absolutePath).split(sep).join("/");
    if (metadata.isSymbolicLink()) throw new ClosureStoreError(`Closure payload contains a symlink: ${archivePath}`);
    if (metadata.isDirectory()) {
      files.push(...await collectPayloadFiles(root, absolutePath));
      continue;
    }
    if (!metadata.isFile()) throw new ClosureStoreError(`Closure payload contains an unsupported entry: ${archivePath}`);
    const identity = await digestFile(absolutePath);
    files.push({ digest: identity.digest as `sha256:${string}`, path: archivePath, size: identity.size });
  }
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

function emptyRuntime(paths: ClosureStorePaths, now: string): ClosureRuntimeDescriptor {
  return {
    active: null,
    channel: paths.channel,
    lastSuccessful: null,
    namespace: paths.namespace,
    nextGeneration: 0,
    schemaVersion: CLOSURE_STORE_SCHEMA_VERSION,
    updatedAt: now,
  };
}

export async function readClosureRuntimeDescriptor(paths: ClosureStorePaths): Promise<ClosureRuntimeDescriptor> {
  const raw = await readOptionalJson(paths.runtimePath, "Closure runtime descriptor");
  return raw == null
    ? emptyRuntime(paths, new Date(0).toISOString())
    : validateClosureRuntimeDescriptor(raw, paths);
}

export async function readClosureAttemptDescriptor(paths: ClosureStorePaths): Promise<ClosureAttemptDescriptor | null> {
  const raw = await readOptionalJson(paths.attemptsPath, "Closure attempt descriptor");
  return raw == null ? null : validateClosureAttemptDescriptor(raw, paths);
}

function selectRuntime(runtime: ClosureRuntimeDescriptor): ClosureRuntimeSelection {
  return runtime.active == null
    ? { reason: "no-runtime-target", selected: false }
    : { pointer: runtime.active, reason: "active", selected: true };
}

export async function activateStoredClosureCandidate(
  paths: ClosureStorePaths,
  binding: ClosureBindingIdentity,
): Promise<{ descriptor: ClosureRuntimeDescriptor; pointer: ClosureRuntimePointer; verification: StoredClosureVerification }> {
  const attempt = await readClosureAttemptDescriptor(paths);
  if (attempt != null) {
    throw new ClosureStoreError("cannot activate a Closure candidate while a runtime attempt is unresolved");
  }
  const verification = await verifyStoredClosureCandidate(paths, binding);
  const current = await readClosureRuntimeDescriptor(paths);
  const generation = current.nextGeneration;
  const pointer: ClosureRuntimePointer = { ...verification.binding, generation };
  const descriptor: ClosureRuntimeDescriptor = {
    ...current,
    active: pointer,
    nextGeneration: generation + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.runtimePath, descriptor);
  return { descriptor, pointer, verification };
}

export async function armClosureRuntimeAttempt(
  paths: ClosureStorePaths,
  pointer: ClosureRuntimePointer,
): Promise<ClosureAttemptDescriptor> {
  const runtime = await readClosureRuntimeDescriptor(paths);
  const normalized = normalizePointer(pointer, paths);
  if (runtime.active == null || !samePointer(runtime.active, normalized)) {
    throw new ClosureStoreError("cannot arm a Closure attempt for a non-active pointer");
  }
  const attempt: ClosureAttemptDescriptor = {
    ...normalized,
    schemaVersion: CLOSURE_STORE_SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.attemptsPath, attempt);
  return attempt;
}

export async function confirmClosureRuntime(
  paths: ClosureStorePaths,
  pointer: ClosureRuntimePointer,
): Promise<ClosureRuntimeDescriptor> {
  const runtime = await readClosureRuntimeDescriptor(paths);
  const attempt = await readClosureAttemptDescriptor(paths);
  const normalized = normalizePointer(pointer, paths);
  if (runtime.active == null || !samePointer(runtime.active, normalized)) {
    throw new ClosureStoreError("cannot confirm a non-active Closure pointer");
  }
  if (attempt == null || !samePointer(attempt, normalized)) {
    throw new ClosureStoreError("cannot confirm a Closure pointer without its armed attempt");
  }
  const descriptor: ClosureRuntimeDescriptor = {
    ...runtime,
    lastSuccessful: normalized,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.runtimePath, descriptor);
  await removeFile(paths.attemptsPath);
  return descriptor;
}

export async function recoverClosureRuntime(paths: ClosureStorePaths): Promise<ClosureRecoveryResult> {
  const runtime = await readClosureRuntimeDescriptor(paths);
  const attempt = await readClosureAttemptDescriptor(paths);
  if (attempt == null) return { descriptor: runtime, recovered: false, selection: selectRuntime(runtime) };
  if (runtime.active == null || !samePointer(runtime.active, attempt)) {
    await removeFile(paths.attemptsPath);
    return { descriptor: runtime, recovered: true, selection: selectRuntime(runtime) };
  }
  if (runtime.lastSuccessful != null && samePointer(runtime.active, runtime.lastSuccessful)) {
    await removeFile(paths.attemptsPath);
    return {
      descriptor: runtime,
      recovered: true,
      selection: { pointer: runtime.lastSuccessful, reason: "last-successful", selected: true },
    };
  }
  const descriptor: ClosureRuntimeDescriptor = {
    ...runtime,
    active: runtime.lastSuccessful,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.runtimePath, descriptor);
  await removeFile(paths.attemptsPath);
  return {
    descriptor,
    recovered: true,
    selection: descriptor.active == null
      ? { reason: "no-runtime-target", selected: false }
      : { pointer: descriptor.active, reason: "last-successful", selected: true },
  };
}
