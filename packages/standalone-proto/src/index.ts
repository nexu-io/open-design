import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";

import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";

export const STANDALONE_PROTOCOL_VERSION = 1 as const;
export const STANDALONE_HANDOFF_SCHEMA_VERSION = 1 as const;
export const STANDALONE_BOOTLOADER_ENTRY_PATH = "bootloader.mjs" as const;

export type StandaloneDigest = `sha256:${string}`;

export type StandaloneHandoffScope = Readonly<{
  channel: ReleaseChannel;
  generation: number;
  namespace: string;
}>;

export type StandaloneRuntimeDescriptor = Readonly<{
  release: Readonly<{
    version: string;
  }>;
  shell: Readonly<{
    digest: StandaloneDigest;
    type: string;
    version: string;
  }>;
  standalone: Readonly<{
    digest: StandaloneDigest;
    protocolVersion: typeof STANDALONE_PROTOCOL_VERSION;
    version: string;
  }>;
}>;

export type StandaloneHandoffEnvelope = Readonly<{
  descriptor: StandaloneRuntimeDescriptor;
  descriptorDigest: StandaloneDigest;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
  scope: StandaloneHandoffScope;
}>;

export type StandalonePaths = Readonly<{
  cacheRoot: string;
  dataRoot: string;
  installationRoot: string;
  logsRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
}>;

export type StandaloneProtocolJsonValue =
  | boolean
  | null
  | number
  | string
  | StandaloneProtocolJsonValue[]
  | { [key: string]: StandaloneProtocolJsonValue };

type StandaloneShellCapabilityExchange = Readonly<{
  handoff: StandaloneHandoffEnvelope;
  requestId: string;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
}>;

export type StandaloneShellCapabilityRequest = StandaloneShellCapabilityExchange & Readonly<{
  capability: string;
  input: StandaloneProtocolJsonValue;
}>;

export type StandaloneShellCapabilityResult =
  | (StandaloneShellCapabilityExchange & Readonly<{
      outcome: "completed";
      output: StandaloneProtocolJsonValue;
    }>)
  | (StandaloneShellCapabilityExchange & Readonly<{
      outcome: "unsupported";
    }>)
  | (StandaloneShellCapabilityExchange & Readonly<{
      error: Readonly<{ code: string }>;
      outcome: "failed";
    }>);

export interface StandaloneShellCapabilityPort {
  invoke(request: StandaloneShellCapabilityRequest): Promise<StandaloneShellCapabilityResult>;
}

export type StandaloneHandoffRequest = Readonly<{
  capabilities: StandaloneShellCapabilityPort;
  handoff: StandaloneHandoffEnvelope;
  paths: StandalonePaths;
}>;

type StandaloneRuntimeStatusBase = Readonly<{
  handoff: StandaloneHandoffEnvelope;
  pid: number;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
}>;

export type StandaloneRuntimeRunningStatus = StandaloneRuntimeStatusBase & Readonly<{
  state: "running";
  webUrl: string;
}>;

export type StandaloneRuntimeStoppedStatus = StandaloneRuntimeStatusBase & Readonly<{
  state: "stopped";
}>;

export type StandaloneRuntimeFailedStatus = StandaloneRuntimeStatusBase & Readonly<{
  error: Readonly<{ code: string }>;
  state: "failed";
}>;

export type StandaloneRuntimeTerminalStatus =
  | StandaloneRuntimeStoppedStatus
  | StandaloneRuntimeFailedStatus;

export type StandaloneRuntimeStatus =
  | StandaloneRuntimeRunningStatus
  | StandaloneRuntimeTerminalStatus;

export interface StandaloneHandle {
  close(): Promise<StandaloneRuntimeTerminalStatus>;
  readStatus(): Promise<StandaloneRuntimeStatus>;
  waitForTerminal(): Promise<StandaloneRuntimeTerminalStatus>;
}

export type StandaloneHandoff = (
  request: StandaloneHandoffRequest,
) => Promise<StandaloneHandle>;

export class StandaloneProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandaloneProtocolError";
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new StandaloneProtocolError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeToken(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)
  ) {
    throw new StandaloneProtocolError(`${label} must be a lowercase protocol token`);
  }
  return value;
}

function normalizeNamespace(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)
  ) {
    throw new StandaloneProtocolError("standalone namespace must be a safe local token");
  }
  return value;
}

function normalizeVersion(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value)
  ) {
    throw new StandaloneProtocolError(`${label} must be a comparable semantic version`);
  }
  return value;
}

function normalizeDigest(value: unknown): StandaloneDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new StandaloneProtocolError("standalone digest must be a lowercase sha256 digest");
  }
  return value as StandaloneDigest;
}

function normalizePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.includes("\0")
    || (!isAbsolute(value) && !posix.isAbsolute(value) && !win32.isAbsolute(value))
  ) {
    throw new StandaloneProtocolError(`${label} must be an absolute path`);
  }
  return value;
}

