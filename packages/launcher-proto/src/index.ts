import { isAbsolute, join, resolve, sep } from "node:path";

import { RELEASE_CHANNELS, type ReleaseChannel } from "@open-design/release";
import { normalizeNamespace } from "@open-design/sidecar-proto";

export const LAUNCHER_SCHEMA_VERSION = 1 as const;
export const LAUNCHER_AFTER_QUIT_FLAG = "--od-launcher-after-quit" as const;
export const LAUNCHER_AFTER_QUIT_TARGET_PID_ARG = "--od-launcher-target-pid" as const;
export const LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG = "--od-launcher-timeout-ms" as const;
export const LAUNCHER_HANDOFF_RESUME_ARG = "--od-launcher-resume-handoff" as const;
export const LAUNCHER_DELEGATED_GENERATION_ARG = "--od-launcher-delegated-generation" as const;
export const LAUNCHER_DELEGATED_VERSION_ARG = "--od-launcher-delegated-version" as const;

export const LAUNCHER_CHANNELS = Object.freeze({
  BETA: RELEASE_CHANNELS.BETA,
  BETAS: RELEASE_CHANNELS.BETAS,
  PRERELEASE: RELEASE_CHANNELS.PRERELEASE,
  PREVIEW: RELEASE_CHANNELS.PREVIEW,
  STABLE: RELEASE_CHANNELS.STABLE,
} as const);

export type LauncherChannel = ReleaseChannel;

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
  handoffPath: string;
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

export type LauncherDesktopHandoffDescriptor = {
  channel: LauncherChannel;
  createdAt: string;
  handoffId: string;
  namespace: string;
  outer: {
    executablePath: string;
    pid: number;
  };
  payloadExecutablePath: string;
  previous: LauncherVersionPointer;
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  source: LauncherVersionPointer;
  state: "armed" | "confirmed" | "prepared";
  target?: LauncherVersionPointer;
  updatedAt: string;
};

export type LauncherCleanupState = "cleanup-deferred" | "cleanup-removed" | "deprecated" | "retained";

export type LauncherCleanupReason =
  | "cleanup-failed"
  | "current-bound-package"
  | "older-than-bound-package";

export type LauncherCleanupEntry = {
  error?: {
    code: string;
    message: string;
  };
  generation: number;
  reason: LauncherCleanupReason;
  removedAt?: string;
  state: LauncherCleanupState;
  updatedAt: string;
  version: string;
};

export type LauncherCleanupDescriptor = {
  channel: LauncherChannel;
  currentVersion?: string;
  namespace: string;
  updatedAt: string;
  version: typeof LAUNCHER_SCHEMA_VERSION;
  versions: LauncherCleanupEntry[];
};

export type LauncherTargetSelection =
  | { pointer: LauncherVersionPointer; reason: "active"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "active-delegated"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "active-resume"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "last-successful"; selected: true }
  | { reason: "no-runtime-target"; selected: false };

export type LauncherAfterQuitRequest = {
  targetPid: number;
  timeoutMs: number;
};

export type LauncherHandoffResumeRequest = {
  handoffId: string;
};

export class LauncherProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LauncherProtocolError";
  }
}

type ParsedComparableVersion = {
  nums: [number, number, number];
  pre: string[];
};

function numberPart(value: string | undefined): number {
  return value != null && /^[0-9]+$/.test(value) ? Number(value) : 0;
}

