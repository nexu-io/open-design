import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";
import { normalizeNamespace } from "@open-design/sidecar-proto";

export const CLOSURE_SCHEMA_VERSION = 1 as const;
export const CLOSURE_DISTRIBUTION_SCHEMA_VERSION = 2 as const;
export const CLOSURE_PROTOCOL_VERSION = 1 as const;
export const CLOSURE_INVENTORY_SCHEMA_VERSION = 1 as const;
export const CLOSURE_SIGNATURE_SCHEMA_VERSION = 1 as const;
export const CLOSURE_ARCHIVE_MEDIA_TYPE = "application/vnd.open-design.closure.zip-v1" as const;
export const CLOSURE_ARCHIVE_ENTRY_PATH = "bootloader.mjs" as const;
export const CLOSURE_LAUNCHER_ENTRY_PATH = "launcher.mjs" as const;
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

export type ClosureShellCompatibility = Record<string, {
  version: {
    min: string;
  };
}>;

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

/** Detached signature over serializeClosureCandidateManifestForSigning(). */
export type ClosureCandidateSignature = {
  algorithm: typeof CLOSURE_SIGNATURE_ALGORITHM;
  keyId: string;
  schemaVersion: typeof CLOSURE_SIGNATURE_SCHEMA_VERSION;
  value: string;
};

export type ClosureDistributionBlob = {
  digest: ClosureDigest;
  mediaType: string;
  size: number;
  url: string;
};

export type ClosureDistributionComponent = {
  blob: ClosureDigest;
  treeDigest: ClosureDigest;
};

export type ClosureDistributionEntrypointComponent = ClosureDistributionComponent & {
  entryPath: string;
};

export type ClosureDistributionTarget = {
  native: ClosureDistributionComponent;
  runtime: ClosureDistributionEntrypointComponent;
};

export type ClosureDistributionResource = ClosureDistributionComponent & {
  id: string;
  title: string;
};

export type ClosureDistributionIdentityDraft = {
  channel: ReleaseChannel;
  protocolVersion: typeof CLOSURE_PROTOCOL_VERSION;
  version: string;
};

export type ClosureDistributionIdentity = ClosureDistributionIdentityDraft & {
  digest: ClosureDigest;
};

export type ClosureDistributionManifestDraft = {
  blobs: Record<string, ClosureDistributionBlob>;
  compatibility: {
    shell: ClosureShellCompatibility;
  };
  identity: ClosureDistributionIdentityDraft;
  required: {
    body: ClosureDistributionEntrypointComponent;
    launcher: ClosureDistributionEntrypointComponent;
    targets: Record<string, ClosureDistributionTarget>;
  };
  resources: ClosureDistributionResource[];
  schemaVersion: typeof CLOSURE_DISTRIBUTION_SCHEMA_VERSION;
};

export type ClosureDistributionManifest = Omit<ClosureDistributionManifestDraft, "identity"> & {
  identity: ClosureDistributionIdentity;
};

export type ClosureDistributionDigest = (canonicalManifest: string) => ClosureDigest;

export type ClosureComponentTreeFile = ClosureFileInventoryEntry;

export type ResolvedClosureDistributionTarget = {
  required: {
    body: ClosureDistributionEntrypointComponent;
    launcher: ClosureDistributionEntrypointComponent;
    native: ClosureDistributionComponent;
    runtime: ClosureDistributionEntrypointComponent;
  };
  requiredBlobs: ClosureDistributionBlob[];
  resources: Array<ClosureDistributionResource & Readonly<{
    artifact: ClosureDistributionBlob;
  }>>;
  target: string;
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

function requireKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    throw new ClosureProtocolError(`${label} contains unsupported fields: ${extras.join(", ")}`);
  }
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

function normalizeShellType(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)
  ) {
    throw new ClosureProtocolError("closure shell type must be a lowercase protocol token");
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

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeProtocolToken(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)
  ) {
    throw new ClosureProtocolError(`${label} must be a lowercase protocol token`);
  }
  return value;
}

function normalizeDisplayTitle(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw new ClosureProtocolError(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function normalizeMediaType(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(value)
  ) {
    throw new ClosureProtocolError("closure blob mediaType must be a lowercase media type");
  }
  return value;
}

function normalizeRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ClosureProtocolError(`${label} must be a non-empty string`);
  }
  if (
    value.startsWith("/")
    || value.includes("\\")
    || value.includes("\0")
    || value.split("/").some((component) => component.length === 0 || component === "." || component === "..")
  ) {
    throw new ClosureProtocolError(`${label} must be a safe relative POSIX path: ${value}`);
  }
  return value;
}

