import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { atomicCopyFile, isProcessAlive, pathContains, removePathBestEffort } from "@open-design/platform";

const STORE_SENTINEL = ".open-design-download-root.json";
const STATE_DIR = ".state";
const PARTIAL_DIR = ".partial";
const LOCK_DIR = ".locks";
const STORE_SCHEMA_VERSION = 1;
const MANIFEST_SCHEMA_VERSION = 1;
const STORE_KIND = "open-design-managed-download-root";
const MANIFEST_KIND = "open-design-managed-download";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
const PID_REUSE_GRACE_MS = 1000;
const PROCESS_STARTED_AT_MS = Date.now() - process.uptime() * 1000;

export type ManagedDownloadChecksum = {
  algorithm: "sha256" | "sha512";
  value: string;
};

export type ManagedDownloadPayload = {
  checksum: ManagedDownloadChecksum;
  headers?: Record<string, string>;
  url: string;
};

export type ManagedDownloadProgress = {
  receivedBytes: number;
  sessionReceivedBytes: number;
  totalBytes?: number;
};

export type ManagedDownloadOptions = {
  basePath: string;
  bucket: string;
  fileName: string;
  fetch?: typeof globalThis.fetch;
  maxAttempts?: number;
  onProgress?: (progress: ManagedDownloadProgress) => void;
  payload: ManagedDownloadPayload;
  signal?: AbortSignal;
};

export type ManagedDownloadResult = {
  bucket: string;
  bytes: number;
  checksum: ManagedDownloadChecksum;
  fileName: string;
  path: string;
  reusedComplete: boolean;
  resumed: boolean;
  urlDigest: string;
};

export type DownloadCopyAndClearOptions = ManagedDownloadOptions & {
  outputPath: string;
};

export type DownloadCopyAndClearResult = {
  bytes: number;
  cleanup: "deferred" | "removed";
  cleanupWarning?: string;
  outputPath: string;
  reusedComplete: boolean;
  resumed: boolean;
};

export type ManagedDownloadInspection = {
  bucket: string;
  complete: boolean;
  fileName: string;
  manifest: "complete" | "missing" | "partial" | "unreadable";
  path: string;
};

export type RemoveManagedDownloadOptions = {
  basePath: string;
  bucket: string;
  fileName: string;
};

export type RemoveManagedDownloadResult = {
  removed: boolean;
};

export type PruneManagedDownloadsOptions = {
  basePath: string;
  now?: Date;
  olderThanMs?: number;
};

export type PruneManagedDownloadsResult = {
  removed: number;
  warnings: string[];
};

export const MANAGED_DOWNLOAD_ERROR_CODES = Object.freeze({
  ABORTED: "aborted",
  CHECKSUM_MISMATCH: "checksum-mismatch",
  INVALID_TARGET: "invalid-target",
  NETWORK_EXHAUSTED: "network-exhausted",
  OUTPUT_CONFLICT: "output-conflict",
  STORE_CORRUPT: "store-corrupt",
  STORE_NOT_OWNED: "store-not-owned",
  TARGET_CONFLICT: "target-conflict",
  TARGET_LOCKED: "target-locked",
} as const);

export type ManagedDownloadErrorCode =
  (typeof MANAGED_DOWNLOAD_ERROR_CODES)[keyof typeof MANAGED_DOWNLOAD_ERROR_CODES];

export class ManagedDownloadError extends Error {
  readonly code: ManagedDownloadErrorCode;
  readonly details?: unknown;

