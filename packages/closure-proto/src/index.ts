import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";
import { normalizeNamespace } from "@open-design/sidecar-proto";

export const CLOSURE_SCHEMA_VERSION = 1 as const;
export const CLOSURE_PROTOCOL_VERSION = 1 as const;
export const CLOSURE_INVENTORY_SCHEMA_VERSION = 1 as const;
export const CLOSURE_ARCHIVE_MEDIA_TYPE = "application/vnd.open-design.closure.zip-v1" as const;
export const CLOSURE_ARCHIVE_ENTRY_PATH = "runtime.mjs" as const;

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
