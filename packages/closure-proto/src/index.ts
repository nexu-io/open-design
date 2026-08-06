import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";
import { normalizeNamespace } from "@open-design/sidecar-proto";

export const CLOSURE_SCHEMA_VERSION = 1 as const;
export const CLOSURE_PROTOCOL_VERSION = 1 as const;
export const CLOSURE_INVENTORY_SCHEMA_VERSION = 1 as const;
export const CLOSURE_HANDOFF_SCHEMA_VERSION = 1 as const;
export const CLOSURE_SHIM_SCHEMA_VERSION = 1 as const;
export const CLOSURE_SIGNATURE_SCHEMA_VERSION = 1 as const;
export const CLOSURE_ARCHIVE_MEDIA_TYPE = "application/vnd.open-design.closure.zip-v1" as const;
export const CLOSURE_ARCHIVE_ENTRY_PATH = "runtime.mjs" as const;
export const CLOSURE_SIGNATURE_ALGORITHM = "ed25519" as const;

export type ClosureDigest = `sha256:${string}`;

export type ClosureCandidateIdentity = {
  channel: ReleaseChannel;
  digest: ClosureDigest;
  platform: string;
  protocolVersion: typeof CLOSURE_PROTOCOL_VERSION;
  version: string;
};

export type ClosureBindingIdentity = ClosureCandidateIdentity & {
  namespace: string;
};

export type ClosureArtifactDescriptor = {
  digest: ClosureDigest;
  entryPath: typeof CLOSURE_ARCHIVE_ENTRY_PATH;
  inventoryDigest: ClosureDigest;
  mediaType: typeof CLOSURE_ARCHIVE_MEDIA_TYPE;
  size: number;
  url: string;
};

export type ClosureShellCompatibility = {
  minVersion: string;
};

export type ClosureCandidateManifest = {
  artifact: ClosureArtifactDescriptor;
  compatibility: {
    shell: ClosureShellCompatibility;
  };
  identity: ClosureCandidateIdentity;
  schemaVersion: typeof CLOSURE_SCHEMA_VERSION;
};

export type ClosureFileInventoryEntry = {
  digest: ClosureDigest;
  path: string;
  size: number;
};

export type ClosureFileInventory = {
  files: ClosureFileInventoryEntry[];
  schemaVersion: typeof CLOSURE_INVENTORY_SCHEMA_VERSION;
};

export type ClosureRuntimeIdentity = ClosureBindingIdentity & {
  generation: number;
};

export type ClosureProtocolJsonValue =
  | boolean
  | null
  | number
  | string
  | ClosureProtocolJsonValue[]
  | { [key: string]: ClosureProtocolJsonValue };

/**
 * Stable, additive identity envelope passed from the shell-carried shim to one
 * Closure body generation. Body layout and transport deliberately stay out of
 * this contract.
 */
export type ClosureHandoffEnvelope = {
  identity: ClosureRuntimeIdentity;
  schemaVersion: typeof CLOSURE_HANDOFF_SCHEMA_VERSION;
};

type ClosureShellCapabilityExchange = {
  handoff: ClosureHandoffEnvelope;
  requestId: string;
  schemaVersion: typeof CLOSURE_HANDOFF_SCHEMA_VERSION;
};

/**
 * One generation-bound request from a Closure body to its carrying shell.
 * Capability payloads stay JSON-shaped so the physical IPC remains replaceable.
 */
export type ClosureShellCapabilityRequest = ClosureShellCapabilityExchange & {
  capability: string;
  input: ClosureProtocolJsonValue;
};

export type ClosureShellCapabilityCompletedResult = ClosureShellCapabilityExchange & {
  outcome: "completed";
  output: ClosureProtocolJsonValue;
};

export type ClosureShellCapabilityUnsupportedResult = ClosureShellCapabilityExchange & {
  outcome: "unsupported";
};

export type ClosureShellCapabilityFailedResult = ClosureShellCapabilityExchange & {
  error: {
    code: string;
  };
  outcome: "failed";
};

