import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  verifyStandaloneMetadata,
  type SignedStandaloneMetadata,
  type StandaloneBlobCandidate,
} from "@open-design/standalone";

export const ELECTRON_STANDALONE_INSTALLATION_SCHEMA_VERSION = 1 as const;
export const ELECTRON_STANDALONE_TRUST_SCHEMA_VERSION = 1 as const;
export const ELECTRON_STANDALONE_INSTALLATION_FILE = "standalone-installation.json";

export type ElectronStandaloneTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";

type InstalledFile = Readonly<{
  file: string;
  sha256: string;
  size: number;
}>;

export type ElectronStandaloneInstallation = Readonly<{
  schemaVersion: typeof ELECTRON_STANDALONE_INSTALLATION_SCHEMA_VERSION;
  channel: string;
  releaseVersion: string;
  target: ElectronStandaloneTarget;
  host: InstalledFile;
  supervisor: InstalledFile;
  content: InstalledFile;
  trust: InstalledFile;
  seeds: readonly Readonly<InstalledFile & { blobSha256: string }>[];
}>;

export type ResolvedElectronStandaloneInstallation = Readonly<{
  declaration: ElectronStandaloneInstallation;
  envelope: SignedStandaloneMetadata;
  trustedKeys: ReadonlyMap<string, KeyObject>;
  hostPath: string;
  candidates: Readonly<Record<string, readonly StandaloneBlobCandidate[]>>;
}>;

const digestPattern = /^[a-f0-9]{64}$/u;
const keyIdPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const safeFlatFilePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const supportedTargets = new Set<ElectronStandaloneTarget>(["darwin-arm64", "darwin-x64", "win32-x64"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields must be exactly ${wanted.join(",")}`);
  }
}

function installedFile(value: unknown, label: string): InstalledFile {
  const candidate = record(value, label);
  exactKeys(candidate, ["file", "sha256", "size"], label);
  if (typeof candidate.file !== "string" || !safeFlatFilePattern.test(candidate.file)) throw new Error(`${label} has an unsafe file name`);
  if (typeof candidate.sha256 !== "string" || !digestPattern.test(candidate.sha256)) throw new Error(`${label} has an invalid digest`);
  if (!Number.isSafeInteger(candidate.size) || (candidate.size as number) < 0) throw new Error(`${label} has an invalid size`);
  return Object.freeze({ file: candidate.file, sha256: candidate.sha256, size: candidate.size as number });
}

export function validateElectronStandaloneInstallation(value: unknown): ElectronStandaloneInstallation {
  const candidate = record(value, "Electron Standalone installation");
  exactKeys(candidate, ["channel", "content", "host", "releaseVersion", "schemaVersion", "seeds", "supervisor", "target", "trust"], "Electron Standalone installation");
  if (candidate.schemaVersion !== ELECTRON_STANDALONE_INSTALLATION_SCHEMA_VERSION) throw new Error("unsupported Electron Standalone installation schema");
  if (typeof candidate.channel !== "string") throw new Error("Electron Standalone installation channel must be a string");
  if (typeof candidate.releaseVersion !== "string") throw new Error("Electron Standalone installation releaseVersion must be a string");
  if (typeof candidate.target !== "string" || !supportedTargets.has(candidate.target as ElectronStandaloneTarget)) {
    throw new Error("Electron Standalone installation has an unsupported target");
  }
  if (!Array.isArray(candidate.seeds) || candidate.seeds.length === 0) throw new Error("Electron Standalone installation must contain offline seeds");
  const files = new Set<string>();
  const reserve = <T extends InstalledFile>(file: T, label: string): T => {
    if (files.has(file.file)) throw new Error(`${label} reuses installed file ${file.file}`);
    files.add(file.file);
    return file;
  };
  const host = reserve(installedFile(candidate.host, "Electron Standalone host"), "Electron Standalone host");
  const supervisor = reserve(installedFile(candidate.supervisor, "Electron Standalone supervisor"), "Electron Standalone supervisor");
  if (supervisor.file !== "supervisor.mjs") throw new Error("Electron Standalone supervisor must retain Sidecar's fixed module name");
  const content = reserve(installedFile(candidate.content, "Electron Standalone content"), "Electron Standalone content");
  const trust = reserve(installedFile(candidate.trust, "Electron Standalone trust"), "Electron Standalone trust");
  const blobDigests = new Set<string>();
  const seeds = candidate.seeds.map((value, index) => {
    const seed = record(value, `Electron Standalone seed ${index}`);
    exactKeys(seed, ["blobSha256", "file", "sha256", "size"], `Electron Standalone seed ${index}`);
    const file = installedFile({ file: seed.file, sha256: seed.sha256, size: seed.size }, `Electron Standalone seed ${index}`);
    if (typeof seed.blobSha256 !== "string" || !digestPattern.test(seed.blobSha256) || blobDigests.has(seed.blobSha256)) {
      throw new Error(`Electron Standalone seed ${index} has an invalid or duplicate blob digest`);
    }
    reserve(file, `Electron Standalone seed ${index}`);
    blobDigests.add(seed.blobSha256);
    return Object.freeze({ ...file, blobSha256: seed.blobSha256 });
  });
  return Object.freeze({
    schemaVersion: ELECTRON_STANDALONE_INSTALLATION_SCHEMA_VERSION,
    channel: candidate.channel,
    releaseVersion: candidate.releaseVersion,
    target: candidate.target as ElectronStandaloneTarget,
    host,
    supervisor,
    content,
    trust,
    seeds: Object.freeze(seeds),
  });
}

async function regularInstalledBytes(path: string, label: string): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular installed file`);
  return await readFile(path);
}

