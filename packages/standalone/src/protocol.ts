import { createHash, sign, verify, type KeyLike } from "node:crypto";

export const STANDALONE_METADATA_SCHEMA = 4 as const;
export const STANDALONE_SHELL_METADATA_SCHEMA = 1 as const;
export const STANDALONE_CHANNEL_HEAD_SCHEMA = 1 as const;
export const STANDALONE_SIGNATURE_ALGORITHM = "Ed25519" as const;
export const EXACT_CHANNEL_PATTERN = /^[a-z0-9]{1,12}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type StandaloneScope = Readonly<{ channel: string; namespace: string }>;

export type ArtifactReference = { sha256: string; size: number; url: string };
export type StandaloneBlobSource = Readonly<{ kind: "remote"; url: string }>;
export type StandaloneBlob = Readonly<{
  sha256: string;
  size: number;
  mediaType: string;
  sources: readonly StandaloneBlobSource[];
}>;
export type StandaloneMaterialization =
  | Readonly<{ type: "file"; entrypoint: string }>
  | Readonly<{ type: "zip"; entrypoint: string; treeSha256: string }>;
export type StandaloneResource = Readonly<{
  id: string;
  component: "standalone.launcher" | "standalone.resource";
  blob: string;
  sync: true;
  materialization: StandaloneMaterialization;
}>;
export type StandaloneResourceContribution = Readonly<{
  id: string;
  component: "standalone.launcher" | "standalone.resource";
  sync: true;
  blob: StandaloneBlob;
  materialization: StandaloneMaterialization;
}>;
export type StandaloneShellCompatibilityIdentity = { type: string; version: string; buildHash: string };
export type StandaloneShellRequirement = { type: string; minVersion: string; buildHash: string };
export type StandaloneShellIdentity = StandaloneShellCompatibilityIdentity & { digest: string };
export type StandaloneMetadata = {
  schemaVersion: typeof STANDALONE_METADATA_SCHEMA;
  channel: string;
  releaseVersion: string;
  standaloneVersion: string;
  sourceCommit: string;
  publishedAt: string;
  blobs: Record<string, StandaloneBlob>;
  resources: StandaloneResource[];
  shellRequirements: StandaloneShellRequirement[];
};
export type StandaloneSignature = {
  algorithm: typeof STANDALONE_SIGNATURE_ALGORITHM;
  keyId: string;
  value: string;
};
export type SignedStandaloneMetadata = { metadata: StandaloneMetadata; signatures: StandaloneSignature[] };
export type SignedDocument<T> = { document: T; signatures: StandaloneSignature[] };
export type StandaloneLaneReference = ArtifactReference & { releaseVersion: string };
export type StandaloneShellDistribution = Readonly<{
  shell: Readonly<{ type: string; version: string; buildHash: string }>;
  target: string;
  artifact: ArtifactReference & Readonly<{ mediaType: string }>;
  updater?: Readonly<{
    protocol: "standalone-shell-updater-v3";
    handler: string;
    interaction: "restart-and-install";
  }>;
}>;
export type StandaloneShellMetadata = Readonly<{
  schemaVersion: typeof STANDALONE_SHELL_METADATA_SCHEMA;
  channel: string;
  releaseVersion: string;
  sourceCommit: string;
  publishedAt: string;
  distributions: readonly StandaloneShellDistribution[];
}>;
export type SignedStandaloneShellMetadata = Readonly<{ document: StandaloneShellMetadata; signatures: readonly StandaloneSignature[] }>;
export type StandaloneChannelHead = {
  schemaVersion: typeof STANDALONE_CHANNEL_HEAD_SCHEMA;
  channel: string;
  publishedAt: string;
  lanes: Record<string, StandaloneLaneReference>;
};
export type SignedStandaloneChannelHead = { head: StandaloneChannelHead; signatures: StandaloneSignature[] };
export type StandaloneSigner = { keyId: string; privateKey: KeyLike };
export type StandaloneTrustedKeyRing = ReadonlyMap<string, KeyLike> | Readonly<Record<string, KeyLike>>;

