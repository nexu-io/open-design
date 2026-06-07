import { isAbsolute, join, resolve, sep } from "node:path";

import { normalizeNamespace } from "@open-design/sidecar-proto";

export const LAUNCHER_SCHEMA_VERSION = 1 as const;

export const LAUNCHER_CHANNELS = Object.freeze({
  BETA: "beta",
  NIGHTLY: "nightly",
  PREVIEW: "preview",
  STABLE: "stable",
} as const);

export type LauncherChannel = (typeof LAUNCHER_CHANNELS)[keyof typeof LAUNCHER_CHANNELS];

const LAUNCHER_CHANNEL_VALUES = new Set<string>(Object.values(LAUNCHER_CHANNELS));

export type LauncherRootRequest = {
  channel: string;
  namespace: string;
  root: string;
};

export type LauncherVersionRequest = LauncherRootRequest & {
  version: string;
};

export type LauncherPaths = {
  attemptsPath: string;
  channel: LauncherChannel;
  channelRoot: string;
  cleanupPath: string;
  downloadsRoot: string;
  installPath: string;
  launcherPath: string;
  lockRoot: string;
  logsRoot: string;
  namespace: string;
  namespaceRoot: string;
  releasesRoot: string;
  root: string;
  runtimePath: string;
  stagingRoot: string;
  stateRoot: string;
  updatesRoot: string;
  versionsRoot: string;
};

export type LauncherVersionPaths = LauncherPaths & {
  manifestPath: string;
  payloadRoot: string;
  version: string;
  versionRoot: string;
};

export type LauncherVersionPointer = {
  generation: number;
  version: string;
};

export type LauncherRuntimeDescriptor = {
  active: LauncherVersionPointer | null;
  channel: LauncherChannel;
  lastSuccessful: LauncherVersionPointer | null;
  namespace: string;
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  updatedAt?: string;
};

export type LauncherAttemptDescriptor = {
  channel: LauncherChannel;
  generation: number;
  namespace: string;
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  startedAt?: string;
  version: string;
};

export type LauncherTargetSelection =
  | { pointer: LauncherVersionPointer; reason: "active"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "last-successful"; selected: true }
  | { reason: "no-runtime-target"; selected: false };

export class LauncherProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LauncherProtocolError";
  }
}

export function normalizeLauncherChannel(value: unknown): LauncherChannel {
  if (typeof value !== "string") throw new LauncherProtocolError("launcher channel must be a string");
  const channel = value.trim();
  if (channel !== value) throw new LauncherProtocolError("launcher channel must not contain leading or trailing whitespace");
  if (!LAUNCHER_CHANNEL_VALUES.has(channel)) {
    throw new LauncherProtocolError(`unsupported launcher channel: ${value}`);
  }
  return channel as LauncherChannel;
}

export function normalizeLauncherVersion(value: unknown): string {
  if (typeof value !== "string") throw new LauncherProtocolError("launcher version must be a string");
  if (value.length === 0) throw new LauncherProtocolError("launcher version must not be empty");
  if (value !== value.trim()) throw new LauncherProtocolError("launcher version must not contain leading or trailing whitespace");
  if (value.includes("\0")) throw new LauncherProtocolError("launcher version must not contain null bytes");
  if (/[\\/]/.test(value)) throw new LauncherProtocolError(`launcher version must not contain path separators: ${value}`);
  if (value === "." || value === ".." || value.includes("..")) {
    throw new LauncherProtocolError(`launcher version must not contain relative path segments: ${value}`);
  }
  if (isAbsolute(value)) throw new LauncherProtocolError(`launcher version must not be absolute: ${value}`);
  return value;
}

export function normalizeLauncherNamespace(value: unknown): string {
  try {
    return normalizeNamespace(value);
  } catch (error) {
    throw new LauncherProtocolError(error instanceof Error ? error.message : String(error));
  }
}

function normalizeRoot(root: string): string {
  if (root.length === 0) throw new LauncherProtocolError("launcher root must not be empty");
  if (root.includes("\0")) throw new LauncherProtocolError("launcher root must not contain null bytes");
  if (!isAbsolute(root)) throw new LauncherProtocolError(`launcher root must be absolute: ${root}`);
  return resolve(root);
}

function assertUnderRoot(root: string, target: string): string {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new LauncherProtocolError(`launcher path escapes root: ${normalizedTarget}`);
  }
  return normalizedTarget;
}

