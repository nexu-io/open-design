import { createHash, sign, verify, type KeyLike } from "node:crypto";

export const STANDALONE_METADATA_SCHEMA = 2 as const;
export const STANDALONE_CHANNEL_HEAD_SCHEMA = 1 as const;
export const STANDALONE_SIGNATURE_ALGORITHM = "Ed25519" as const;
export const EXACT_CHANNEL_PATTERN = /^[a-z0-9]{1,12}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type ComponentMode = "required" | "lazy";
export type ArtifactReference = { sha256: string; size: number; url: string };
export type StandaloneComponent = {
  name: string;
  mode: ComponentMode;
  artifact: ArtifactReference & { entrypoint: string };
};
export type StandaloneShellRequirement = { type: string; minVersion: string };
export type StandaloneShellIdentity = { type: string; version: string; digest: string };
export type StandaloneMetadata = {
  schemaVersion: typeof STANDALONE_METADATA_SCHEMA;
  channel: string;
  releaseVersion: string;
  standaloneVersion: string;
  sourceCommit: string;
  publishedAt: string;
  components: StandaloneComponent[];
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
  constructor(readonly code: "installer-required" | "no-generation" | "runtime-unavailable", message: string) {
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

function validateVersion(value: string, label: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`invalid ${label}: ${value}`);
}

function validateDigest(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) throw new Error(`invalid digest for ${label}`);
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
  validateDigest(identity.digest, `${identity.type} Shell`);
}

export function compareVersions(left: string, right: string): number {
  validateVersion(left, "version");
  validateVersion(right, "version");
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < a.length; index += 1) {
    if (!Number.isSafeInteger(a[index]) || !Number.isSafeInteger(b[index])) throw new Error("version segment exceeds safe integer range");
    if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  }
  return 0;
}

export function minimumShellVersion(metadata: StandaloneMetadata, shellType: string): string | null {
  return metadata.shellRequirements.find(({ type }) => type === shellType)?.minVersion ?? null;
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
  if (metadata.components.length === 0) throw new Error("metadata must contain at least one component");
  const names = new Set<string>();
  for (const component of metadata.components) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(component.name) || names.has(component.name)) throw new Error(`invalid or duplicate component: ${component.name}`);
    names.add(component.name);
    validateArtifact(component.artifact, component.name, true);
    if (component.artifact.entrypoint.startsWith("/") || component.artifact.entrypoint.split(/[\\/]/).includes("..")) throw new Error(`unsafe entrypoint for ${component.name}`);
  }
  if (metadata.shellRequirements.length === 0) throw new Error("metadata must declare at least one Shell requirement");
  const shellTypes = new Set<string>();
  for (const requirement of metadata.shellRequirements) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(requirement.type) || shellTypes.has(requirement.type)) throw new Error(`invalid or duplicate Shell requirement: ${requirement.type}`);
    shellTypes.add(requirement.type);
    validateVersion(requirement.minVersion, `${requirement.type} min Shell version`);
  }
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

export function verifyStandaloneChannelHead(envelope: SignedStandaloneChannelHead, ring: StandaloneTrustedKeyRing): string {
  validateStandaloneChannelHead(envelope.head);
  return verifyValue(envelope.head, envelope.signatures, ring);
}