export type ClosureShellCapabilityResult =
  | ClosureShellCapabilityCompletedResult
  | ClosureShellCapabilityUnsupportedResult
  | ClosureShellCapabilityFailedResult;

export interface ClosureShellCapabilityPort {
  invoke(request: ClosureShellCapabilityRequest): Promise<ClosureShellCapabilityResult>;
}

type ClosureRuntimeStatusBase = {
  handoff: ClosureHandoffEnvelope;
  pid: number;
  schemaVersion: typeof CLOSURE_HANDOFF_SCHEMA_VERSION;
};

export type ClosureRuntimeRunningStatus = ClosureRuntimeStatusBase & {
  state: "running";
};

export type ClosureRuntimeStoppedStatus = ClosureRuntimeStatusBase & {
  state: "stopped";
};

export type ClosureRuntimeFailedStatus = ClosureRuntimeStatusBase & {
  error: {
    code: string;
  };
  state: "failed";
};

export type ClosureRuntimeTerminalStatus =
  | ClosureRuntimeStoppedStatus
  | ClosureRuntimeFailedStatus;

export type ClosureRuntimeStatus =
  | ClosureRuntimeRunningStatus
  | ClosureRuntimeTerminalStatus;

export type ClosureShimRequest = {
  channel: ReleaseChannel;
  namespace: string;
  platform: string;
  schemaVersion: typeof CLOSURE_SHIM_SCHEMA_VERSION;
  shell: {
    type: string;
    version: string;
  };
};

export type ClosureShimReadyResult = {
  handoff: ClosureHandoffEnvelope;
  outcome: "ready";
  reused: boolean;
  rolledBack: boolean;
  schemaVersion: typeof CLOSURE_SHIM_SCHEMA_VERSION;
};

export type ClosureShimInstallerReinstallResult = {
  minShellVersion: string;
  outcome: "installer-reinstall";
  schemaVersion: typeof CLOSURE_SHIM_SCHEMA_VERSION;
};

export type ClosureShimResult =
  | ClosureShimReadyResult
  | ClosureShimInstallerReinstallResult;

/** Detached signature over serializeClosureCandidateManifestForSigning(). */
export type ClosureCandidateSignature = {
  algorithm: typeof CLOSURE_SIGNATURE_ALGORITHM;
  keyId: string;
  schemaVersion: typeof CLOSURE_SIGNATURE_SCHEMA_VERSION;
  value: string;
};

export class ClosureProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureProtocolError";
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ClosureProtocolError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeChannel(value: unknown): ReleaseChannel {
  if (!isReleaseChannel(value)) {
    throw new ClosureProtocolError(`unsupported closure channel: ${String(value)}`);
  }
  return value;
}

function normalizeVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ClosureProtocolError(`${label} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new ClosureProtocolError(`${label} must not contain leading or trailing whitespace`);
  }
  if (value.includes("\0") || /[\\/]/u.test(value) || value === "." || value === ".." || value.includes("..")) {
    throw new ClosureProtocolError(`${label} must be a safe version identifier`);
  }
  return value;
}

function normalizeDigest(value: unknown): ClosureDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new ClosureProtocolError("closure digest must be a lowercase sha256 digest");
  }
  return value as ClosureDigest;
}

function normalizePlatform(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(value)) {
    throw new ClosureProtocolError("closure platform must be a lowercase os-arch identifier");
  }
  return value;
}

function normalizePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ClosureProtocolError(`${label} must be a positive safe integer`);
  }
  return value;
}

function normalizeNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ClosureProtocolError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeShellType(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new ClosureProtocolError("closure shell type must be a lowercase token");
  }
  return value;
}

function normalizeKeyId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/u.test(value)) {
    throw new ClosureProtocolError("closure signature keyId must be a safe token");
  }
  return value;
}

function normalizeSignatureValue(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new ClosureProtocolError("closure signature value must be unpadded base64url");
  }
  return value;
}

function normalizeProtocolToken(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9._-]{0,127})$/u.test(value)
  ) {
    throw new ClosureProtocolError(`${label} must be a lowercase protocol token`);
  }
  return value;
}

function normalizeProtocolJsonValue(
  value: unknown,
  label: string,
  seen: Set<object> = new Set(),
): ClosureProtocolJsonValue {
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ClosureProtocolError(`${label} numbers must be finite`);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new ClosureProtocolError(`${label} must contain only JSON values`);
  }
  if (seen.has(value)) {
    throw new ClosureProtocolError(`${label} must not contain cycles`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalizeProtocolJsonValue(
        entry,
        `${label}[${index}]`,
        seen,
      ));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ClosureProtocolError(`${label} objects must be plain JSON records`);
    }
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [
      key,
      normalizeProtocolJsonValue(entry, `${label}.${key}`, seen),
    ]));
  } finally {
    seen.delete(value);
  }
}

function normalizeInventoryPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ClosureProtocolError("closure inventory path must be a non-empty string");
  }
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((component) => component.length === 0 || component === "." || component === "..")
  ) {
    throw new ClosureProtocolError(`closure inventory path must be a safe relative POSIX path: ${value}`);
  }
  return value;
}

function normalizeProtocolVersion(value: unknown): typeof CLOSURE_PROTOCOL_VERSION {
  const protocolVersion = normalizePositiveInteger(value, "closure protocol version");
  if (protocolVersion !== CLOSURE_PROTOCOL_VERSION) {
    throw new ClosureProtocolError(`unsupported closure protocol version: ${protocolVersion}`);
  }
  return protocolVersion;
}

function normalizeProductNamespace(value: unknown): string {
  try {
    return normalizeNamespace(value);
  } catch (error) {
    throw new ClosureProtocolError(
      `invalid closure product namespace: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizeHttpUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ClosureProtocolError("closure artifact URL must be a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ClosureProtocolError("closure artifact URL must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ClosureProtocolError("closure artifact URL must use http or https");
  }
  return parsed.toString();
}

function normalizeCandidateFields(value: Record<string, unknown>): ClosureCandidateIdentity {
  return {
    channel: normalizeChannel(value.channel),
    digest: normalizeDigest(value.digest),
    platform: normalizePlatform(value.platform),
    protocolVersion: normalizeProtocolVersion(value.protocolVersion),
    version: normalizeVersion(value.version, "closure version"),
  };
}

export function validateClosureCandidateIdentity(value: unknown): ClosureCandidateIdentity {
  const candidate = requireRecord(value, "closure candidate identity");
  if (Object.hasOwn(candidate, "namespace")) {
    throw new ClosureProtocolError("closure candidate identity must not contain a local namespace");
  }
  return normalizeCandidateFields(candidate);
}

export function bindClosureCandidateIdentity(
  candidate: ClosureCandidateIdentity,
  namespace: string,
): ClosureBindingIdentity {
  return {
    ...validateClosureCandidateIdentity(candidate),
    namespace: normalizeProductNamespace(namespace),
  };
}

export function validateClosureBindingIdentity(
  value: unknown,
  expected?: { channel: string; namespace: string },
): ClosureBindingIdentity {
  const binding = requireRecord(value, "closure binding identity");
  const normalized: ClosureBindingIdentity = {
    ...normalizeCandidateFields(binding),
    namespace: normalizeProductNamespace(binding.namespace),
  };
  if (expected != null) {
    const channel = normalizeChannel(expected.channel);
    const namespace = normalizeProductNamespace(expected.namespace);
    if (normalized.channel !== channel) {
      throw new ClosureProtocolError(
        `closure binding channel ${normalized.channel} does not match expected channel ${channel}`,
      );
    }
    if (normalized.namespace !== namespace) {
      throw new ClosureProtocolError(
        `closure binding namespace ${normalized.namespace} does not match expected namespace ${namespace}`,
      );
    }
  }
  return normalized;
}

