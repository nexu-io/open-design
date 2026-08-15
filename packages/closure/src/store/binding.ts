import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

import {
  isClosureChannel,
  normalizeDigest,
  validateClosureBindingIdentity,
  type ClosureBindingIdentity,
  type ClosureCandidateManifest,
  type ClosureChannel,
  type ClosureDigest,
  type ClosureFileInventory,
} from "../protocol/index.js";
import { normalizeNamespace } from "@open-design/sidecar/protocol";

export const CLOSURE_BINDING_SCHEMA_VERSION = 4 as const;
export const CLOSURE_ACTIVATION_INTENT_SCHEMA_VERSION = 1 as const;
const TRANSITIONAL_CLOSURE_BINDING_SCHEMA_VERSION = 5 as const;
export const CLOSURE_STORE_EPOCH = 4 as const;

export type ClosureStoreRequest = {
  channel: string;
  namespace: string;
  root: string;
};

export type ClosureStorePaths = {
  activationIntentPath: string;
  bindingPath: string;
  blobsRoot: string;
  channel: ClosureChannel;
  channelRoot: string;
  closureRoot: string;
  garbageRoot: string;
  installationsRoot: string;
  namespace: string;
  namespaceRoot: string;
  resourcesRoot: string;
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

export type ClosureRuntimePointer = Omit<ClosureBindingIdentity, "platform"> & {
  generation: number;
  target: string;
};

export type ClosureReleaseBinding = {
  releaseVersion: string;
  standalone: ClosureRuntimePointer;
};

export type ClosureShellBinding = {
  digest: ClosureDigest;
  type: string;
  version: string;
};

export type ClosureRuntimeBinding = ClosureReleaseBinding & {
  shell: ClosureShellBinding;
};

export type ClosureActivationSource =
  | "initial-bootstrap"
  | "repair"
  | "silent-policy"
  | "user-restart";

export type ClosureActivationIntent = ClosureReleaseBinding & {
  source: ClosureActivationSource;
};

export type ClosureBindingDescriptor = {
  active: ClosureRuntimeBinding | null;
  attempt: ClosureRuntimeBinding | null;
  activationIntent: ClosureActivationIntent | null;
  channel: ClosureChannel;
  lastSuccessful: ClosureRuntimeBinding | null;
  namespace: string;
  nextGeneration: number;
  prepared: ClosureReleaseBinding | null;
  schemaVersion: typeof CLOSURE_BINDING_SCHEMA_VERSION;
  updatedAt: string;
};

export type ClosureActivationIntentDescriptor = {
  channel: ClosureChannel;
  intent: ClosureActivationIntent;
  namespace: string;
  schemaVersion: typeof CLOSURE_ACTIVATION_INTENT_SCHEMA_VERSION;
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
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClosureStoreError";
  }
}

function normalizeRoot(value: string): string {
  if (value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    throw new ClosureStoreError(`Closure store root must be a non-empty absolute path: ${value}`);
  }
  return resolve(value);
}

function normalizeChannel(value: string): ClosureChannel {
  if (!isClosureChannel(value)) throw new ClosureStoreError(`unsupported Closure store channel: ${value}`);
  return value;
}

function normalizeStoreNamespace(value: string): string {
  try {
    return normalizeNamespace(value);
  } catch (error) {
    throw new ClosureStoreError(error instanceof Error ? error.message : String(error));
  }
}