function normalizeInventoryPath(value: unknown): string {
  return normalizeRelativePath(value, "closure inventory path");
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
  const shellEntries = Object.entries(shell).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (shellEntries.length === 0) {
    throw new ClosureProtocolError("closure shell compatibility must declare at least one shell");
  }
  const normalizedShell = Object.fromEntries(shellEntries.map(([shellType, value]) => {
    const normalizedType = normalizeShellType(shellType);
    const shellCompatibility = requireRecord(
      value,
      `closure ${normalizedType} shell compatibility`,
    );
    const version = requireRecord(
      shellCompatibility.version,
      `closure ${normalizedType} shell compatibility version`,
    );
    return [normalizedType, {
      version: {
        min: normalizeVersion(
          version.min,
          `closure ${normalizedType} minimum shell version`,
        ),
      },
    }];
  }));
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
      shell: normalizedShell,
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
  const files = normalizeClosureComponentTreeFiles(inventory.files);
  if (!files.some((file) => file.path === CLOSURE_ARCHIVE_ENTRY_PATH)) {
    throw new ClosureProtocolError(`closure inventory must contain ${CLOSURE_ARCHIVE_ENTRY_PATH}`);
  }
  return { files, schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION };
}

function normalizeClosureComponentTreeFiles(value: unknown): ClosureComponentTreeFile[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ClosureProtocolError("closure component tree files must be a non-empty array");
  }
  const files = value.map((entry) => {
    const file = requireRecord(entry, "closure inventory file");
    requireKnownKeys(file, ["digest", "path", "size"], "closure inventory file");
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
  return files;
}

export function serializeClosureComponentTreeForDigest(value: unknown): string {
  return `${JSON.stringify(normalizeClosureComponentTreeFiles(value))}\n`;
}

export function createClosureComponentTreeDigest(
  value: unknown,
  digest: ClosureDistributionDigest,
): ClosureDigest {
  return normalizeDigest(digest(serializeClosureComponentTreeForDigest(value)));
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

function normalizeDistributionShellCompatibility(value: unknown): ClosureShellCompatibility {
  const compatibility = requireRecord(value, "closure distribution compatibility");
  requireKnownKeys(compatibility, ["shell"], "closure distribution compatibility");
  const shell = requireRecord(compatibility.shell, "closure distribution shell compatibility");
  const entries = Object.entries(shell).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (entries.length === 0) {
    throw new ClosureProtocolError("closure distribution shell compatibility must declare at least one shell");
  }
  return Object.fromEntries(entries.map(([shellType, rawCompatibility]) => {
    const normalizedType = normalizeShellType(shellType);
    const shellCompatibility = requireRecord(
      rawCompatibility,
      `closure distribution ${normalizedType} shell compatibility`,
    );
    requireKnownKeys(
      shellCompatibility,
      ["version"],
      `closure distribution ${normalizedType} shell compatibility`,
    );
    const version = requireRecord(
      shellCompatibility.version,
      `closure distribution ${normalizedType} shell compatibility version`,
    );
    requireKnownKeys(
      version,
      ["min"],
      `closure distribution ${normalizedType} shell compatibility version`,
    );
    return [normalizedType, {
      version: {
        min: normalizeVersion(
          version.min,
          `closure distribution ${normalizedType} minimum shell version`,
        ),
      },
    }];
  }));
}

function normalizeDistributionBlobs(value: unknown): Record<string, ClosureDistributionBlob> {
  const blobs = requireRecord(value, "closure distribution blobs");
  const entries = Object.entries(blobs).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (entries.length === 0) {
    throw new ClosureProtocolError("closure distribution must declare at least one blob");
  }
  return Object.fromEntries(entries.map(([key, rawBlob]) => {
    const digest = normalizeDigest(key);
    const blob = requireRecord(rawBlob, `closure distribution blob ${digest}`);
    requireKnownKeys(
      blob,
      ["digest", "mediaType", "size", "url"],
      `closure distribution blob ${digest}`,
    );
    if (normalizeDigest(blob.digest) !== digest) {
      throw new ClosureProtocolError(`closure distribution blob ${digest} must repeat its map digest`);
    }
    return [digest, {
      digest,
      mediaType: normalizeMediaType(blob.mediaType),
      size: normalizePositiveInteger(blob.size, `closure distribution blob ${digest} size`),
      url: normalizeHttpUrl(blob.url),
    }];
  }));
}

function normalizeDistributionComponent(
  value: unknown,
  label: string,
): ClosureDistributionComponent {
  const component = requireRecord(value, label);
  requireKnownKeys(component, ["blob", "treeDigest"], label);
  return {
    blob: normalizeDigest(component.blob),
    treeDigest: normalizeDigest(component.treeDigest),
  };
}

function normalizeDistributionEntrypointComponent(
  value: unknown,
  label: string,
): ClosureDistributionEntrypointComponent {
  const component = requireRecord(value, label);
  requireKnownKeys(component, ["blob", "entryPath", "treeDigest"], label);
  return {
    blob: normalizeDigest(component.blob),
    entryPath: normalizeRelativePath(component.entryPath, `${label} entry path`),
    treeDigest: normalizeDigest(component.treeDigest),
  };
}

function normalizeDistributionResources(value: unknown): ClosureDistributionResource[] {
  if (!Array.isArray(value)) {
    throw new ClosureProtocolError("closure distribution resources must be an array");
  }
  const resources = value.map((rawResource) => {
    const resource = requireRecord(rawResource, "closure distribution resource");
    requireKnownKeys(resource, ["blob", "id", "title", "treeDigest"], "closure distribution resource");
    return {
      blob: normalizeDigest(resource.blob),
      id: normalizeProtocolToken(resource.id, "closure distribution resource id"),
      title: normalizeDisplayTitle(resource.title, "closure distribution resource title"),
      treeDigest: normalizeDigest(resource.treeDigest),
    };
  }).sort((left, right) => compareCanonicalStrings(left.id, right.id));
  for (let index = 1; index < resources.length; index += 1) {
    if (resources[index - 1]?.id === resources[index]?.id) {
      throw new ClosureProtocolError("closure distribution resource ids must be unique");
    }
  }
  return resources;
}

function normalizeDistributionTargets(value: unknown): Record<string, ClosureDistributionTarget> {
  const targets = requireRecord(value, "closure distribution targets");
  const entries = Object.entries(targets).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (entries.length === 0) {
    throw new ClosureProtocolError("closure distribution must declare at least one target");
  }
  return Object.fromEntries(entries.map(([rawTarget, rawComponents]) => {
    const target = normalizePlatform(rawTarget);
    const components = requireRecord(rawComponents, `closure distribution target ${target}`);
    requireKnownKeys(
      components,
      ["native", "runtime"],
      `closure distribution target ${target}`,
    );
    return [target, {
      native: normalizeDistributionComponent(
        components.native,
        `closure distribution target ${target} native component`,
      ),
      runtime: normalizeDistributionEntrypointComponent(
        components.runtime,
        `closure distribution target ${target} runtime component`,
      ),
    }];
  }));
}

function normalizeClosureDistributionManifestDraft(value: unknown): ClosureDistributionManifestDraft {
  const manifest = requireRecord(value, "closure distribution manifest");
  requireKnownKeys(
    manifest,
    ["blobs", "compatibility", "identity", "required", "resources", "schemaVersion"],
    "closure distribution manifest",
  );
  if (manifest.schemaVersion !== CLOSURE_DISTRIBUTION_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure distribution schema version: ${String(manifest.schemaVersion)}`,
    );
  }
  if (Object.hasOwn(manifest, "namespace")) {
    throw new ClosureProtocolError("closure distribution manifest must not contain a local namespace");
  }
  const identity = requireRecord(manifest.identity, "closure distribution identity");
  requireKnownKeys(
    identity,
    ["channel", "digest", "protocolVersion", "version"],
    "closure distribution identity",
  );
  if (Object.hasOwn(identity, "namespace") || Object.hasOwn(identity, "platform")) {
    throw new ClosureProtocolError(
      "closure distribution identity must remain namespace-neutral and target-neutral",
    );
  }
  const required = requireRecord(manifest.required, "closure distribution required components");
  requireKnownKeys(
    required,
    ["body", "launcher", "targets"],
    "closure distribution required components",
  );
  const body = normalizeDistributionEntrypointComponent(
    required.body,
    "closure distribution body component",
  );
  if (body.entryPath !== CLOSURE_ARCHIVE_ENTRY_PATH) {
    throw new ClosureProtocolError(
      `closure distribution body entry path must be ${CLOSURE_ARCHIVE_ENTRY_PATH}`,
    );
  }
  const launcher = normalizeDistributionEntrypointComponent(
    required.launcher,
    "closure distribution launcher component",
  );
  if (launcher.entryPath !== CLOSURE_LAUNCHER_ENTRY_PATH) {
    throw new ClosureProtocolError(
      `closure distribution launcher entry path must be ${CLOSURE_LAUNCHER_ENTRY_PATH}`,
    );
  }
  const normalized: ClosureDistributionManifestDraft = {
    blobs: normalizeDistributionBlobs(manifest.blobs),
    compatibility: {
      shell: normalizeDistributionShellCompatibility(manifest.compatibility),
    },
    identity: {
      channel: normalizeChannel(identity.channel),
      protocolVersion: normalizeProtocolVersion(identity.protocolVersion),
      version: normalizeVersion(identity.version, "closure distribution version"),
    },
    required: {
      body,
      launcher,
      targets: normalizeDistributionTargets(required.targets),
    },
    resources: normalizeDistributionResources(manifest.resources),
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  };

  const referenced = new Set<ClosureDigest>([
    normalized.required.body.blob,
    normalized.required.launcher.blob,
    ...normalized.resources.map((resource) => resource.blob),
    ...Object.values(normalized.required.targets).flatMap((target) => [
      target.native.blob,
      target.runtime.blob,
    ]),
  ]);
  for (const digest of referenced) {
    if (normalized.blobs[digest] == null) {
      throw new ClosureProtocolError(`closure distribution component references unknown blob ${digest}`);
    }
  }
  for (const digest of Object.keys(normalized.blobs)) {
    if (!referenced.has(digest as ClosureDigest)) {
      throw new ClosureProtocolError(`closure distribution contains unused blob ${digest}`);
    }
  }
  return normalized;
}

function computeClosureDistributionDigest(
  draft: ClosureDistributionManifestDraft,
  digest: ClosureDistributionDigest,
): ClosureDigest {
  return normalizeDigest(digest(`${JSON.stringify(draft)}\n`));
}

export function serializeClosureDistributionManifestForDigest(value: unknown): string {
  return `${JSON.stringify(normalizeClosureDistributionManifestDraft(value))}\n`;
}

export function createClosureDistributionManifest(
  value: unknown,
  digest: ClosureDistributionDigest,
): ClosureDistributionManifest {
  const draft = normalizeClosureDistributionManifestDraft(value);
  return {
    ...draft,
    identity: {
      ...draft.identity,
      digest: computeClosureDistributionDigest(draft, digest),
    },
  };
}

export function validateClosureDistributionManifest(
  value: unknown,
  digest: ClosureDistributionDigest,
): ClosureDistributionManifest {
  const manifest = requireRecord(value, "closure distribution manifest");
  const rawIdentity = requireRecord(manifest.identity, "closure distribution identity");
  const actualDigest = normalizeDigest(rawIdentity.digest);
  const draft = normalizeClosureDistributionManifestDraft(manifest);
  const expectedDigest = computeClosureDistributionDigest(draft, digest);
  if (actualDigest !== expectedDigest) {
    throw new ClosureProtocolError(
      `closure distribution canonical digest ${actualDigest} does not match ${expectedDigest}`,
    );
  }
  return {
    ...draft,
    identity: {
      ...draft.identity,
      digest: actualDigest,
    },
  };
}

export function resolveClosureDistributionTarget(
  manifest: ClosureDistributionManifest,
  value: string,
): ResolvedClosureDistributionTarget {
  const target = normalizePlatform(value);
  const targetComponents = manifest.required.targets[target];
  if (targetComponents == null) {
    throw new ClosureProtocolError(`closure distribution does not contain target ${target}`);
  }
  const required = {
    body: manifest.required.body,
    launcher: manifest.required.launcher,
    native: targetComponents.native,
    runtime: targetComponents.runtime,
  };
  const requiredDigests = new Set<ClosureDigest>([
    required.body.blob,
    required.launcher.blob,
    required.native.blob,
    required.runtime.blob,
  ]);
  return {
    required,
    requiredBlobs: [...requiredDigests]
      .sort()
      .map((blobDigest) => {
        const blob = manifest.blobs[blobDigest];
        if (blob == null) {
          throw new ClosureProtocolError(`closure distribution target references unknown blob ${blobDigest}`);
        }
        return blob;
      }),
    resources: manifest.resources.map((resource) => {
      const artifact = manifest.blobs[resource.blob];
      if (artifact == null) {
        throw new ClosureProtocolError(
          `closure distribution resource references unknown blob ${resource.blob}`,
        );
      }
      return { ...resource, artifact };
    }),
    target,
  };
}