export function validateClosureCandidateManifest(value: unknown): ClosureCandidateManifest {
  const manifest = requireRecord(value, "closure candidate manifest");
  if (Object.hasOwn(manifest, "namespace")) {
    throw new ClosureProtocolError("closure candidate manifest must not contain a local namespace");
  }
  if (manifest.schemaVersion !== CLOSURE_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure manifest schema version: ${String(manifest.schemaVersion)}`,
    );
  }
  const identity = validateClosureCandidateIdentity(manifest.identity);
  const artifact = requireRecord(manifest.artifact, "closure artifact");
  const digest = normalizeDigest(artifact.digest);
  const inventoryDigest = normalizeDigest(artifact.inventoryDigest);
  if (digest !== identity.digest) {
    throw new ClosureProtocolError("closure artifact digest must match candidate identity digest");
  }
  if (artifact.mediaType !== CLOSURE_ARCHIVE_MEDIA_TYPE) {
    throw new ClosureProtocolError(`unsupported closure artifact media type: ${String(artifact.mediaType)}`);
  }
  if (artifact.entryPath !== CLOSURE_ARCHIVE_ENTRY_PATH) {
    throw new ClosureProtocolError(`unsupported closure artifact entry path: ${String(artifact.entryPath)}`);
  }
  const compatibility = requireRecord(manifest.compatibility, "closure compatibility");
  const shell = requireRecord(compatibility.shell, "closure shell compatibility");
  return {
    artifact: {
      digest,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest,
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: normalizePositiveInteger(artifact.size, "closure artifact size"),
      url: normalizeHttpUrl(artifact.url),
    },
    compatibility: {
      shell: {
        minVersion: normalizeVersion(shell.minVersion, "closure minimum shell version"),
      },
    },
    identity,
    schemaVersion: CLOSURE_SCHEMA_VERSION,
  };
}

export function validateClosureFileInventory(value: unknown): ClosureFileInventory {
  const inventory = requireRecord(value, "closure file inventory");
  if (inventory.schemaVersion !== CLOSURE_INVENTORY_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure inventory schema version: ${String(inventory.schemaVersion)}`,
    );
  }
  if (!Array.isArray(inventory.files)) {
    throw new ClosureProtocolError("closure inventory files must be an array");
  }
  const files = inventory.files.map((entry) => {
    const file = requireRecord(entry, "closure inventory file");
    return {
      digest: normalizeDigest(file.digest),
      path: normalizeInventoryPath(file.path),
      size: normalizeNonNegativeInteger(file.size, "closure inventory file size"),
    };
  });
  for (let index = 1; index < files.length; index += 1) {
    const previous = files[index - 1];
    const current = files[index];
    if (previous == null || current == null || previous.path >= current.path) {
      throw new ClosureProtocolError("closure inventory paths must be strictly sorted and unique");
    }
  }
  if (!files.some((file) => file.path === CLOSURE_ARCHIVE_ENTRY_PATH)) {
    throw new ClosureProtocolError(`closure inventory must contain ${CLOSURE_ARCHIVE_ENTRY_PATH}`);
  }
  return { files, schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION };
}

export function createClosureHandoffEnvelope(
  identity: ClosureRuntimeIdentity,
): ClosureHandoffEnvelope {
  return validateClosureHandoffEnvelope({
    identity,
    schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
  });
}