function normalizeJsonValue(
  value: unknown,
  label: string,
  seen: Set<object> = new Set(),
): StandaloneProtocolJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new StandaloneProtocolError(`${label} numbers must be finite`);
    return value;
  }
  if (typeof value !== "object") {
    throw new StandaloneProtocolError(`${label} must contain only JSON values`);
  }
  if (seen.has(value)) throw new StandaloneProtocolError(`${label} must not contain cycles`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalizeJsonValue(entry, `${label}[${index}]`, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StandaloneProtocolError(`${label} objects must be plain JSON records`);
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeJsonValue(entry, `${label}.${key}`, seen),
    ]));
  } finally {
    seen.delete(value);
  }
}

export function validateStandaloneHandoffScope(value: unknown): StandaloneHandoffScope {
  const scope = requireRecord(value, "standalone handoff scope");
  if (!isReleaseChannel(scope.channel)) {
    throw new StandaloneProtocolError(`unsupported standalone channel: ${String(scope.channel)}`);
  }
  if (
    typeof scope.generation !== "number"
    || !Number.isSafeInteger(scope.generation)
    || scope.generation < 0
  ) {
    throw new StandaloneProtocolError("standalone generation must be a non-negative safe integer");
  }
  return {
    channel: scope.channel,
    generation: scope.generation,
    namespace: normalizeNamespace(scope.namespace),
  };
}

export function validateStandaloneRuntimeDescriptor(value: unknown): StandaloneRuntimeDescriptor {
  const descriptor = requireRecord(value, "standalone runtime descriptor");
  const release = requireRecord(descriptor.release, "standalone release descriptor");
  const shell = requireRecord(descriptor.shell, "standalone shell descriptor");
  const standalone = requireRecord(descriptor.standalone, "standalone body descriptor");
  if (standalone.protocolVersion !== STANDALONE_PROTOCOL_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone protocol version: ${String(standalone.protocolVersion)}`,
    );
  }
  return {
    release: {
      version: normalizeVersion(release.version, "standalone release version"),
    },
    shell: {
      digest: normalizeDigest(shell.digest),
      type: normalizeToken(shell.type, "standalone shell type"),
      version: normalizeVersion(shell.version, "standalone shell version"),
    },
    standalone: {
      digest: normalizeDigest(standalone.digest),
      protocolVersion: STANDALONE_PROTOCOL_VERSION,
      version: normalizeVersion(standalone.version, "standalone body version"),
    },
  };
}

function descriptorJson(descriptor: StandaloneRuntimeDescriptor): string {
  return JSON.stringify({
    release: { version: descriptor.release.version },
    shell: {
      digest: descriptor.shell.digest,
      type: descriptor.shell.type,
      version: descriptor.shell.version,
    },
    standalone: {
      digest: descriptor.standalone.digest,
      protocolVersion: descriptor.standalone.protocolVersion,
      version: descriptor.standalone.version,
    },
  });
}

export function digestStandaloneRuntimeDescriptor(value: unknown): StandaloneDigest {
  const descriptor = validateStandaloneRuntimeDescriptor(value);
  return `sha256:${createHash("sha256").update(descriptorJson(descriptor)).digest("hex")}`;
}

export function sameStandaloneHandoffScope(
  left: StandaloneHandoffScope,
  right: StandaloneHandoffScope,
): boolean {
  return (
    left.channel === right.channel
    && left.generation === right.generation
    && left.namespace === right.namespace
  );
}

export function sameStandaloneHandoffEnvelope(
  left: StandaloneHandoffEnvelope,
  right: StandaloneHandoffEnvelope,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion
    && left.descriptorDigest === right.descriptorDigest
    && sameStandaloneHandoffScope(left.scope, right.scope)
  );
}

export function createStandaloneHandoffEnvelope(
  input: Readonly<{
    descriptor: StandaloneRuntimeDescriptor;
    scope: StandaloneHandoffScope;
  }>,
): StandaloneHandoffEnvelope {
  const descriptor = validateStandaloneRuntimeDescriptor(input.descriptor);
  return validateStandaloneHandoffEnvelope({
    descriptor,
    descriptorDigest: digestStandaloneRuntimeDescriptor(descriptor),
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    scope: input.scope,
  });
}

export function validateStandaloneHandoffEnvelope(
  value: unknown,
  expected?: StandaloneHandoffEnvelope,
): StandaloneHandoffEnvelope {
  const envelope = requireRecord(value, "standalone handoff");
  if (envelope.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone handoff schema version: ${String(envelope.schemaVersion)}`,
    );
  }
  const descriptor = validateStandaloneRuntimeDescriptor(envelope.descriptor);
  const descriptorDigest = normalizeDigest(envelope.descriptorDigest);
  if (descriptorDigest !== digestStandaloneRuntimeDescriptor(descriptor)) {
    throw new StandaloneProtocolError(
      "standalone descriptorDigest does not match the runtime descriptor",
    );
  }
  const normalized = {
    descriptor,
    descriptorDigest,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    scope: validateStandaloneHandoffScope(envelope.scope),
  } as const;
  if (
    expected != null
    && (
      !sameStandaloneHandoffEnvelope(normalized, expected)
    )
  ) {
    throw new StandaloneProtocolError(
      "standalone handoff does not match the committed generation and descriptor",
    );
  }
  return normalized;
}