export function assertUnderRoot(root: string, target: string): string {
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
  const namespaceRoot = assertUnderRoot(root, join(channelRoot, "epochs", String(CLOSURE_STORE_EPOCH), "namespaces", namespace));
  const stateRoot = assertUnderRoot(root, join(namespaceRoot, "state"));
  return {
    activationIntentPath: assertUnderRoot(root, join(stateRoot, "activation-intent.json")),
    bindingPath: assertUnderRoot(root, join(stateRoot, "binding.json")),
    blobsRoot: assertUnderRoot(root, join(channelRoot, "blobs")),
    channel,
    channelRoot,
    closureRoot,
    garbageRoot: assertUnderRoot(root, join(channelRoot, "garbage")),
    installationsRoot: assertUnderRoot(root, join(namespaceRoot, "installations")),
    namespace,
    namespaceRoot,
    resourcesRoot: assertUnderRoot(root, join(channelRoot, "resources")),
    root,
    stagingRoot: assertUnderRoot(root, join(namespaceRoot, "staging")),
    stateRoot,
    versionsRoot: assertUnderRoot(root, join(namespaceRoot, "versions")),
  };
}

export function resolveClosureActivationIntentPath(
  paths: Pick<ClosureStorePaths, "root" | "stateRoot">,
): string {
  return assertUnderRoot(paths.root, join(paths.stateRoot, "activation-intent.json"));
}

export function sameBinding(left: ClosureBindingIdentity, right: ClosureBindingIdentity): boolean {
  return left.channel === right.channel
    && left.namespace === right.namespace
    && left.platform === right.platform
    && left.protocolVersion === right.protocolVersion
    && left.version === right.version
    && left.digest === right.digest;
}

export function normalizeGeneration(value: unknown): number {
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

export function normalizeReleaseVersion(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new ClosureStoreError("Closure release version must be a non-empty trimmed string");
  }
  return value;
}