export function validateClosureHandoffEnvelope(
  value: unknown,
  expected?: {
    channel?: string;
    generation?: number;
    namespace?: string;
    platform?: string;
  },
): ClosureHandoffEnvelope {
  const envelope = requireRecord(value, "closure handoff envelope");
  if (envelope.schemaVersion !== CLOSURE_HANDOFF_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure handoff schema version: ${String(envelope.schemaVersion)}`,
    );
  }
  const identityValue = requireRecord(envelope.identity, "closure handoff identity");
  const identity: ClosureRuntimeIdentity = {
    ...validateClosureBindingIdentity(identityValue),
    generation: normalizeNonNegativeInteger(identityValue.generation, "closure generation"),
  };
  if (expected?.channel != null && identity.channel !== normalizeChannel(expected.channel)) {
    throw new ClosureProtocolError(
      `closure handoff channel ${identity.channel} does not match expected channel ${expected.channel}`,
    );
  }
  if (
    expected?.namespace != null
    && identity.namespace !== normalizeProductNamespace(expected.namespace)
  ) {
    throw new ClosureProtocolError(
      `closure handoff namespace ${identity.namespace} does not match expected namespace ${expected.namespace}`,
    );
  }
  if (expected?.platform != null && identity.platform !== normalizePlatform(expected.platform)) {
    throw new ClosureProtocolError(
      `closure handoff platform ${identity.platform} does not match expected platform ${expected.platform}`,
    );
  }
  if (
    expected?.generation != null
    && identity.generation !== normalizeNonNegativeInteger(expected.generation, "expected closure generation")
  ) {
    throw new ClosureProtocolError(
      `closure handoff generation ${identity.generation} does not match expected generation ${expected.generation}`,
    );
  }
  return {
    identity,
    schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
  };
}

function validateCapabilityExchange(
  value: Record<string, unknown>,
  expected?: {
    handoff?: ClosureHandoffEnvelope;
    requestId?: string;
  },
): ClosureShellCapabilityExchange {
  if (value.schemaVersion !== CLOSURE_HANDOFF_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure shell capability schema version: ${String(value.schemaVersion)}`,
    );
  }
  const expectedIdentity = expected?.handoff?.identity;
  const handoff = validateClosureHandoffEnvelope(value.handoff, expectedIdentity == null
    ? undefined
    : {
        channel: expectedIdentity.channel,
        generation: expectedIdentity.generation,
        namespace: expectedIdentity.namespace,
        platform: expectedIdentity.platform,
      });
  if (
    expected?.handoff != null
    && handoff.identity.digest !== expected.handoff.identity.digest
  ) {
    throw new ClosureProtocolError("closure shell capability handoff digest does not match expected handoff");
  }
  if (
    expected?.handoff != null
    && handoff.identity.version !== expected.handoff.identity.version
  ) {
    throw new ClosureProtocolError("closure shell capability handoff version does not match expected handoff");
  }
  const requestId = normalizeProtocolToken(value.requestId, "closure shell capability requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new ClosureProtocolError(
      `closure shell capability requestId ${requestId} does not match expected requestId ${expected.requestId}`,
    );
  }
  return {
    handoff,
    requestId,
    schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
  };
}

export function validateClosureShellCapabilityRequest(
  value: unknown,
  expected?: { handoff?: ClosureHandoffEnvelope },
): ClosureShellCapabilityRequest {
  const request = requireRecord(value, "closure shell capability request");
  return {
    ...validateCapabilityExchange(request, expected),
    capability: normalizeProtocolToken(
      request.capability,
      "closure shell capability name",
    ),
    input: normalizeProtocolJsonValue(request.input, "closure shell capability input"),
  };
}

export function validateClosureShellCapabilityResult(
  value: unknown,
  expected?: {
    handoff?: ClosureHandoffEnvelope;
    requestId?: string;
  },
): ClosureShellCapabilityResult {
  const result = requireRecord(value, "closure shell capability result");
  const exchange = validateCapabilityExchange(result, expected);
  if (result.outcome === "completed") {
    return {
      ...exchange,
      outcome: "completed",
      output: normalizeProtocolJsonValue(result.output, "closure shell capability output"),
    };
  }
  if (result.outcome === "unsupported") {
    return {
      ...exchange,
      outcome: "unsupported",
    };
  }
  if (result.outcome === "failed") {
    const error = requireRecord(result.error, "closure shell capability error");
    return {
      ...exchange,
      error: {
        code: normalizeProtocolToken(error.code, "closure shell capability error code"),
      },
      outcome: "failed",
    };
  }
  throw new ClosureProtocolError(
    `unsupported closure shell capability outcome: ${String(result.outcome)}`,
  );
}