export class StandaloneBootstrapError extends Error {
  constructor(readonly code: "installer-required" | "no-generation" | "runtime-unavailable" | "shell-update-required", message: string) {
    super(message);
    this.name = "StandaloneBootstrapError";
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonicalValue(input[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value))}\n`;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function validateChannelRelease(channel: string, releaseVersion: string): void {
  if (!EXACT_CHANNEL_PATTERN.test(channel) || channel === "local") throw new Error(`invalid exact channel: ${channel}`);
  if (!new RegExp(`^\\d+\\.\\d+\\.\\d+-${channel}\\.\\d+$`).test(releaseVersion)) {
    throw new Error(`releaseVersion does not belong to ${channel}`);
  }
}

export function validateStandaloneScope(scope: StandaloneScope): StandaloneScope {
  if (!EXACT_CHANNEL_PATTERN.test(scope.channel) || scope.channel === "local") throw new Error(`invalid exact channel binding: ${scope.channel}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(scope.namespace)) throw new Error(`invalid standalone namespace: ${scope.namespace}`);
  return { channel: scope.channel, namespace: scope.namespace };
}

export function standaloneScopeKey(scope: StandaloneScope): string {
  const valid = validateStandaloneScope(scope);
  return `${valid.channel}/${valid.namespace}`;
}

function validateVersion(value: string, label: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/.test(value)) throw new Error(`invalid ${label}: ${value}`);
}

function validateDigest(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) throw new Error(`invalid digest for ${label}`);
}

function validateToken(value: string, label: string): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new Error(`invalid ${label}: ${value}`);
}

function validateRelativePath(value: string, label: string): void {
  if (value.length === 0 || value.startsWith("/") || value.startsWith("\\") || value.split(/[\\/]/).includes("..")) {
    throw new Error(`unsafe ${label}: ${value}`);
  }
}

function validateArtifact(artifact: ArtifactReference, label: string, allowFile = false): void {
  validateDigest(artifact.sha256, label);
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) throw new Error(`invalid size for ${label}`);
  const pattern = allowFile ? /^(https?:|file:)\/\// : /^https?:\/\//;
  if (!pattern.test(artifact.url)) throw new Error(`invalid URL for ${label}`);
}

export function validateShellIdentity(identity: StandaloneShellIdentity): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(identity.type)) throw new Error(`invalid Shell type: ${identity.type}`);
  validateVersion(identity.version, `${identity.type} Shell version`);
  validateDigest(identity.buildHash, `${identity.type} Shell build hash`);
  validateDigest(identity.digest, `${identity.type} Shell`);
}

export function compareVersions(left: string, right: string): number {
  validateVersion(left, "version");
  validateVersion(right, "version");
  const split = (value: string) => {
    const [core, prerelease] = value.split("-", 2);
    return { core: core!.split(".").map(Number), prerelease: prerelease?.split(".") ?? null };
  };
  const a = split(left);
  const b = split(right);
  for (let index = 0; index < a.core.length; index += 1) {
    if (!Number.isSafeInteger(a.core[index]) || !Number.isSafeInteger(b.core[index])) throw new Error("version segment exceeds safe integer range");
    if (a.core[index] !== b.core[index]) return a.core[index]! < b.core[index]! ? -1 : 1;
  }
  if (a.prerelease == null || b.prerelease == null) return a.prerelease == null ? (b.prerelease == null ? 0 : 1) : -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart == null || rightPart == null) return leftPart == null ? -1 : 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber != null && rightNumber != null) return leftNumber < rightNumber ? -1 : 1;
    if (leftNumber != null || rightNumber != null) return leftNumber != null ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function minimumShellVersion(metadata: StandaloneMetadata, shellType: string): string | null {
  return metadata.shellRequirements.find(({ type }) => type === shellType)?.minVersion ?? null;
}

/**
 * Preserve the first compatible Shell floor while its declared build remains
 * identical. Missing or unreadable history fails conservatively to the current
 * Shell version.
 */