  constructor(code: ManagedDownloadErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ManagedDownloadError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

type StoreSentinel = {
  createdAt: string;
  kind: typeof STORE_KIND;
  schemaVersion: typeof STORE_SCHEMA_VERSION;
};

type DownloadManifest = {
  bucket: string;
  checksum: ManagedDownloadChecksum;
  createdAt: string;
  fileName: string;
  identityDigest: string;
  kind: typeof MANIFEST_KIND;
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  state: "complete" | "partial";
  targetKey: string;
  totalBytes?: number;
  updatedAt: string;
  urlDigest: string;
  validators?: {
    etag?: string;
    lastModified?: string;
  };
};

type NormalizedTarget = {
  basePath: string;
  bucket: string;
  checksum: ManagedDownloadChecksum;
  fileName: string;
  finalPath: string;
  identityDigest: string;
  lockPath: string;
  manifestPath: string;
  partialPath: string;
  targetKey: string;
  url: string;
  urlDigest: string;
};

type ActiveTask = {
  listeners: Set<(progress: ManagedDownloadProgress) => void>;
  promise: Promise<ManagedDownloadResult>;
  targetKey: string;
};

type CopyLease = {
  key: string;
};

type CopyLeaseState = {
  clearRequested: boolean;
  count: number;
  removeOptions: RemoveManagedDownloadOptions | null;
};

type AcquiredLock = {
  path: string;
};

type DownloadLockFile = {
  createdAt: string;
  pid: number;
  processStartedAt?: string;
};

type DownloadAttemptResult = {
  resumed: boolean;
  totalBytes?: number;
};

type ReusableState = {
  manifest: DownloadManifest | null;
  reset?: boolean;
  result?: ManagedDownloadResult;
};

const activeTasks = new Map<string, ActiveTask>();
const activeTargets = new Map<string, string>();
const copyLeases = new Map<string, CopyLeaseState>();

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeChecksum(input: ManagedDownloadChecksum): ManagedDownloadChecksum {
  if (input.algorithm !== "sha256" && input.algorithm !== "sha512") {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `unsupported checksum algorithm: ${String(input.algorithm)}`);
  }
  const value = input.value.trim().toLowerCase();
  const expectedLength = input.algorithm === "sha256" ? 64 : 128;
  if (!new RegExp(`^[0-9a-f]{${expectedLength}}$`).test(value)) {
    throw new ManagedDownloadError(
      MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET,
      `${input.algorithm} checksum must be ${expectedLength} hex characters`,
    );
  }
  return { algorithm: input.algorithm, value };
}

function normalizeSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `${label} must be a non-empty string`);
  }
  if (value === "." || value === ".." || value.includes("\0") || /[\\/]/.test(value) || isAbsolute(value)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `${label} must be a safe single path segment`);
  }
  return value;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("only http and https URLs are supported");
    }
    return url.toString();
  } catch (error) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, errorMessage(error));
  }
}

function normalizeBasePath(basePath: string): string {
  if (typeof basePath !== "string" || basePath.length === 0 || basePath.includes("\0")) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "basePath must be a non-empty path");
  }
  const resolved = resolve(basePath);
  if (!isAbsolute(resolved)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `basePath must resolve to an absolute path: ${basePath}`);
  }
  return resolved;
}

function targetFromOptions(options: Pick<ManagedDownloadOptions, "basePath" | "bucket" | "fileName" | "payload">): NormalizedTarget {
  const basePath = normalizeBasePath(options.basePath);
  const bucket = normalizeSegment(options.bucket, "bucket");
  const fileName = normalizeSegment(options.fileName, "fileName");
  const checksum = normalizeChecksum(options.payload.checksum);
  const url = normalizeUrl(options.payload.url);
  const urlDigest = digest(url);
  const identityDigest = digest(`${url}\0${checksum.algorithm}\0${checksum.value}`);
  const targetKey = digest(`${bucket}\0${fileName}`);
  const finalPath = resolve(basePath, bucket, fileName);
  const manifestPath = resolve(basePath, STATE_DIR, `${targetKey}.json`);
  const partialPath = resolve(basePath, PARTIAL_DIR, `${targetKey}.partial`);
  const lockPath = resolve(basePath, LOCK_DIR, `${targetKey}.lock`);
  for (const path of [finalPath, manifestPath, partialPath, lockPath]) {
    if (!pathContains(basePath, path)) {
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "resolved managed download path escaped basePath");
    }
  }
  return { basePath, bucket, checksum, fileName, finalPath, identityDigest, lockPath, manifestPath, partialPath, targetKey, url, urlDigest };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function directoryIsEmpty(path: string): Promise<boolean> {
  const entries = await readdir(path);
  return entries.length === 0;
}

function isStoreSentinel(value: unknown): value is StoreSentinel {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const record = value as Partial<StoreSentinel>;
  return record.kind === STORE_KIND && record.schemaVersion === STORE_SCHEMA_VERSION && typeof record.createdAt === "string";
}