export function normalizePointer(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureRuntimePointer {
  const pointer = requireRecord(value, "Closure runtime pointer");
  assertExactKeys(pointer, [
    "channel",
    "digest",
    "generation",
    "namespace",
    "protocolVersion",
    "target",
    "version",
  ], "Closure runtime pointer");
  const binding = validateClosureBindingIdentity({
    ...pointer,
    platform: pointer.target,
  }, expected);
  return {
    channel: binding.channel,
    digest: binding.digest,
    generation: normalizeGeneration(pointer.generation),
    namespace: binding.namespace,
    protocolVersion: binding.protocolVersion,
    target: binding.platform,
    version: binding.version,
  };
}

export function closureBindingIdentityFromRuntimePointer(
  pointer: ClosureRuntimePointer,
): ClosureBindingIdentity {
  return validateClosureBindingIdentity({
    channel: pointer.channel,
    digest: pointer.digest,
    namespace: pointer.namespace,
    platform: pointer.target,
    protocolVersion: pointer.protocolVersion,
    version: pointer.version,
  });
}

function normalizeReleaseBinding(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureReleaseBinding {
  const binding = requireRecord(value, "Closure release binding");
  assertExactKeys(binding, ["releaseVersion", "standalone"], "Closure release binding");
  return {
    releaseVersion: normalizeReleaseVersion(binding.releaseVersion),
    standalone: normalizePointer(binding.standalone, expected),
  };
}

export function normalizeShellBinding(value: unknown): ClosureShellBinding {
  const shell = requireRecord(value, "Closure Shell binding");
  assertExactKeys(shell, ["digest", "type", "version"], "Closure Shell binding");
  const type = typeof shell.type === "string" ? shell.type : "";
  const version = typeof shell.version === "string" ? shell.version : "";
  if (type.length === 0 || type !== type.trim() || version.length === 0 || version !== version.trim()) {
    throw new ClosureStoreError("Closure Shell type and version must be non-empty trimmed strings");
  }
  return { digest: normalizeDigest(shell.digest), type, version };
}

function normalizeRuntimeBinding(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureRuntimeBinding {
  const binding = requireRecord(value, "Closure runtime binding");
  assertExactKeys(binding, ["releaseVersion", "shell", "standalone"], "Closure runtime binding");
  return {
    releaseVersion: normalizeReleaseVersion(binding.releaseVersion),
    shell: normalizeShellBinding(binding.shell),
    standalone: normalizePointer(binding.standalone, expected),
  };
}

export function sameReleaseBinding(
  left: ClosureReleaseBinding,
  right: ClosureReleaseBinding,
): boolean {
  return left.releaseVersion === right.releaseVersion
    && left.standalone.generation === right.standalone.generation
    && left.standalone.channel === right.standalone.channel
    && left.standalone.namespace === right.standalone.namespace
    && left.standalone.protocolVersion === right.standalone.protocolVersion
    && left.standalone.target === right.standalone.target
    && left.standalone.version === right.standalone.version
    && left.standalone.digest === right.standalone.digest;
}

export function sameRuntimeBinding(
  left: ClosureRuntimeBinding,
  right: ClosureRuntimeBinding,
): boolean {
  return sameReleaseBinding(left, right)
    && left.shell.digest === right.shell.digest
    && left.shell.type === right.shell.type
    && left.shell.version === right.shell.version;
}

export function sameShellBinding(
  left: ClosureShellBinding,
  right: ClosureShellBinding,
): boolean {
  return left.digest === right.digest
    && left.type === right.type
    && left.version === right.version;
}

export function validateClosureBindingDescriptor(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureBindingDescriptor {
  const descriptor = requireRecord(value, "Closure binding descriptor");
  const transitional = descriptor.schemaVersion === TRANSITIONAL_CLOSURE_BINDING_SCHEMA_VERSION;
  assertExactKeys(descriptor, transitional ? [
    "active",
    "attempt",
    "activationIntent",
    "channel",
    "lastSuccessful",
    "namespace",
    "nextGeneration",
    "prepared",
    "schemaVersion",
    "updatedAt",
  ] : [
    "active",
    "attempt",
    "activationAuthorized",
    "channel",
    "lastSuccessful",
    "namespace",
    "nextGeneration",
    "prepared",
    "schemaVersion",
    "updatedAt",
  ], "Closure binding descriptor");
  if (!transitional && descriptor.schemaVersion !== CLOSURE_BINDING_SCHEMA_VERSION) {
    throw new ClosureStoreError(`unsupported Closure binding schema: ${String(descriptor.schemaVersion)}`);
  }
  const channel = normalizeChannel(String(descriptor.channel));
  const namespace = normalizeStoreNamespace(String(descriptor.namespace));
  if (channel !== expected.channel || namespace !== expected.namespace) {
    throw new ClosureStoreError("Closure binding descriptor does not match its channel/namespace store");
  }
  const active = descriptor.active == null ? null : normalizeRuntimeBinding(descriptor.active, expected);
  const attempt = descriptor.attempt == null ? null : normalizeRuntimeBinding(descriptor.attempt, expected);
  const lastSuccessful = descriptor.lastSuccessful == null
    ? null
    : normalizeRuntimeBinding(descriptor.lastSuccessful, expected);
  const prepared = descriptor.prepared == null
    ? null
    : normalizeReleaseBinding(descriptor.prepared, expected);
  if (!transitional && typeof descriptor.activationAuthorized !== "boolean") {
    throw new ClosureStoreError("Closure activation authorization flag must be boolean");
  }
  const activationIntent = !transitional || descriptor.activationIntent == null
    ? null
    : normalizeActivationIntent(descriptor.activationIntent, expected);
  if (activationIntent != null && (
    prepared == null || !sameReleaseBinding(activationIntent, prepared)
  )) throw new ClosureStoreError("Closure activation intent must match the prepared binding");
  const nextGeneration = normalizeGeneration(descriptor.nextGeneration);
  const retained = [active, attempt, lastSuccessful, prepared].filter(
    (binding): binding is ClosureReleaseBinding => binding != null,
  );
  if (retained.some((binding) => binding.standalone.generation >= nextGeneration)) {
    throw new ClosureStoreError("Closure nextGeneration must be greater than every retained generation");
  }
  if (attempt != null && (active == null || !sameRuntimeBinding(active, attempt))) {
    throw new ClosureStoreError("Closure attempt must match the active binding");
  }
  if (attempt == null && active != null && (
    lastSuccessful == null || !sameRuntimeBinding(active, lastSuccessful)
  )) {
    throw new ClosureStoreError("Closure active binding must be the pending attempt or last successful binding");
  }
  return {
    active,
    attempt,
    activationIntent,
    channel,
    lastSuccessful,
    namespace,
    nextGeneration,
    prepared,
    schemaVersion: CLOSURE_BINDING_SCHEMA_VERSION,
    updatedAt: normalizeIsoString(descriptor.updatedAt, "Closure binding updatedAt"),
  };
}

export function validateClosureActivationIntentDescriptor(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureActivationIntentDescriptor {
  const descriptor = requireRecord(value, "Closure activation intent descriptor");
  assertExactKeys(descriptor, [
    "channel",
    "intent",
    "namespace",
    "schemaVersion",
    "updatedAt",
  ], "Closure activation intent descriptor");
  if (descriptor.schemaVersion !== CLOSURE_ACTIVATION_INTENT_SCHEMA_VERSION) {
    throw new ClosureStoreError(
      `unsupported Closure activation intent schema: ${String(descriptor.schemaVersion)}`,
    );
  }
  const channel = normalizeChannel(String(descriptor.channel));
  const namespace = normalizeStoreNamespace(String(descriptor.namespace));
  if (channel !== expected.channel || namespace !== expected.namespace) {
    throw new ClosureStoreError("Closure activation intent does not match its channel/namespace store");
  }
  return {
    channel,
    intent: normalizeActivationIntent(descriptor.intent, expected),
    namespace,
    schemaVersion: CLOSURE_ACTIVATION_INTENT_SCHEMA_VERSION,
    updatedAt: normalizeIsoString(descriptor.updatedAt, "Closure activation intent updatedAt"),
  };
}

export function persistedClosureBindingDescriptor(
  descriptor: ClosureBindingDescriptor,
): Record<string, unknown> {
  const { activationIntent: _activationIntent, ...binding } = descriptor;
  return {
    ...binding,
    activationAuthorized: descriptor.activationIntent != null,
    schemaVersion: CLOSURE_BINDING_SCHEMA_VERSION,
  };
}

export function persistedClosureActivationIntentDescriptor(
  descriptor: ClosureBindingDescriptor,
): ClosureActivationIntentDescriptor | null {
  if (descriptor.activationIntent == null) return null;
  return {
    channel: descriptor.channel,
    intent: descriptor.activationIntent,
    namespace: descriptor.namespace,
    schemaVersion: CLOSURE_ACTIVATION_INTENT_SCHEMA_VERSION,
    updatedAt: descriptor.updatedAt,
  };
}

function normalizeActivationIntent(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureActivationIntent {
  const intent = requireRecord(value, "Closure activation intent");
  assertExactKeys(intent, ["releaseVersion", "source", "standalone"], "Closure activation intent");
  const sources: readonly ClosureActivationSource[] = [
    "initial-bootstrap",
    "repair",
    "silent-policy",
    "user-restart",
  ];
  if (!sources.includes(intent.source as ClosureActivationSource)) {
    throw new ClosureStoreError(`unsupported Closure activation source: ${String(intent.source)}`);
  }
  const { source: _source, ...binding } = intent;
  return {
    ...normalizeReleaseBinding(binding, expected),
    source: intent.source as ClosureActivationSource,
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

export async function readRequiredJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new ClosureStoreError(`${label} is missing or unreadable at ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

export async function readOptionalJson(path: string, label: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ClosureStoreError(`${label} is unreadable at ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

export async function digestFile(path: string): Promise<{ digest: string; size: number }> {
  const metadata = await stat(path).catch(() => null);
  if (metadata == null || !metadata.isFile()) throw new ClosureStoreError(`Closure file is missing: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { digest: `sha256:${hash.digest("hex")}`, size: metadata.size };
}