async function verifiedInstalledBytes(resourceRoot: string, descriptor: InstalledFile, label: string): Promise<Buffer> {
  const bytes = await regularInstalledBytes(join(resourceRoot, descriptor.file), label);
  if (bytes.byteLength !== descriptor.size) throw new Error(`${label} size does not match its installation descriptor`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== descriptor.sha256) throw new Error(`${label} digest does not match its installation descriptor`);
  return bytes;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch (error) { throw new Error(`${label} is not valid JSON`, { cause: error }); }
}

function parseTrust(bytes: Uint8Array): ReadonlyMap<string, KeyObject> {
  const trust = record(parseJson(bytes, "Electron Standalone trust"), "Electron Standalone trust");
  exactKeys(trust, ["keys", "schemaVersion"], "Electron Standalone trust");
  if (trust.schemaVersion !== ELECTRON_STANDALONE_TRUST_SCHEMA_VERSION) throw new Error("unsupported Electron Standalone trust schema");
  if (!Array.isArray(trust.keys) || trust.keys.length === 0) throw new Error("Electron Standalone trust must contain at least one key");
  const keys = new Map<string, KeyObject>();
  trust.keys.forEach((value, index) => {
    const key = record(value, `Electron Standalone trust key ${index}`);
    exactKeys(key, ["keyId", "publicKey"], `Electron Standalone trust key ${index}`);
    if (typeof key.keyId !== "string" || !keyIdPattern.test(key.keyId) || keys.has(key.keyId)) {
      throw new Error(`Electron Standalone trust key ${index} has an invalid or duplicate keyId`);
    }
    if (typeof key.publicKey !== "string") throw new Error(`Electron Standalone trust key ${index} has an invalid publicKey`);
    const publicKey = createPublicKey(key.publicKey);
    if (publicKey.asymmetricKeyType !== "ed25519") throw new Error(`Electron Standalone trust key ${key.keyId} is not Ed25519`);
    keys.set(key.keyId, publicKey);
  });
  return keys;
}

export async function loadElectronStandaloneInstallation(input: Readonly<{
  resourceRoot: string;
  channel: string;
  target: ElectronStandaloneTarget;
}>): Promise<ResolvedElectronStandaloneInstallation> {
  const manifestBytes = await regularInstalledBytes(
    join(input.resourceRoot, ELECTRON_STANDALONE_INSTALLATION_FILE),
    "Electron Standalone installation",
  );
  const declaration = validateElectronStandaloneInstallation(parseJson(manifestBytes, "Electron Standalone installation"));
  if (declaration.channel !== input.channel) throw new Error("Electron Standalone installation escaped its exact channel");
  if (declaration.target !== input.target) throw new Error("Electron Standalone installation target does not match this Shell");

  const [hostBytes, supervisorBytes, contentBytes, trustBytes, seedBytes] = await Promise.all([
    verifiedInstalledBytes(input.resourceRoot, declaration.host, "Electron Standalone host"),
    verifiedInstalledBytes(input.resourceRoot, declaration.supervisor, "Electron Standalone supervisor"),
    verifiedInstalledBytes(input.resourceRoot, declaration.content, "Electron Standalone content"),
    verifiedInstalledBytes(input.resourceRoot, declaration.trust, "Electron Standalone trust"),
    Promise.all(declaration.seeds.map((seed, index) => verifiedInstalledBytes(input.resourceRoot, seed, `Electron Standalone seed ${index}`))),
  ]);
  void hostBytes;
  void supervisorBytes;
  const trustedKeys = parseTrust(trustBytes);
  const envelope = parseJson(contentBytes, "Electron Standalone content") as SignedStandaloneMetadata;
  verifyStandaloneMetadata(envelope, trustedKeys);
  if (envelope.metadata.channel !== declaration.channel || envelope.metadata.releaseVersion !== declaration.releaseVersion) {
    throw new Error("Electron Standalone content does not match its installed release binding");
  }

  const metadataDigests = Object.keys(envelope.metadata.blobs).sort();
  const seedDigests = declaration.seeds.map(({ blobSha256 }) => blobSha256).sort();
  if (metadataDigests.length !== seedDigests.length || metadataDigests.some((digest, index) => digest !== seedDigests[index])) {
    throw new Error("Electron Standalone offline seeds do not exactly cover signed content blobs");
  }
  const candidates = Object.fromEntries(declaration.seeds.map((seed, index) => {
    const blob = envelope.metadata.blobs[seed.blobSha256]!;
    if (seed.sha256 !== blob.sha256 || seed.size !== blob.size || seedBytes[index]!.byteLength !== blob.size) {
      throw new Error(`Electron Standalone seed does not match signed blob ${seed.blobSha256}`);
    }
    return [seed.blobSha256, Object.freeze([{ path: join(input.resourceRoot, seed.file), source: "seed" as const }])];
  }));
  return Object.freeze({
    declaration,
    envelope,
    trustedKeys,
    hostPath: join(input.resourceRoot, declaration.host.file),
    candidates: Object.freeze(candidates),
  });
}