async function writeSentinel(basePath: string): Promise<void> {
  await writeJson(join(basePath, STORE_SENTINEL), {
    createdAt: new Date().toISOString(),
    kind: STORE_KIND,
    schemaVersion: STORE_SCHEMA_VERSION,
  } satisfies StoreSentinel);
}

async function resetOwnedBase(basePath: string): Promise<void> {
  const sentinel = await readJson<unknown>(join(basePath, STORE_SENTINEL));
  if (!isStoreSentinel(sentinel)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base is not owned: ${basePath}`);
  }
  const entries = await readdir(basePath).catch(() => []);
  for (const entry of entries) {
    await rm(join(basePath, entry), { force: true, recursive: true }).catch(() => undefined);
  }
  await writeSentinel(basePath);
  await ensureStoreDirs(basePath);
}

async function ensureStoreDirs(basePath: string): Promise<void> {
  await mkdir(join(basePath, STATE_DIR), { recursive: true });
  await mkdir(join(basePath, PARTIAL_DIR), { recursive: true });
  await mkdir(join(basePath, LOCK_DIR), { recursive: true });
}

async function ensureManagedBase(basePath: string): Promise<void> {
  await mkdir(basePath, { recursive: true });
  const entry = await lstat(basePath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base is not an owned directory: ${basePath}`);
  }
  const sentinelPath = join(basePath, STORE_SENTINEL);
  const sentinel = await readJson<unknown>(sentinelPath);
  if (sentinel == null) {
    if (!(await directoryIsEmpty(basePath))) {
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base is not empty and has no ownership marker: ${basePath}`);
    }
    await writeSentinel(basePath);
  } else if (!isStoreSentinel(sentinel)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base has an invalid ownership marker: ${basePath}`);
  }
  await ensureStoreDirs(basePath);
}

function isChecksum(value: unknown): value is ManagedDownloadChecksum {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const checksum = value as Partial<ManagedDownloadChecksum>;
  return (
    (checksum.algorithm === "sha256" || checksum.algorithm === "sha512") &&
    typeof checksum.value === "string"
  );
}