function parseComparableLauncherVersion(value: string): ParsedComparableVersion {
  const cleaned = value.trim().replace(/^v/i, "").split("+", 1)[0] ?? "";
  const nightlyMatch = /^(\d+)\.(\d+)\.(\d+)\.nightly\.(\d+)$/i.exec(cleaned);
  if (nightlyMatch?.[1] != null && nightlyMatch[2] != null && nightlyMatch[3] != null && nightlyMatch[4] != null) {
    return {
      nums: [Number(nightlyMatch[1]), Number(nightlyMatch[2]), Number(nightlyMatch[3])],
      pre: ["nightly", nightlyMatch[4]],
    };
  }

  const prereleaseSeparator = cleaned.indexOf("-");
  const core = prereleaseSeparator === -1 ? cleaned : cleaned.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : cleaned.slice(prereleaseSeparator + 1);
  const nums = core.split(".");
  return {
    nums: [numberPart(nums[0]), numberPart(nums[1]), numberPart(nums[2])],
    pre: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function compareLauncherIdentifier(a: string, b: string): number {
  const aNum = /^[0-9]+$/.test(a) ? Number(a) : null;
  const bNum = /^[0-9]+$/.test(b) ? Number(b) : null;
  if (aNum != null && bNum != null) return Math.sign(aNum - bNum);
  if (aNum != null) return -1;
  if (bNum != null) return 1;
  return a.localeCompare(b);
}

export function compareLauncherVersions(a: string, b: string): number {
  const left = parseComparableLauncherVersion(a);
  const right = parseComparableLauncherVersion(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left.nums[index] ?? 0) - (right.nums[index] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0;
  if (left.pre.length === 0) return 1;
  if (right.pre.length === 0) return -1;
  const max = Math.max(left.pre.length, right.pre.length);
  for (let index = 0; index < max; index += 1) {
    const l = left.pre[index];
    const r = right.pre[index];
    if (l == null) return -1;
    if (r == null) return 1;
    const delta = compareLauncherIdentifier(l, r);
    if (delta !== 0) return delta;
  }
  return 0;
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

function normalizePositiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new LauncherProtocolError(`${label} must be a positive safe integer`);
  }
  return parsed;
}

function valueAfterArg(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function normalizeLauncherHandoffId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(value)) {
    throw new LauncherProtocolError("launcher handoff id must be 16-128 URL-safe characters");
  }
  return value;
}

export function buildLauncherAfterQuitArgs(request: LauncherAfterQuitRequest): string[] {
  return [
    LAUNCHER_AFTER_QUIT_FLAG,
    LAUNCHER_AFTER_QUIT_TARGET_PID_ARG,
    normalizePositiveInteger(request.targetPid, "launcher after-quit target pid").toString(),
    LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG,
    normalizePositiveInteger(request.timeoutMs, "launcher after-quit timeout").toString(),
  ];
}

export function parseLauncherAfterQuitArgs(args: readonly string[]): LauncherAfterQuitRequest | null {
  if (!args.includes(LAUNCHER_AFTER_QUIT_FLAG)) return null;
  return {
    targetPid: normalizePositiveInteger(
      valueAfterArg(args, LAUNCHER_AFTER_QUIT_TARGET_PID_ARG),
      "launcher after-quit target pid",
    ),
    timeoutMs: normalizePositiveInteger(
      valueAfterArg(args, LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG),
      "launcher after-quit timeout",
    ),
  };
}

function normalizeLauncherGeneration(value: unknown): number {
  const generation = typeof value === "string" && value.length > 0 ? Number(value) : value;
  if (typeof generation !== "number" || !Number.isSafeInteger(generation) || generation < 0) {
    throw new LauncherProtocolError(`launcher generation must be a non-negative safe integer: ${String(value)}`);
  }
  return generation;
}

/**
 * Delegated-launch marker: a parent that pre-armed attempt.json for the
 * pointer it is about to spawn (packaged outer delegation, updater payload
 * relaunch) passes the pointer along so the spawned payload can tell its own
 * in-progress attempt apart from a previous failed launch. Without the
 * pre-arm, a payload that dies before reaching its own bookkeeping leaves no
 * rollback evidence and the next cold start retries the same broken payload
 * forever.
 */
export function buildLauncherDelegatedArgs(pointer: LauncherVersionPointer): string[] {
  return [
    LAUNCHER_DELEGATED_GENERATION_ARG,
    normalizeLauncherGeneration(pointer.generation).toString(),
    LAUNCHER_DELEGATED_VERSION_ARG,
    normalizeLauncherVersion(pointer.version),
  ];
}

export function parseLauncherDelegatedArgs(args: readonly string[]): LauncherVersionPointer | null {
  if (!args.includes(LAUNCHER_DELEGATED_GENERATION_ARG)) return null;
  return {
    generation: normalizeLauncherGeneration(valueAfterArg(args, LAUNCHER_DELEGATED_GENERATION_ARG)),
    version: normalizeLauncherVersion(valueAfterArg(args, LAUNCHER_DELEGATED_VERSION_ARG)),
  };
}

export function buildLauncherHandoffResumeArgs(request: LauncherHandoffResumeRequest): string[] {
  return [LAUNCHER_HANDOFF_RESUME_ARG, normalizeLauncherHandoffId(request.handoffId)];
}

export function parseLauncherHandoffResumeArgs(args: readonly string[]): LauncherHandoffResumeRequest | null {
  if (!args.includes(LAUNCHER_HANDOFF_RESUME_ARG)) return null;
  return {
    handoffId: normalizeLauncherHandoffId(valueAfterArg(args, LAUNCHER_HANDOFF_RESUME_ARG)),
  };
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
    handoffPath: assertUnderRoot(root, join(stateRoot, "desktop-handoff.json")),
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

function normalizeRequiredPointer(value: LauncherVersionPointer | null, label: string): LauncherVersionPointer {
  const pointer = normalizePointer(value);
  if (pointer == null) throw new LauncherProtocolError(`${label} is required`);
  return pointer;
}

function normalizeOptionalIsoString(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new LauncherProtocolError(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeIsoString(value: unknown, label: string): string {
  const normalized = normalizeOptionalIsoString(value, label);
  if (normalized == null) throw new LauncherProtocolError(`${label} is required`);
  return normalized;
}

function normalizeLauncherCleanupState(value: unknown): LauncherCleanupState {
  if (
    value === "cleanup-deferred" ||
    value === "cleanup-removed" ||
    value === "deprecated" ||
    value === "retained"
  ) {
    return value;
  }
  throw new LauncherProtocolError(`unsupported launcher cleanup state: ${String(value)}`);
}

function normalizeLauncherCleanupReason(value: unknown): LauncherCleanupReason {
  if (
    value === "cleanup-failed" ||
    value === "current-bound-package" ||
    value === "older-than-bound-package"
  ) {
    return value;
  }
  throw new LauncherProtocolError(`unsupported launcher cleanup reason: ${String(value)}`);
}

function normalizeCleanupError(value: unknown): LauncherCleanupEntry["error"] {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new LauncherProtocolError("launcher cleanup error must be an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || record.code.length === 0) {
    throw new LauncherProtocolError("launcher cleanup error code must be a non-empty string");
  }
  if (typeof record.message !== "string" || record.message.length === 0) {
    throw new LauncherProtocolError("launcher cleanup error message must be a non-empty string");
  }
  return { code: record.code, message: record.message };
}

function normalizeCleanupEntry(value: unknown): LauncherCleanupEntry {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new LauncherProtocolError("launcher cleanup entry must be an object");
  }
  const record = value as Record<string, unknown>;
  const rawGeneration = record.generation;
  if (typeof rawGeneration !== "number" || !Number.isSafeInteger(rawGeneration) || rawGeneration < 0) {
    throw new LauncherProtocolError(`launcher cleanup generation must be a non-negative safe integer: ${String(rawGeneration)}`);
  }
  const generation = rawGeneration;
  const version = normalizeLauncherVersion(record.version);
  const state = normalizeLauncherCleanupState(record.state);
  const reason = normalizeLauncherCleanupReason(record.reason);
  const error = normalizeCleanupError(record.error);
  const removedAt = normalizeOptionalIsoString(record.removedAt, "launcher cleanup removedAt");
  return {
    ...(error == null ? {} : { error }),
    generation,
    reason,
    ...(removedAt == null ? {} : { removedAt }),
    state,
    updatedAt: normalizeIsoString(record.updatedAt, "launcher cleanup updatedAt"),
    version,
  };
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

export function validateLauncherAttemptDescriptor(
  attempt: LauncherAttemptDescriptor,
  expected: { channel: string; namespace: string },
): LauncherAttemptDescriptor {
  if (attempt.schemaVersion !== LAUNCHER_SCHEMA_VERSION) {
    throw new LauncherProtocolError(`unsupported launcher attempt schemaVersion: ${String(attempt.schemaVersion)}`);
  }
  const channel = normalizeLauncherChannel(attempt.channel);
  const expectedChannel = normalizeLauncherChannel(expected.channel);
  if (channel !== expectedChannel) {
    throw new LauncherProtocolError(`launcher attempt channel ${channel} does not match expected channel ${expectedChannel}`);
  }
  const namespace = normalizeLauncherNamespace(attempt.namespace);
  const expectedNamespace = normalizeLauncherNamespace(expected.namespace);
  if (namespace !== expectedNamespace) {
    throw new LauncherProtocolError(`launcher attempt namespace ${namespace} does not match expected namespace ${expectedNamespace}`);
  }
  const pointer = normalizeRequiredPointer(attempt, "launcher attempt pointer");
  return {
    channel,
    generation: pointer.generation,
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    ...(attempt.startedAt == null ? {} : {
      startedAt: normalizeIsoString(attempt.startedAt, "launcher attempt startedAt"),
    }),
    version: pointer.version,
  };
}

function normalizeAbsoluteLauncherPath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new LauncherProtocolError(`${label} must be a non-empty absolute path`);
  }
  if (!isAbsolute(value)) throw new LauncherProtocolError(`${label} must be absolute: ${value}`);
  return resolve(value);
}

export function validateLauncherDesktopHandoffDescriptor(
  handoff: LauncherDesktopHandoffDescriptor,
  expected: { channel: string; namespace: string },
): LauncherDesktopHandoffDescriptor {
  if (handoff.schemaVersion !== LAUNCHER_SCHEMA_VERSION) {
    throw new LauncherProtocolError(`unsupported launcher desktop handoff schemaVersion: ${String(handoff.schemaVersion)}`);
  }
  const channel = normalizeLauncherChannel(handoff.channel);
  const expectedChannel = normalizeLauncherChannel(expected.channel);
  if (channel !== expectedChannel) {
    throw new LauncherProtocolError(`launcher desktop handoff channel ${channel} does not match expected channel ${expectedChannel}`);
  }
  const namespace = normalizeLauncherNamespace(handoff.namespace);
  const expectedNamespace = normalizeLauncherNamespace(expected.namespace);
  if (namespace !== expectedNamespace) {
    throw new LauncherProtocolError(`launcher desktop handoff namespace ${namespace} does not match expected namespace ${expectedNamespace}`);
  }
  if (
    handoff.state !== "prepared" &&
    handoff.state !== "armed" &&
    handoff.state !== "confirmed"
  ) {
    throw new LauncherProtocolError(`unsupported launcher desktop handoff state: ${String(handoff.state)}`);
  }
  const target = handoff.target == null ? null : normalizePointer(handoff.target);
  if ((handoff.state === "armed" || handoff.state === "confirmed") && target == null) {
    throw new LauncherProtocolError(`${handoff.state} launcher desktop handoff requires a target pointer`);
  }
  if (handoff.state === "prepared" && target != null) {
    throw new LauncherProtocolError("prepared launcher desktop handoff must not include a target pointer");
  }
  if (handoff.outer == null || typeof handoff.outer !== "object") {
    throw new LauncherProtocolError("launcher desktop handoff outer identity is required");
  }
  return {
    channel,
    createdAt: normalizeIsoString(handoff.createdAt, "launcher desktop handoff createdAt"),
    handoffId: normalizeLauncherHandoffId(handoff.handoffId),
    namespace,
    outer: {
      executablePath: normalizeAbsoluteLauncherPath(
        handoff.outer.executablePath,
        "launcher desktop handoff outer executablePath",
      ),
      pid: normalizePositiveInteger(handoff.outer.pid, "launcher desktop handoff outer pid"),
    },
    payloadExecutablePath: normalizeAbsoluteLauncherPath(
      handoff.payloadExecutablePath,
      "launcher desktop handoff payloadExecutablePath",
    ),
    previous: normalizeRequiredPointer(handoff.previous, "launcher desktop handoff previous pointer"),
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    source: normalizeRequiredPointer(handoff.source, "launcher desktop handoff source pointer"),
    state: handoff.state,
    ...(target == null ? {} : { target }),
    updatedAt: normalizeIsoString(handoff.updatedAt, "launcher desktop handoff updatedAt"),
  };
}

export function validateLauncherCleanupDescriptor(
  cleanup: LauncherCleanupDescriptor,
  expected: { channel: string; namespace: string },
): LauncherCleanupDescriptor {
  if (cleanup.version !== LAUNCHER_SCHEMA_VERSION) {
    throw new LauncherProtocolError(`unsupported launcher cleanup version: ${String(cleanup.version)}`);
  }
  const channel = normalizeLauncherChannel(cleanup.channel);
  const expectedChannel = normalizeLauncherChannel(expected.channel);
  if (channel !== expectedChannel) {
    throw new LauncherProtocolError(`launcher cleanup channel ${channel} does not match expected channel ${expectedChannel}`);
  }
  const namespace = normalizeLauncherNamespace(cleanup.namespace);
  const expectedNamespace = normalizeLauncherNamespace(expected.namespace);
  if (namespace !== expectedNamespace) {
    throw new LauncherProtocolError(`launcher cleanup namespace ${namespace} does not match expected namespace ${expectedNamespace}`);
  }
  if (!Array.isArray(cleanup.versions)) {
    throw new LauncherProtocolError("launcher cleanup versions must be an array");
  }
  return {
    channel,
    ...(cleanup.currentVersion == null ? {} : { currentVersion: normalizeLauncherVersion(cleanup.currentVersion) }),
    namespace,
    updatedAt: normalizeIsoString(cleanup.updatedAt, "launcher cleanup updatedAt"),
    version: LAUNCHER_SCHEMA_VERSION,
    versions: cleanup.versions.map(normalizeCleanupEntry),
  };
}

export function selectLauncherRuntimeTarget(input: {
  attempted?: LauncherAttemptDescriptor | null;
  delegated?: LauncherVersionPointer | null;
  resume?: LauncherVersionPointer | null;
  runtime: LauncherRuntimeDescriptor;
}): LauncherTargetSelection {
  const active = normalizePointer(input.runtime.active);
  const lastSuccessful = normalizePointer(input.runtime.lastSuccessful);
  const delegated = input.delegated == null ? null : normalizePointer(input.delegated);
  const resume = input.resume == null ? null : normalizePointer(input.resume);
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
    attempted.generation === active.generation
  ) {
    if (
      resume != null &&
      resume.version === active.version &&
      resume.generation === active.generation
    ) {
      return { pointer: active, reason: "active-resume", selected: true };
    }
    // A delegated pointer matching active marks THIS launch's pre-armed
    // attempt (the parent wrote it just before spawning us) — the launch in
    // progress, not a previous failure. Only an exact active match qualifies;
    // a stale pointer from an older generation must not defeat the rollback.
    if (
      delegated != null &&
      delegated.version === active.version &&
      delegated.generation === active.generation
    ) {
      return { pointer: active, reason: "active-delegated", selected: true };
    }
    if (lastSuccessful == null) return { pointer: active, reason: "active", selected: true };
    return { pointer: lastSuccessful, reason: "last-successful", selected: true };
  }

  return { pointer: active, reason: "active", selected: true };
}