export function validateStandalonePaths(value: unknown): StandalonePaths {
  const paths = requireRecord(value, "standalone paths");
  return {
    cacheRoot: normalizePath(paths.cacheRoot, "standalone cacheRoot"),
    dataRoot: normalizePath(paths.dataRoot, "standalone dataRoot"),
    installationRoot: normalizePath(paths.installationRoot, "standalone installationRoot"),
    logsRoot: normalizePath(paths.logsRoot, "standalone logsRoot"),
    resourceRoot: normalizePath(paths.resourceRoot, "standalone resourceRoot"),
    runtimeRoot: normalizePath(paths.runtimeRoot, "standalone runtimeRoot"),
  };
}

export function validateStandaloneHandoffRequest(value: unknown): StandaloneHandoffRequest {
  const request = requireRecord(value, "standalone handoff request");
  const capabilities = requireRecord(request.capabilities, "standalone shell capability port");
  if (typeof capabilities.invoke !== "function") {
    throw new StandaloneProtocolError("standalone shell capability port must expose invoke()");
  }
  return {
    capabilities: request.capabilities as StandaloneShellCapabilityPort,
    handoff: validateStandaloneHandoffEnvelope(request.handoff),
    paths: validateStandalonePaths(request.paths),
  };
}

function validateCapabilityExchange(
  value: Record<string, unknown>,
  expected?: { handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneShellCapabilityExchange {
  if (value.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone capability schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(value.handoff, expected?.handoff);
  const requestId = normalizeToken(value.requestId, "standalone capability requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone capability requestId does not match");
  }
  return { handoff, requestId, schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION };
}

export function validateStandaloneShellCapabilityRequest(
  value: unknown,
  expected?: { handoff?: StandaloneHandoffEnvelope },
): StandaloneShellCapabilityRequest {
  const request = requireRecord(value, "standalone shell capability request");
  return {
    ...validateCapabilityExchange(request, expected),
    capability: normalizeToken(request.capability, "standalone shell capability"),
    input: normalizeJsonValue(request.input, "standalone shell capability input"),
  };
}

export function validateStandaloneShellCapabilityResult(
  value: unknown,
  expected?: { handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneShellCapabilityResult {
  const result = requireRecord(value, "standalone shell capability result");
  const exchange = validateCapabilityExchange(result, expected);
  if (result.outcome === "completed") {
    return {
      ...exchange,
      outcome: "completed",
      output: normalizeJsonValue(result.output, "standalone shell capability output"),
    };
  }
  if (result.outcome === "unsupported") return { ...exchange, outcome: "unsupported" };
  if (result.outcome === "failed") {
    const error = requireRecord(result.error, "standalone shell capability error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone shell capability error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone shell capability outcome: ${String(result.outcome)}`,
  );
}

export function validateStandaloneRuntimeStatus(
  value: unknown,
  expected?: { handoff?: StandaloneHandoffEnvelope; state?: StandaloneRuntimeStatus["state"] },
): StandaloneRuntimeStatus {
  const status = requireRecord(value, "standalone runtime status");
  if (status.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone runtime status schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(status.handoff, expected?.handoff);
  if (
    typeof status.pid !== "number"
    || !Number.isSafeInteger(status.pid)
    || status.pid <= 0
  ) {
    throw new StandaloneProtocolError("standalone runtime pid must be a positive safe integer");
  }
  if (expected?.state != null && status.state !== expected.state) {
    throw new StandaloneProtocolError(
      `standalone runtime state ${String(status.state)} does not match ${expected.state}`,
    );
  }
  const base = {
    handoff,
    pid: status.pid,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
  } as const;
  if (status.state === "running") {
    if (typeof status.webUrl !== "string" || !/^https?:\/\//u.test(status.webUrl)) {
      throw new StandaloneProtocolError("running standalone status must contain an http(s) webUrl");
    }
    return { ...base, state: "running", webUrl: status.webUrl };
  }
  if (status.state === "stopped") return { ...base, state: "stopped" };
  if (status.state === "failed") {
    const error = requireRecord(status.error, "standalone runtime error");
    return {
      ...base,
      error: { code: normalizeToken(error.code, "standalone runtime error code") },
      state: "failed",
    };
  }
  throw new StandaloneProtocolError(`unsupported standalone runtime state: ${String(status.state)}`);
}

type ComparableVersion = Readonly<{
  core: readonly [number, number, number];
  prerelease: string[];
}>;

function comparableVersion(value: string): ComparableVersion {
  const validated = normalizeVersion(value, "standalone version");
  const normalized = validated.replace(/^v/iu, "").split("+", 1)[0] ?? "";
  const prereleaseSeparator = normalized.indexOf("-");
  const core = prereleaseSeparator === -1 ? normalized : normalized.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : normalized.slice(prereleaseSeparator + 1);
  const parts = core.split(".").map(Number);
  return {
    core: [parts[0]!, parts[1]!, parts[2]!],
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

export function compareStandaloneVersions(left: string, right: string): number {
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