function isManifest(value: unknown): value is DownloadManifest {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const record = value as Partial<DownloadManifest>;
  return (
    record.kind === MANIFEST_KIND &&
    record.schemaVersion === MANIFEST_SCHEMA_VERSION &&
    typeof record.bucket === "string" &&
    typeof record.fileName === "string" &&
    typeof record.targetKey === "string" &&
    typeof record.identityDigest === "string" &&
    typeof record.urlDigest === "string" &&
    isChecksum(record.checksum) &&
    (record.state === "complete" || record.state === "partial") &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

function isDownloadLockFile(value: unknown): value is DownloadLockFile {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const record = value as Partial<DownloadLockFile>;
  return typeof record.createdAt === "string" &&
    typeof record.pid === "number" &&
    Number.isInteger(record.pid) &&
    record.pid > 0 &&
    (record.processStartedAt == null || typeof record.processStartedAt === "string");
}

function parseTimeMs(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lockBelongsToCurrentProcess(lock: DownloadLockFile): boolean {
  if (lock.pid !== process.pid) return false;
  const ownerStartedAtMs = parseTimeMs(lock.processStartedAt);
  if (ownerStartedAtMs != null) return ownerStartedAtMs >= PROCESS_STARTED_AT_MS - PID_REUSE_GRACE_MS;

  // Older locks only carried a pid. If Windows reuses that pid for this
  // process, a lock that predates this process start is definitely stale.
  const lockCreatedAtMs = parseTimeMs(lock.createdAt);
  return lockCreatedAtMs == null || lockCreatedAtMs >= PROCESS_STARTED_AT_MS - PID_REUSE_GRACE_MS;
}

function isLockProcessAlive(lock: DownloadLockFile): boolean {
  if (!isProcessAlive(lock.pid)) return false;
  if (lock.pid === process.pid) return lockBelongsToCurrentProcess(lock);
  return true;
}

async function readManifest(path: string): Promise<DownloadManifest | "invalid" | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isManifest(parsed) ? parsed : "invalid";
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    return "invalid";
  }
}

function manifestMatchesTarget(manifest: DownloadManifest, target: NormalizedTarget): boolean {
  return (
    manifest.bucket === target.bucket &&
    manifest.fileName === target.fileName &&
    manifest.targetKey === target.targetKey &&
    manifest.identityDigest === target.identityDigest &&
    manifest.urlDigest === target.urlDigest &&
    manifest.checksum.algorithm === target.checksum.algorithm &&
    manifest.checksum.value.toLowerCase() === target.checksum.value
  );
}

function createManifest(
  target: NormalizedTarget,
  state: "complete" | "partial",
  patch: Partial<Pick<DownloadManifest, "totalBytes" | "validators">> = {},
): DownloadManifest {
  const now = new Date().toISOString();
  return {
    bucket: target.bucket,
    checksum: target.checksum,
    createdAt: now,
    fileName: target.fileName,
    identityDigest: target.identityDigest,
    kind: MANIFEST_KIND,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    state,
    targetKey: target.targetKey,
    updatedAt: now,
    urlDigest: target.urlDigest,
    ...patch,
  };
}

async function hashFile(path: string, algorithm: "sha256" | "sha512"): Promise<string> {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function statFileSize(path: string): Promise<number | null> {
  try {
    const entry = await stat(path);
    return entry.isFile() ? entry.size : null;
  } catch {
    return null;
  }
}

async function emitExistingProgress(path: string, totalBytes: number | undefined, emit: (progress: ManagedDownloadProgress) => void): Promise<void> {
  const existing = await statFileSize(path);
  if (existing == null || existing <= 0) return;
  emit({ receivedBytes: existing, sessionReceivedBytes: 0, ...(totalBytes == null ? {} : { totalBytes }) });
}

function contentLength(response: Response): number | undefined {
  const raw = response.headers.get("content-length");
  if (raw == null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function validatorsFromResponse(response: Response): DownloadManifest["validators"] | undefined {
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified = response.headers.get("last-modified") ?? undefined;
  return etag == null && lastModified == null ? undefined : { ...(etag == null ? {} : { etag }), ...(lastModified == null ? {} : { lastModified }) };
}

function validatorsConflict(saved: DownloadManifest["validators"] | undefined, response: Response): boolean {
  if (saved == null) return false;
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified = response.headers.get("last-modified") ?? undefined;
  if (saved.etag != null && etag != null && saved.etag !== etag) return true;
  if (saved.lastModified != null && lastModified != null && saved.lastModified !== lastModified) return true;
  return false;
}

function parseContentRange(value: string | null): { end: number; start: number; totalBytes?: number } | null {
  if (value == null) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());
  if (match?.[1] == null || match[2] == null || match[3] == null) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const totalBytes = match[3] === "*" ? undefined : Number(match[3]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  if (totalBytes != null && (!Number.isInteger(totalBytes) || totalBytes <= end)) return null;
  return { start, end, ...(totalBytes == null ? {} : { totalBytes }) };
}

async function writeResponseBodyToPartial(
  response: Response,
  target: NormalizedTarget,
  options: {
    emit: (progress: ManagedDownloadProgress) => void;
    startBytes: number;
    totalBytes?: number;
  },
): Promise<void> {
  if (response.body == null) throw new Error("download response did not include a body");
  let receivedBytes = options.startBytes;
  let sessionReceivedBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      sessionReceivedBytes += chunk.byteLength;
      options.emit({
        receivedBytes,
        sessionReceivedBytes,
        ...(options.totalBytes == null ? {} : { totalBytes: options.totalBytes }),
      });
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as never),
    meter,
    createWriteStream(target.partialPath, { flags: options.startBytes > 0 ? "a" : "w" }),
  );
}

async function tryResumeDownload(
  target: NormalizedTarget,
  manifest: DownloadManifest,
  fetchImpl: typeof globalThis.fetch,
  emit: (progress: ManagedDownloadProgress) => void,
  requestHeaders: Record<string, string> | undefined,
): Promise<DownloadAttemptResult | "restart"> {
  const partialBytes = await statFileSize(target.partialPath);
  if (partialBytes == null || partialBytes <= 0) return "restart";
  const response = await fetchImpl(target.url, {
    headers: {
      ...(requestHeaders ?? {}),
      ...(manifest.validators?.etag == null ? {} : { "If-Range": manifest.validators.etag }),
      Range: `bytes=${partialBytes}-`,
    },
  });
  if (response.status !== 206) return "restart";
  const range = parseContentRange(response.headers.get("content-range"));
  if (range == null || range.start !== partialBytes || validatorsConflict(manifest.validators, response)) {
    return "restart";
  }
  const totalBytes = range.totalBytes ?? manifest.totalBytes ?? partialBytes + (contentLength(response) ?? 0);
  await emitExistingProgress(target.partialPath, totalBytes, emit);
  await writeJson(target.manifestPath, {
    ...manifest,
    state: "partial",
    totalBytes,
    updatedAt: new Date().toISOString(),
    validators: manifest.validators ?? validatorsFromResponse(response),
  } satisfies DownloadManifest);
  await writeResponseBodyToPartial(response, target, { emit, startBytes: partialBytes, totalBytes });
  return { resumed: true, totalBytes };
}

async function downloadFromZero(
  target: NormalizedTarget,
  fetchImpl: typeof globalThis.fetch,
  emit: (progress: ManagedDownloadProgress) => void,
  requestHeaders: Record<string, string> | undefined,
): Promise<DownloadAttemptResult> {
  await rm(target.partialPath, { force: true }).catch(() => undefined);
  const response = await fetchImpl(target.url, { headers: requestHeaders });
  if (!response.ok) throw new Error(`download request returned HTTP ${response.status}`);
  const totalBytes = contentLength(response);
  const validators = validatorsFromResponse(response);
  await writeJson(target.manifestPath, createManifest(target, "partial", { totalBytes, validators }));
  await writeResponseBodyToPartial(response, target, { emit, startBytes: 0, totalBytes });
  return { resumed: false, totalBytes };
}

async function downloadWithRetries(
  target: NormalizedTarget,
  manifest: DownloadManifest | null,
  options: {
    emit: (progress: ManagedDownloadProgress) => void;
    fetchImpl: typeof globalThis.fetch;
    maxAttempts: number;
    requestHeaders?: Record<string, string>;
  },
): Promise<DownloadAttemptResult> {
  let lastError: unknown;
  let nextManifest = manifest;
  let resumed = false;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      if (nextManifest?.state === "partial") {
        const resume = await tryResumeDownload(target, nextManifest, options.fetchImpl, options.emit, options.requestHeaders);
        if (resume !== "restart") return { ...resume, resumed: true };
        await rm(target.partialPath, { force: true }).catch(() => undefined);
        nextManifest = null;
      }
      const full = await downloadFromZero(target, options.fetchImpl, options.emit, options.requestHeaders);
      resumed = resumed || full.resumed;
      return { ...full, resumed };
    } catch (error) {
      lastError = error;
      const partialBytes = await statFileSize(target.partialPath);
      if (partialBytes != null && partialBytes > 0) {
        nextManifest = {
          ...(nextManifest ?? createManifest(target, "partial")),
          state: "partial",
          updatedAt: new Date().toISOString(),
        };
        await writeJson(target.manifestPath, nextManifest).catch(() => undefined);
      }
    }
  }
  throw new ManagedDownloadError(
    MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED,
    `download failed after ${options.maxAttempts} attempts: ${errorMessage(lastError)}`,
  );
}