export function deriveMinimumShellVersion(input: Readonly<{
  buildHash: string;
  currentVersion: string;
  previous?: Readonly<{ buildHash: string; minVersion: string }> | null;
}>): string {
  validateDigest(input.buildHash, "Shell build hash");
  validateVersion(input.currentVersion, "current Shell version");
  if (input.previous == null || input.previous.buildHash !== input.buildHash) return input.currentVersion;
  try {
    validateDigest(input.previous.buildHash, "previous Shell build hash");
    validateVersion(input.previous.minVersion, "previous minimum Shell version");
    return compareVersions(input.previous.minVersion, input.currentVersion) <= 0 ? input.previous.minVersion : input.currentVersion;
  } catch {
    return input.currentVersion;
  }
}

export function assertShellCompatibility(metadata: StandaloneMetadata, shell: StandaloneShellIdentity): void {
  validateShellIdentity(shell);
  const minimum = minimumShellVersion(metadata, shell.type);
  if (minimum == null || compareVersions(shell.version, minimum) < 0) {
    throw new StandaloneBootstrapError(
      "installer-required",
      minimum == null
        ? `release ${metadata.releaseVersion} does not support Shell ${shell.type}`
        : `Shell ${shell.type} ${shell.version} is below required ${minimum}`,
    );
  }
}

export function validateStandaloneMetadata(metadata: StandaloneMetadata): void {
  if (metadata.schemaVersion !== STANDALONE_METADATA_SCHEMA) throw new Error("unsupported standalone metadata schema");
  validateChannelRelease(metadata.channel, metadata.releaseVersion);
  validateVersion(metadata.standaloneVersion, "standaloneVersion");
  if (!/^[a-f0-9]{40}$/.test(metadata.sourceCommit)) throw new Error("sourceCommit must be a full 40-character SHA");
  if (!Number.isFinite(Date.parse(metadata.publishedAt))) throw new Error("invalid publishedAt");
  const blobEntries = Object.entries(metadata.blobs);
  if (blobEntries.length === 0) throw new Error("metadata must declare at least one blob");
  for (const [key, blob] of blobEntries) {
    validateDigest(key, "blob key");
    validateDigest(blob.sha256, "blob");
    if (key !== blob.sha256) throw new Error(`blob catalog key does not match descriptor: ${key}`);
    if (!Number.isSafeInteger(blob.size) || blob.size < 0) throw new Error(`invalid blob size: ${key}`);
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(blob.mediaType)) throw new Error(`invalid blob media type: ${blob.mediaType}`);
    if (blob.sources.length === 0) throw new Error(`blob has no source: ${key}`);
    for (const source of blob.sources) {
      if (source.kind !== "remote" || !/^https?:\/\//.test(source.url)) throw new Error(`invalid blob source: ${key}`);
    }
  }
  if (metadata.resources.length === 0) throw new Error("metadata must declare at least one resource");
  const resourceIds = new Set<string>();
  let launcherCount = 0;
  const referenced = new Set<string>();
  for (const resource of metadata.resources) {
    validateToken(resource.id, "resource id");
    if (resourceIds.has(resource.id)) throw new Error(`duplicate resource: ${resource.id}`);
    resourceIds.add(resource.id);
    if (resource.component === "standalone.launcher") launcherCount += 1;
    else if (resource.component !== "standalone.resource") throw new Error(`unsupported standalone component: ${resource.id}`);
    validateDigest(resource.blob, `${resource.id} blob`);
    if (metadata.blobs[resource.blob] == null) throw new Error(`resource references unknown blob: ${resource.id}`);
    referenced.add(resource.blob);
    if (resource.sync !== true) throw new Error(`resource must explicitly declare sync: ${resource.id}`);
    validateRelativePath(resource.materialization.entrypoint, `${resource.id} entrypoint`);
    if (resource.materialization.type === "zip") validateDigest(resource.materialization.treeSha256, `${resource.id} tree`);
    else if (resource.materialization.type !== "file") throw new Error(`unsupported materialization: ${resource.id}`);
  }
  if (launcherCount !== 1) throw new Error("metadata must declare exactly one standalone.launcher component");
  for (const digest of Object.keys(metadata.blobs)) {
    if (!referenced.has(digest)) throw new Error(`metadata contains unused blob: ${digest}`);
  }
  if (metadata.shellRequirements.length === 0) throw new Error("metadata must declare at least one Shell requirement");
  const shellTypes = new Set<string>();
  for (const requirement of metadata.shellRequirements) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(requirement.type) || shellTypes.has(requirement.type)) throw new Error(`invalid or duplicate Shell requirement: ${requirement.type}`);
    shellTypes.add(requirement.type);
    validateVersion(requirement.minVersion, `${requirement.type} min Shell version`);
    validateDigest(requirement.buildHash, `${requirement.type} Shell build hash`);
  }
}