export function resolveLauncherPaths(request: LauncherRootRequest): LauncherPaths {
  const root = normalizeRoot(request.root);
  const channel = normalizeLauncherChannel(request.channel);
  const namespace = normalizeLauncherNamespace(request.namespace);
  const launcherPath = assertUnderRoot(root, join(root, "launcher"));
  const channelRoot = assertUnderRoot(root, join(launcherPath, "channels", channel));
  const namespaceRoot = assertUnderRoot(root, join(channelRoot, "namespaces", namespace));
  const stateRoot = assertUnderRoot(root, join(namespaceRoot, "state"));
  const updatesRoot = assertUnderRoot(root, join(namespaceRoot, "updates"));

  return {
    attemptsPath: assertUnderRoot(root, join(stateRoot, "attempt.json")),
    channel,
    channelRoot,
    cleanupPath: assertUnderRoot(root, join(stateRoot, "cleanup.json")),
    downloadsRoot: assertUnderRoot(root, join(updatesRoot, "downloads")),
    installPath: assertUnderRoot(root, join(namespaceRoot, "install.json")),
    launcherPath,
    lockRoot: assertUnderRoot(root, join(stateRoot, "lock")),
    logsRoot: assertUnderRoot(root, join(namespaceRoot, "logs")),
    namespace,
    namespaceRoot,
    releasesRoot: assertUnderRoot(root, join(updatesRoot, "releases")),
    root,
    runtimePath: assertUnderRoot(root, join(namespaceRoot, "runtime.json")),
    stagingRoot: assertUnderRoot(root, join(updatesRoot, "staging")),
    stateRoot,
    updatesRoot,
    versionsRoot: assertUnderRoot(root, join(namespaceRoot, "versions")),
  };
}

export function resolveLauncherVersionPaths(request: LauncherVersionRequest): LauncherVersionPaths {
  const paths = resolveLauncherPaths(request);
  const version = normalizeLauncherVersion(request.version);
  const versionRoot = assertUnderRoot(paths.root, join(paths.versionsRoot, version));
  return {
    ...paths,
    manifestPath: assertUnderRoot(paths.root, join(versionRoot, "manifest.json")),
    payloadRoot: assertUnderRoot(paths.root, join(versionRoot, "payload")),
    version,
    versionRoot,
  };
}

function normalizePointer(value: LauncherVersionPointer | null): LauncherVersionPointer | null {
  if (value == null) return null;
  const version = normalizeLauncherVersion(value.version);
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) {
    throw new LauncherProtocolError(`launcher generation must be a non-negative safe integer: ${value.generation}`);
  }
  return { generation: value.generation, version };
}

export function validateLauncherRuntimeDescriptor(
  runtime: LauncherRuntimeDescriptor,
  expected: { channel: string; namespace: string },
): LauncherRuntimeDescriptor {
  if (runtime.schemaVersion !== LAUNCHER_SCHEMA_VERSION) {
    throw new LauncherProtocolError(`unsupported launcher runtime schemaVersion: ${String(runtime.schemaVersion)}`);
  }
  const channel = normalizeLauncherChannel(runtime.channel);
  const expectedChannel = normalizeLauncherChannel(expected.channel);
  if (channel !== expectedChannel) {
    throw new LauncherProtocolError(`launcher runtime channel ${channel} does not match expected channel ${expectedChannel}`);
  }
  const namespace = normalizeLauncherNamespace(runtime.namespace);
  const expectedNamespace = normalizeLauncherNamespace(expected.namespace);
  if (namespace !== expectedNamespace) {
    throw new LauncherProtocolError(`launcher runtime namespace ${namespace} does not match expected namespace ${expectedNamespace}`);
  }
  return {
    ...runtime,
    active: normalizePointer(runtime.active),
    channel,
    lastSuccessful: normalizePointer(runtime.lastSuccessful),
    namespace,
  };
}

export function selectLauncherRuntimeTarget(input: {
  attempted?: LauncherAttemptDescriptor | null;
  runtime: LauncherRuntimeDescriptor;
}): LauncherTargetSelection {
  const active = normalizePointer(input.runtime.active);
  const lastSuccessful = normalizePointer(input.runtime.lastSuccessful);
  const attempted = input.attempted == null
    ? null
    : {
        generation: input.attempted.generation,
        version: normalizeLauncherVersion(input.attempted.version),
      };

  if (active == null) {
    return lastSuccessful == null
      ? { reason: "no-runtime-target", selected: false }
      : { pointer: lastSuccessful, reason: "last-successful", selected: true };
  }

  if (
    attempted != null &&
    attempted.version === active.version &&
    attempted.generation === active.generation &&
    lastSuccessful != null
  ) {
    return { pointer: lastSuccessful, reason: "last-successful", selected: true };
  }

  return { pointer: active, reason: "active", selected: true };
}