async function acquireLock(target: NormalizedTarget): Promise<AcquiredLock> {
  await mkdir(dirname(target.lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(
        target.lockPath,
        `${JSON.stringify({
          createdAt: new Date().toISOString(),
          pid: process.pid,
          processStartedAt: new Date(PROCESS_STARTED_AT_MS).toISOString(),
        } satisfies DownloadLockFile)}\n`,
        { flag: "wx" },
      );
      return { path: target.lockPath };
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        const staleLockCleared = attempt === 0 && await clearStaleLock(target);
        if (staleLockCleared) continue;
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED, `download target is locked: ${target.bucket}/${target.fileName}`);
      }
      throw error;
    }
  }
  throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED, `download target is locked: ${target.bucket}/${target.fileName}`);
}

async function clearStaleLock(target: NormalizedTarget): Promise<boolean> {
  const lock = await readJson<unknown>(target.lockPath);
  if (!isDownloadLockFile(lock) || isLockProcessAlive(lock)) return false;
  await rm(target.lockPath, { force: true }).catch(() => undefined);
  return true;
}

async function releaseLock(lock: AcquiredLock | null): Promise<void> {
  if (lock == null) return;
  await rm(lock.path, { force: true }).catch(() => undefined);
}

async function suspiciousReset(target: NormalizedTarget): Promise<ReusableState> {
  await resetOwnedBase(target.basePath);
  return { manifest: null, reset: true };
}