/** Merge app/target contributions into the canonical channel blob graph. */
export function mergeStandaloneResourceContributions(
  contributions: readonly StandaloneResourceContribution[],
): Readonly<{ blobs: Record<string, StandaloneBlob>; resources: readonly StandaloneResource[] }> {
  const blobs: Record<string, StandaloneBlob> = {};
  const resources: StandaloneResource[] = [];
  const ids = new Set<string>();
  for (const contribution of [...contributions].sort((left, right) => left.id.localeCompare(right.id))) {
    validateToken(contribution.id, "resource contribution id");
    if (ids.has(contribution.id)) throw new Error(`duplicate resource contribution: ${contribution.id}`);
    ids.add(contribution.id);
    const current = blobs[contribution.blob.sha256];
    if (current != null && canonicalJson(current) !== canonicalJson(contribution.blob)) {
      throw new Error(`conflicting blob contribution: ${contribution.blob.sha256}`);
    }
    blobs[contribution.blob.sha256] = contribution.blob;
    resources.push({ id: contribution.id, component: contribution.component, blob: contribution.blob.sha256, sync: true, materialization: contribution.materialization });
  }
  if (resources.length === 0) throw new Error("at least one resource contribution is required");
  return Object.freeze({ blobs, resources: Object.freeze(resources) });
}

export function validateStandaloneChannelHead(head: StandaloneChannelHead): void {
  if (head.schemaVersion !== STANDALONE_CHANNEL_HEAD_SCHEMA) throw new Error("unsupported standalone channel head schema");
  if (!EXACT_CHANNEL_PATTERN.test(head.channel) || head.channel === "local") throw new Error(`invalid exact channel: ${head.channel}`);
  if (!Number.isFinite(Date.parse(head.publishedAt))) throw new Error("invalid channel head publishedAt");
  const lanes = Object.entries(head.lanes);
  if (lanes.length === 0) throw new Error("channel head must contain at least one lane");
  for (const [name, lane] of lanes) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new Error(`invalid channel lane: ${name}`);
    validateChannelRelease(head.channel, lane.releaseVersion);
    validateArtifact(lane, `${name} lane`);
  }
}

export function validateStandaloneShellMetadata(metadata: StandaloneShellMetadata): void {
  if (metadata.schemaVersion !== STANDALONE_SHELL_METADATA_SCHEMA) throw new Error("unsupported standalone Shell metadata schema");
  validateChannelRelease(metadata.channel, metadata.releaseVersion);
  if (!/^[a-f0-9]{40}$/.test(metadata.sourceCommit)) throw new Error("Shell metadata sourceCommit must be a full 40-character SHA");
  if (!Number.isFinite(Date.parse(metadata.publishedAt))) throw new Error("invalid Shell metadata publishedAt");
  if (metadata.distributions.length === 0) throw new Error("Shell metadata must declare at least one distribution");
  const identities = new Set<string>();
  for (const distribution of metadata.distributions) {
    validateToken(distribution.shell.type, "Shell distribution type");
    validateVersion(distribution.shell.version, `${distribution.shell.type} distribution version`);
    validateDigest(distribution.shell.buildHash, `${distribution.shell.type} distribution build hash`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(distribution.target)) throw new Error(`invalid Shell distribution target: ${distribution.target}`);
    const identity = `${distribution.shell.type}/${distribution.target}`;
    if (identities.has(identity)) throw new Error(`duplicate Shell distribution: ${identity}`);
    identities.add(identity);
    validateArtifact(distribution.artifact, `${identity} distribution`);
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(distribution.artifact.mediaType)) throw new Error(`invalid Shell distribution media type: ${identity}`);
    if (distribution.updater != null) {
      if (distribution.updater.protocol !== "standalone-shell-updater-v3" || distribution.updater.interaction !== "restart-and-install") {
        throw new Error(`unsupported Shell updater contract: ${identity}`);
      }
      validateToken(distribution.updater.handler, `${identity} updater handler`);
    }
  }
}