export function validateClosureRuntimeStatus(
  value: unknown,
  expected?: {
    handoff?: ClosureHandoffEnvelope;
    state?: ClosureRuntimeStatus["state"];
  },
): ClosureRuntimeStatus {
  const status = requireRecord(value, "closure runtime status");
  if (status.schemaVersion !== CLOSURE_HANDOFF_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure runtime status schema version: ${String(status.schemaVersion)}`,
    );
  }
  const expectedIdentity = expected?.handoff?.identity;
  const handoff = validateClosureHandoffEnvelope(status.handoff, expectedIdentity == null
    ? undefined
    : {
        channel: expectedIdentity.channel,
        generation: expectedIdentity.generation,
        namespace: expectedIdentity.namespace,
        platform: expectedIdentity.platform,
      });
  if (
    expected?.handoff != null
    && (
      handoff.identity.digest !== expected.handoff.identity.digest
      || handoff.identity.version !== expected.handoff.identity.version
    )
  ) {
    throw new ClosureProtocolError("closure runtime status does not match expected handoff candidate");
  }
  const pid = normalizePositiveInteger(status.pid, "closure runtime pid");
  if (expected?.state != null && status.state !== expected.state) {
    throw new ClosureProtocolError(
      `closure runtime state ${String(status.state)} does not match expected state ${expected.state}`,
    );
  }
  if (status.state === "running" || status.state === "stopped") {
    return {
      handoff,
      pid,
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      state: status.state,
    };
  }
  if (status.state === "failed") {
    const error = requireRecord(status.error, "closure runtime error");
    return {
      error: {
        code: normalizeProtocolToken(error.code, "closure runtime error code"),
      },
      handoff,
      pid,
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      state: "failed",
    };
  }
  throw new ClosureProtocolError(`unsupported closure runtime state: ${String(status.state)}`);
}

export function validateClosureShimRequest(value: unknown): ClosureShimRequest {
  const request = requireRecord(value, "closure shim request");
  if (request.schemaVersion !== CLOSURE_SHIM_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure shim schema version: ${String(request.schemaVersion)}`,
    );
  }
  const shell = requireRecord(request.shell, "closure shim shell identity");
  return {
    channel: normalizeChannel(request.channel),
    namespace: normalizeProductNamespace(request.namespace),
    platform: normalizePlatform(request.platform),
    schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    shell: {
      type: normalizeShellType(shell.type),
      version: normalizeVersion(shell.version, "closure shell version"),
    },
  };
}

export function validateClosureShimResult(
  value: unknown,
  expected?: {
    channel: string;
    namespace: string;
    platform: string;
  },
): ClosureShimResult {
  const result = requireRecord(value, "closure shim result");
  if (result.schemaVersion !== CLOSURE_SHIM_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure shim schema version: ${String(result.schemaVersion)}`,
    );
  }
  if (result.outcome === "installer-reinstall") {
    return {
      minShellVersion: normalizeVersion(result.minShellVersion, "closure minimum shell version"),
      outcome: "installer-reinstall",
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    };
  }
  if (result.outcome === "ready") {
    if (typeof result.reused !== "boolean" || typeof result.rolledBack !== "boolean") {
      throw new ClosureProtocolError("ready closure shim result must declare reused and rolledBack");
    }
    return {
      handoff: validateClosureHandoffEnvelope(result.handoff, expected),
      outcome: "ready",
      reused: result.reused,
      rolledBack: result.rolledBack,
      schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    };
  }
  throw new ClosureProtocolError(`unsupported closure shim outcome: ${String(result.outcome)}`);
}

export function validateClosureCandidateSignature(value: unknown): ClosureCandidateSignature {
  const signature = requireRecord(value, "closure candidate signature");
  if (signature.schemaVersion !== CLOSURE_SIGNATURE_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure signature schema version: ${String(signature.schemaVersion)}`,
    );
  }
  if (signature.algorithm !== CLOSURE_SIGNATURE_ALGORITHM) {
    throw new ClosureProtocolError(
      `unsupported closure signature algorithm: ${String(signature.algorithm)}`,
    );
  }
  return {
    algorithm: CLOSURE_SIGNATURE_ALGORITHM,
    keyId: normalizeKeyId(signature.keyId),
    schemaVersion: CLOSURE_SIGNATURE_SCHEMA_VERSION,
    value: normalizeSignatureValue(signature.value),
  };
}

export function serializeClosureCandidateManifestForSigning(value: unknown): string {
  return `${JSON.stringify(validateClosureCandidateManifest(value))}\n`;
}