async function loadReusableState(target: NormalizedTarget): Promise<ReusableState> {
  const manifest = await readManifest(target.manifestPath);
  const finalExists = await pathExists(target.finalPath);
  const partialExists = await pathExists(target.partialPath);
  if (manifest === "invalid") {
    return await suspiciousReset(target);
  }
  if (manifest == null) {
    if (finalExists || partialExists) return await suspiciousReset(target);
    return { manifest: null };
  }
  if (!manifestMatchesTarget(manifest, target)) {
    return await suspiciousReset(target);
  }
  if (manifest.state === "complete") {
    if (!finalExists) return await suspiciousReset(target);
    const actual = await hashFile(target.finalPath, target.checksum.algorithm).catch(() => null);
    if (actual !== target.checksum.value) return await suspiciousReset(target);
    const bytes = await statFileSize(target.finalPath);
    if (bytes == null) return await suspiciousReset(target);
    return {
      manifest,
      result: {
        bucket: target.bucket,
        bytes,
        checksum: target.checksum,
        fileName: target.fileName,
        path: target.finalPath,
        reusedComplete: true,
        resumed: false,
        urlDigest: target.urlDigest,
      },
    };
  }
  if (!partialExists) return await suspiciousReset(target);
  return { manifest };
}

async function runManagedDownload(
  target: NormalizedTarget,
  options: {
    emit: (progress: ManagedDownloadProgress) => void;
    fetchImpl: typeof globalThis.fetch;
    maxAttempts: number;
    requestHeaders?: Record<string, string>;
  },
): Promise<ManagedDownloadResult> {
  await ensureManagedBase(target.basePath);
  await pruneManagedDownloads({ basePath: target.basePath }).catch(() => undefined);
  let lock: AcquiredLock | null = await acquireLock(target);
  try {
    let state = await loadReusableState(target);
    if (state.result != null) return state.result;
    if (state.reset === true) {
      // A reset removes the lock as part of the managed base cleanup, so
      // reacquire it before writing the fresh target state.
      await releaseLock(lock);
      lock = null;
      await ensureManagedBase(target.basePath);
      lock = await acquireLock(target);
      state = await loadReusableState(target);
      if (state.result != null) return state.result;
      if (state.reset === true) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, "download state kept resetting after base cleanup");
      }
    }
    const download = await downloadWithRetries(target, state.manifest, options);
    const actual = await hashFile(target.partialPath, target.checksum.algorithm).catch((error: unknown) => {
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, `downloaded partial could not be hashed: ${errorMessage(error)}`);
    });
    if (actual !== target.checksum.value) {
      await resetOwnedBase(target.basePath).catch(() => undefined);
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.CHECKSUM_MISMATCH, "downloaded file checksum did not match requested payload", {
        actual,
        expected: target.checksum.value,
      });
    }

    await mkdir(dirname(target.finalPath), { recursive: true });
    if (await pathExists(target.finalPath)) {
      const existing = await hashFile(target.finalPath, target.checksum.algorithm).catch(() => null);
      if (existing !== target.checksum.value) {
        await resetOwnedBase(target.basePath).catch(() => undefined);
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, "existing complete file did not match requested payload");
      }
      await rm(target.partialPath, { force: true }).catch(() => undefined);
    } else {
      await rename(target.partialPath, target.finalPath);
    }
    const bytes = await statFileSize(target.finalPath);
    if (bytes == null) throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, "complete file is missing after promotion");
    await writeJson(target.manifestPath, createManifest(target, "complete", { totalBytes: download.totalBytes }));
    return {
      bucket: target.bucket,
      bytes,
      checksum: target.checksum,
      fileName: target.fileName,
      path: target.finalPath,
      reusedComplete: false,
      resumed: download.resumed,
      urlDigest: target.urlDigest,
    };
  } finally {
    await releaseLock(lock);
  }
}

function activeKey(target: NormalizedTarget): string {
  return `${target.basePath}\0${target.targetKey}\0${target.identityDigest}`;
}

function targetActiveKey(target: NormalizedTarget): string {
  return `${target.basePath}\0${target.targetKey}`;
}