function signValue(value: unknown, signers: readonly StandaloneSigner[]): StandaloneSignature[] {
  if (signers.length === 0) throw new Error("at least one standalone signer is required");
  const keyIds = new Set<string>();
  return signers.map(({ keyId, privateKey }) => {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(keyId) || keyIds.has(keyId)) throw new Error(`invalid or duplicate signing key: ${keyId}`);
    keyIds.add(keyId);
    return { algorithm: STANDALONE_SIGNATURE_ALGORITHM, keyId, value: sign(null, Buffer.from(canonicalJson(value)), privateKey).toString("base64") };
  });
}

function trustedKey(ring: StandaloneTrustedKeyRing, keyId: string): KeyLike | undefined {
  return ring instanceof Map ? ring.get(keyId) : (ring as Readonly<Record<string, KeyLike>>)[keyId];
}

function verifyValue(value: unknown, signatures: readonly StandaloneSignature[], ring: StandaloneTrustedKeyRing): string {
  if (signatures.length === 0) throw new Error("signed standalone document has no signatures");
  const payload = Buffer.from(canonicalJson(value));
  const seen = new Set<string>();
  for (const signature of signatures) {
    if (signature.algorithm !== STANDALONE_SIGNATURE_ALGORITHM || seen.has(signature.keyId)) continue;
    seen.add(signature.keyId);
    const key = trustedKey(ring, signature.keyId);
    if (key !== undefined && verify(null, payload, key, Buffer.from(signature.value, "base64"))) return signature.keyId;
  }
  throw new Error("standalone signature verification failed for trusted key ring");
}

export function signStandaloneMetadata(metadata: StandaloneMetadata, signers: readonly StandaloneSigner[]): SignedStandaloneMetadata;
export function signStandaloneMetadata(metadata: StandaloneMetadata, keyId: string, privateKey: KeyLike): SignedStandaloneMetadata;
export function signStandaloneMetadata(metadata: StandaloneMetadata, signersOrKeyId: readonly StandaloneSigner[] | string, privateKey?: KeyLike): SignedStandaloneMetadata {
  validateStandaloneMetadata(metadata);
  const signers = typeof signersOrKeyId === "string" ? [{ keyId: signersOrKeyId, privateKey: privateKey! }] : signersOrKeyId;
  return { metadata, signatures: signValue(metadata, signers) };
}

export function verifyStandaloneMetadata(envelope: SignedStandaloneMetadata, ring: StandaloneTrustedKeyRing): string {
  validateStandaloneMetadata(envelope.metadata);
  return verifyValue(envelope.metadata, envelope.signatures, ring);
}

export function signDocument<T>(document: T, signers: readonly StandaloneSigner[]): SignedDocument<T> {
  return { document, signatures: signValue(document, signers) };
}

export function verifyDocument<T>(envelope: SignedDocument<T>, ring: StandaloneTrustedKeyRing): string {
  return verifyValue(envelope.document, envelope.signatures, ring);
}

export function signStandaloneChannelHead(head: StandaloneChannelHead, signers: readonly StandaloneSigner[]): SignedStandaloneChannelHead {
  validateStandaloneChannelHead(head);
  return { head, signatures: signValue(head, signers) };
}

export function signStandaloneShellMetadata(metadata: StandaloneShellMetadata, signers: readonly StandaloneSigner[]): SignedStandaloneShellMetadata {
  validateStandaloneShellMetadata(metadata);
  return { document: metadata, signatures: signValue(metadata, signers) };
}

export function verifyStandaloneShellMetadata(envelope: SignedStandaloneShellMetadata, ring: StandaloneTrustedKeyRing): string {
  validateStandaloneShellMetadata(envelope.document);
  return verifyValue(envelope.document, envelope.signatures, ring);
}

export function verifyStandaloneChannelHead(envelope: SignedStandaloneChannelHead, ring: StandaloneTrustedKeyRing): string {
  validateStandaloneChannelHead(envelope.head);
  return verifyValue(envelope.head, envelope.signatures, ring);
}