function waitForTask(
  task: ActiveTask,
  options: Pick<ManagedDownloadOptions, "onProgress" | "signal">,
): Promise<ManagedDownloadResult> {
  return new Promise<ManagedDownloadResult>((resolveWait, rejectWait) => {
    if (options.signal?.aborted) {
      rejectWait(new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.ABORTED, "download wait was aborted"));
      return;
    }
    const listener = options.onProgress;
    if (listener != null) task.listeners.add(listener);
    const cleanup = () => {
      if (listener != null) task.listeners.delete(listener);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      rejectWait(new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.ABORTED, "download wait was aborted"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    task.promise.then(
      (result) => {
        cleanup();
        resolveWait(result);
      },
      (error: unknown) => {
        cleanup();
        rejectWait(error);
      },
    );
  });
}

export async function managedDownload(options: ManagedDownloadOptions): Promise<ManagedDownloadResult> {
  const target = targetFromOptions(options);
  const key = activeKey(target);
  const targetKey = targetActiveKey(target);
  const existingForTarget = activeTargets.get(targetKey);
  if (existingForTarget != null && existingForTarget !== key) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_CONFLICT, `download target is already active with a different identity: ${target.bucket}/${target.fileName}`);
  }
  const existing = activeTasks.get(key);
  if (existing != null) return await waitForTask(existing, options);

  const listeners = new Set<(progress: ManagedDownloadProgress) => void>();
  const emit = (progress: ManagedDownloadProgress) => {
    for (const listener of listeners) listener(progress);
  };
  const task: ActiveTask = {
    listeners,
    targetKey,
    promise: runManagedDownload(target, {
      emit,
      fetchImpl: options.fetch ?? globalThis.fetch,
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      requestHeaders: options.payload.headers,
    }),
  };
  activeTasks.set(key, task);
  activeTargets.set(targetKey, key);
  task.promise.finally(() => {
    activeTasks.delete(key);
    if (activeTargets.get(targetKey) === key) activeTargets.delete(targetKey);
  }).catch(() => undefined);
  return await waitForTask(task, options);
}

function acquireCopyLease(target: NormalizedTarget): CopyLease {
  const key = targetActiveKey(target);
  const state = copyLeases.get(key) ?? { clearRequested: false, count: 0, removeOptions: null };
  state.count += 1;
  copyLeases.set(key, state);
  return { key };
}

async function requestClearAfterCopy(target: NormalizedTarget): Promise<"deferred" | "removed"> {
  const key = targetActiveKey(target);
  const state = copyLeases.get(key);
  if (state != null && state.count > 1) {
    state.clearRequested = true;
    state.removeOptions = { basePath: target.basePath, bucket: target.bucket, fileName: target.fileName };
    return "deferred";
  }
  await removeManagedDownload({ basePath: target.basePath, bucket: target.bucket, fileName: target.fileName });
  return "removed";
}

async function releaseCopyLease(lease: CopyLease): Promise<void> {
  const state = copyLeases.get(lease.key);
  if (state == null) return;
  state.count -= 1;
  if (state.count > 0) return;
  copyLeases.delete(lease.key);
  if (state.clearRequested && state.removeOptions != null) {
    await removeManagedDownload(state.removeOptions).catch(() => undefined);
  }
}

export async function downloadCopyAndClear(options: DownloadCopyAndClearOptions): Promise<DownloadCopyAndClearResult> {
  const target = targetFromOptions(options);
  if (typeof options.outputPath !== "string" || options.outputPath.length === 0 || options.outputPath.includes("\0")) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "outputPath must be a non-empty path");
  }
  const outputPath = resolve(options.outputPath);
  if (!isAbsolute(outputPath)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `outputPath must resolve to an absolute path: ${options.outputPath}`);
  }
  const lease = acquireCopyLease(target);
  try {
    const downloaded = await managedDownload(options);
    const existingOutput = await statFileSize(outputPath);
    if (existingOutput != null) {
      const existingDigest = await hashFile(outputPath, target.checksum.algorithm).catch(() => null);
      if (existingDigest !== target.checksum.value) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.OUTPUT_CONFLICT, `output already exists with different bytes: ${outputPath}`);
      }
    } else {
      await atomicCopyFile(downloaded.path, outputPath);
      const copiedDigest = await hashFile(outputPath, target.checksum.algorithm);
      if (copiedDigest !== target.checksum.value) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.CHECKSUM_MISMATCH, "copied output checksum did not match requested payload");
      }
    }
    let cleanup: "deferred" | "removed" = "removed";
    let cleanupWarning: string | undefined;
    try {
      cleanup = await requestClearAfterCopy(target);
    } catch (error) {
      cleanupWarning = errorMessage(error);
    }
    return {
      bytes: downloaded.bytes,
      cleanup,
      ...(cleanupWarning == null ? {} : { cleanupWarning }),
      outputPath,
      reusedComplete: downloaded.reusedComplete,
      resumed: downloaded.resumed,
    };
  } finally {
    await releaseCopyLease(lease);
  }
}

export async function inspectManagedDownload(options: RemoveManagedDownloadOptions): Promise<ManagedDownloadInspection> {
  const target = targetFromOptions({
    ...options,
    payload: {
      checksum: { algorithm: "sha256", value: "0".repeat(64) },
      url: "https://example.invalid/",
    },
  });
  await ensureManagedBase(target.basePath);
  const rawManifest = await readManifest(target.manifestPath);
  const manifest = rawManifest === "invalid" ? "unreadable" : rawManifest?.state ?? "missing";
  return {
    bucket: target.bucket,
    complete: await pathExists(target.finalPath),
    fileName: target.fileName,
    manifest,
    path: target.finalPath,
  };
}

export async function removeManagedDownload(options: RemoveManagedDownloadOptions): Promise<RemoveManagedDownloadResult> {
  const target = targetFromOptions({
    ...options,
    payload: {
      checksum: { algorithm: "sha256", value: "0".repeat(64) },
      url: "https://example.invalid/",
    },
  });
  if (activeTargets.has(targetActiveKey(target))) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED, `download target is active: ${target.bucket}/${target.fileName}`);
  }
  await ensureManagedBase(target.basePath);
  await Promise.all([
    removePathBestEffort(target.finalPath),
    removePathBestEffort(target.partialPath, { recursive: false }),
    removePathBestEffort(target.manifestPath, { recursive: false }),
    removePathBestEffort(target.lockPath, { recursive: false }),
  ]);
  const bucketPath = join(target.basePath, target.bucket);
  const entries = await readdir(bucketPath).catch(() => null);
  if (entries != null && entries.length === 0) await rm(bucketPath, { force: true, recursive: true }).catch(() => undefined);
  return { removed: true };
}

async function removeEntriesOlderThan(root: string, olderThan: number): Promise<{ removed: number; warnings: string[] }> {
  const warnings: string[] = [];
  let removed = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(root, entry.name);
    const info = await stat(path).catch(() => null);
    if (info == null || info.mtimeMs > olderThan) continue;
    const result = await removePathBestEffort(path);
    if (result.removed) removed += 1;
    else if (result.error != null) warnings.push(result.error);
  }
  return { removed, warnings };
}

export async function pruneManagedDownloads(options: PruneManagedDownloadsOptions): Promise<PruneManagedDownloadsResult> {
  const basePath = normalizeBasePath(options.basePath);
  await ensureManagedBase(basePath);
  const olderThan = (options.now?.getTime() ?? Date.now()) - (options.olderThanMs ?? DEFAULT_PRUNE_OLDER_THAN_MS);
  const roots = [join(basePath, STATE_DIR), join(basePath, PARTIAL_DIR), join(basePath, LOCK_DIR)];
  let removed = 0;
  const warnings: string[] = [];
  for (const root of roots) {
    const result = await removeEntriesOlderThan(root, olderThan);
    removed += result.removed;
    warnings.push(...result.warnings);
  }
  const bucketEntries = await readdir(basePath, { withFileTypes: true }).catch(() => []);
  for (const entry of bucketEntries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const result = await removeEntriesOlderThan(join(basePath, entry.name), olderThan);
    removed += result.removed;
    warnings.push(...result.warnings);
    const remaining = await readdir(join(basePath, entry.name)).catch(() => null);
    if (remaining != null && remaining.length === 0) await rm(join(basePath, entry.name), { force: true, recursive: true }).catch(() => undefined);
  }
  return { removed, warnings };
}
