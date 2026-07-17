/**
 * Creator backup snapshot store (daemon side).
 *
 * This module builds manual, local, versioned snapshots of Creator-managed
 * metadata. A snapshot captures ONLY the five allowlisted Creator JSON files
 * per project:
 *
 *   creator-workbench/<pid>.json
 *   creator-media/<pid>.json
 *   creator-content/<pid>.json
 *   creator-release/<pid>.json
 *   creator-performance/<pid>.json
 *
 * It never reads or copies raw user assets (the project working dir at
 * `projects/<id>/` may contain original photos / video / audio), caches, logs,
 * credentials, or install/update payloads.
 *
 * Restore is intentionally NOT implemented here. Snapshots are committed
 * atomically (temp dir -> rename) and every file is SHA-256 verified, so a
 * snapshot is either fully present and consistent or absent.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { lstat, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  CREATOR_BACKUP_SCHEMA_VERSION,
  type CreatorBackupFile,
  type CreatorBackupManifest,
  type CreatorBackupProfile,
  type CreatorBackupSummary,
  type CreatorBackupValidationResult,
} from '@open-design/contracts';

/** Subdirectory under the data dir that holds each allowlisted Creator store. */
const ALLOWED_SUBDIRS = [
  'creator-workbench',
  'creator-media',
  'creator-content',
  'creator-release',
  'creator-performance',
] as const;

type AllowedSubdir = (typeof ALLOWED_SUBDIRS)[number];

const MANIFEST_FILE = 'manifest.json';
const BACKUP_DIR_NAME = 'backups';
const BACKUP_SUBDIR = 'creator';
/** File extension-free marker for an in-flight temp snapshot dir. */
const TEMP_SUFFIX = '.tmp';

export interface CreateCreatorBackupOptions {
  /** Human note captured at creation time. */
  note?: string;
  /** Snapshot profile. Only `full` is supported. */
  profile?: CreatorBackupProfile;
  /** App version string captured for audit; optional. */
  appVersion?: string;
  /** Controlled namespace the snapshot lives under. Derived when omitted. */
  namespace?: string;
  /**
   * Reads the minimal project identity (id + name) for a project id through the
   * daemon's controlled project store. Supplied by the caller (the route) so
   * this store stays decoupled from the DB layer. Missing projects resolve to
   * null and are skipped.
   */
  identityProvider?: (projectId: string) => { id: string; name: string } | null;
}

// ---- validation helpers -------------------------------------------------

// Mirrors the project-id assertion used by the other Creator stores.
function assertProjectId(projectId: string): void {
  if (
    typeof projectId !== 'string'
    || projectId.length === 0
    || projectId.length > 128
    || /^\.+$/.test(projectId)
    || !/^[A-Za-z0-9._-]+$/.test(projectId)
  ) {
    throw new Error('invalid project id');
  }
}

// Backup ids are server-generated (`creator-backup:<uuid>`), but the route
// accepts them as path params, so reject anything that could escape the
// snapshot directory.
function assertBackupId(backupId: string): string {
  if (typeof backupId !== 'string' || !backupId.trim()) {
    throw new Error('backup id is required');
  }
  if (/[/\\]/.test(backupId) || backupId.includes('..')) {
    throw new Error('backup id is not path safe');
  }
  return backupId;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Build the minimal project-identity payloads from an injected provider
 * (supplied by the caller so this store stays DB-free). Each entry carries a
 * SHA-256 over `${id}\n${name}` for tamper detection. Missing projects are
 * skipped.
 */
function captureProjectIdentitiesFrom(
  identityProvider: ((projectId: string) => { id: string; name: string } | null) | undefined,
  projectIds: string[],
): import('@open-design/contracts').CreatorBackupProjectIdentity[] {
  const out: import('@open-design/contracts').CreatorBackupProjectIdentity[] = [];
  if (!identityProvider) return out;
  for (const projectId of projectIds) {
    const minimal = identityProvider(projectId);
    if (!minimal || typeof minimal.id !== 'string' || !minimal.id) continue;
    const name = typeof minimal.name === 'string' ? minimal.name : minimal.id;
    out.push({
      id: minimal.id,
      name,
      schemaVersion: 1,
      hash: createHash('sha256').update(`${minimal.id}\n${name}`).digest('hex'),
    });
  }
  return out;
}

// ---- path derivation ----------------------------------------------------

/**
 * Resolve the backup root from the daemon data dir.
 *
 * The packaged layout is `<namespaceRoot>/data` (= RUNTIME_DATA_DIR), so the
 * backup root lives one level above the data dir, outside it:
 * `<namespaceRoot>/backups/creator`. In dev the data dir is `<root>/.od`, so
 * backups land in `<root>/backups/creator` — still outside `.od`.
 */
export function resolveCreatorBackupRoot(dataDir: string): string {
  return path.join(path.dirname(path.resolve(dataDir)), BACKUP_DIR_NAME, BACKUP_SUBDIR);
}

/** Derive the controlled namespace label from the data dir layout. */
export function resolveCreatorBackupNamespace(dataDir: string): string {
  return path.basename(path.dirname(path.resolve(dataDir)));
}

/** Filesystem-safe directory name for a backup id (no `:` on Windows, etc.). */
export function sanitizeBackupId(backupId: string): string {
  return backupId.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Path to a single allowlisted Creator JSON file. Rejects traversal ids. */
function creatorDataFilePath(dataDir: string, projectId: string, subdir: AllowedSubdir): string {
  assertProjectId(projectId);
  const dir = path.resolve(dataDir, subdir);
  const file = path.resolve(dir, `${projectId}.json`);
  const relative = path.relative(dir, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid project id');
  }
  return file;
}

/** True when `target` resolves inside `base` (no symlink escape). */
function isWithin(base: string, target: string): boolean {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// ---- core operations ----------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readAllowlistedSources(
  dataDir: string,
  projectId: string,
): Promise<{ subdir: AllowedSubdir; buffer: Buffer }[]> {
  const sources: { subdir: AllowedSubdir; buffer: Buffer }[] = [];
  for (const subdir of ALLOWED_SUBDIRS) {
    const subdirPath = path.resolve(dataDir, subdir);
    // Reject a symlinked (or junctioned) store directory: it could point
    // anywhere on disk, so we must not read through it.
    let dirInfo: import('node:fs').Stats;
    try {
      dirInfo = await lstat(subdirPath);
    } catch {
      continue; // subdir absent -> nothing to back up from this store
    }
    if (dirInfo.isSymbolicLink()) {
      throw new Error(`refusing to back up symlinked source directory: ${subdir}`);
    }
    const src = path.join(subdirPath, `${projectId}.json`);
    let info: import('node:fs').Stats;
    try {
      info = await lstat(src);
    } catch {
      continue; // file absent -> this store has no data for this project
    }
    // Reject a symlinked source file too (lstat, never followed).
    if (info.isSymbolicLink()) {
      throw new Error(`refusing to back up symlinked source: ${subdir}/${projectId}.json`);
    }
    const buffer = await fsp.readFile(src);
    sources.push({ subdir, buffer });
  }
  return sources;
}

function buildManifest(
  backupId: string,
  files: CreatorBackupFile[],
  options: CreateCreatorBackupOptions,
  namespace: string,
): CreatorBackupManifest {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  return {
    schemaVersion: CREATOR_BACKUP_SCHEMA_VERSION,
    id: backupId,
    createdAt: new Date().toISOString(),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    namespace,
    profile: options.profile ?? 'full',
    projectIds: [],
    files,
    fileCount: files.length,
    totalSize,
    status: 'ready',
    ...(options.note ? { note: options.note } : {}),
  };
}

/**
 * Verify a committed (or in-temp) snapshot directory against its manifest.
 * Recomputes SHA-256 of every declared file and enforces path safety.
 */
async function verifySnapshotDir(snapshotDir: string): Promise<CreatorBackupValidationResult> {
  let raw: string;
  try {
    raw = await fsp.readFile(path.join(snapshotDir, MANIFEST_FILE), 'utf8');
  } catch {
    return { id: '', valid: false, issues: ['manifest.json is missing'], fileCount: 0, totalSize: 0 };
  }

  let manifest: CreatorBackupManifest;
  try {
    manifest = JSON.parse(raw) as CreatorBackupManifest;
  } catch {
    return { id: '', valid: false, issues: ['manifest.json is not valid JSON'], fileCount: 0, totalSize: 0 };
  }

  const issues: string[] = [];
  const declared = manifest.files ?? [];
  let totalSize = 0;

  if (!Array.isArray(declared)) {
    issues.push('manifest.files is not an array');
  }

  for (const entry of declared) {
    if (typeof entry?.relativePath !== 'string' || !entry.relativePath) {
      issues.push('manifest contains a file entry without a relativePath');
      continue;
    }
    if (entry.relativePath.includes('..') || path.isAbsolute(entry.relativePath)) {
      issues.push(`file path is not safe: ${entry.relativePath}`);
      continue;
    }
    const filePath = path.join(snapshotDir, entry.relativePath);
    if (!isWithin(snapshotDir, filePath)) {
      issues.push(`file escapes snapshot directory: ${entry.relativePath}`);
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = await fsp.readFile(filePath);
    } catch {
      issues.push(`file is missing: ${entry.relativePath}`);
      continue;
    }
    totalSize += buffer.length;
    const actual = sha256(buffer);
    const expected = typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '';
    if (actual !== expected) {
      issues.push(`file hash mismatch: ${entry.relativePath}`);
    }
    if (typeof entry.size === 'number' && entry.size !== buffer.length) {
      issues.push(`file size mismatch: ${entry.relativePath}`);
    }
  }

  return {
    id: typeof manifest.id === 'string' ? manifest.id : '',
    valid: issues.length === 0,
    issues,
    fileCount: declared.length,
    totalSize,
  };
}

/** List all committed snapshots for diagnostics/cleanup. */
async function listSnapshotDirs(backupRoot: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(backupRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.endsWith(TEMP_SUFFIX))
    .map((entry) => path.join(backupRoot, entry.name));
}

function toSummary(manifest: CreatorBackupManifest): CreatorBackupSummary {
  return {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    createdAt: manifest.createdAt,
    profile: manifest.profile,
    projectIds: Array.isArray(manifest.projectIds) ? manifest.projectIds : [],
    fileCount: manifest.fileCount,
    totalSize: manifest.totalSize,
    status: manifest.status,
    validated: true,
  };
}

// ---- public API ---------------------------------------------------------

/** List committed snapshots as compact summaries (corrupt dirs are skipped). */
export async function listCreatorBackups(dataDir: string): Promise<CreatorBackupSummary[]> {
  const backupRoot = resolveCreatorBackupRoot(dataDir);
  const dirs = await listSnapshotDirs(backupRoot);
  const summaries: CreatorBackupSummary[] = [];
  for (const dir of dirs) {
    try {
      const raw = await fsp.readFile(path.join(dir, MANIFEST_FILE), 'utf8');
      const manifest = JSON.parse(raw) as CreatorBackupManifest;
      if (!manifest || typeof manifest.id !== 'string') continue;
      summaries.push(toSummary(manifest));
    } catch {
      // Corrupt / partial snapshot directory: skip rather than fail the list.
      continue;
    }
  }
  summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return summaries;
}

/**
 * Create a snapshot of the project's allowlisted Creator metadata. Writes to a
 * temp dir, SHA-256 verifies, then atomically renames into place. Any failure
 * removes the temp dir so no partial snapshot is left behind.
 */
export async function createCreatorBackup(
  dataDir: string,
  projectId: string,
  options: CreateCreatorBackupOptions = {},
): Promise<CreatorBackupManifest> {
  assertProjectId(projectId);
  const backupRoot = resolveCreatorBackupRoot(dataDir);
  await fsp.mkdir(backupRoot, { recursive: true });

  const backupId = `creator-backup:${randomUUID()}`;
  const finalDir = path.join(backupRoot, sanitizeBackupId(backupId));
  const tempDir = `${finalDir}.${process.pid}.${randomUUID()}${TEMP_SUFFIX}`;

  let tempCreated = false;
  try {
    await fsp.mkdir(tempDir, { recursive: true });
    tempCreated = true;

    const sources = await readAllowlistedSources(dataDir, projectId);
    const files: CreatorBackupFile[] = [];
    for (const { subdir, buffer } of sources) {
      const relativePath = `${subdir}/${projectId}.json`;
      const dest = path.join(tempDir, relativePath);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buffer);
      files.push({ relativePath, size: buffer.length, sha256: sha256(buffer) });
    }

    const namespace = options.namespace ?? resolveCreatorBackupNamespace(dataDir);
    const manifest = buildManifest(backupId, files, options, namespace);
    manifest.projectIds = [projectId];
    // Capture minimal project identity (id + name only) for re-establishing
    // the Creator project association on restore. Never copies working-dir
    // paths, credentials, asset bodies, or unrelated project data.
    manifest.projectIdentities = captureProjectIdentitiesFrom(
      options.identityProvider,
      [projectId],
    );

    await fsp.writeFile(path.join(tempDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    // Self-check before commit: the committed snapshot must verify cleanly.
    const verification = await verifySnapshotDir(tempDir);
    if (!verification.valid) {
      throw new Error(`backup self-verification failed: ${verification.issues.join('; ')}`);
    }

    await fsp.rename(tempDir, finalDir);
    tempCreated = false;

    const committed = await fsp.readFile(path.join(finalDir, MANIFEST_FILE), 'utf8');
    return JSON.parse(committed) as CreatorBackupManifest;
  } catch (error) {
    if (tempCreated) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; ignore secondary errors.
      }
    }
    throw error;
  }
}

/** Validate a committed snapshot against its manifest (SHA-256 + path safety). */
export async function validateCreatorBackup(
  dataDir: string,
  backupId: string,
): Promise<CreatorBackupValidationResult> {
  assertBackupId(backupId);
  const backupRoot = resolveCreatorBackupRoot(dataDir);
  const snapshotDir = path.join(backupRoot, sanitizeBackupId(backupId));
  if (!(await fileExists(snapshotDir))) {
    return { id: backupId, valid: false, issues: ['backup not found'], fileCount: 0, totalSize: 0 };
  }
  return verifySnapshotDir(snapshotDir);
}

/** Read a single committed snapshot's manifest (used by routes/restore). */
export async function readCreatorBackupManifest(
  dataDir: string,
  backupId: string,
): Promise<CreatorBackupManifest | null> {
  assertBackupId(backupId);
  const snapshotDir = path.join(resolveCreatorBackupRoot(dataDir), sanitizeBackupId(backupId));
  try {
    const raw = await fsp.readFile(path.join(snapshotDir, MANIFEST_FILE), 'utf8');
    return JSON.parse(raw) as CreatorBackupManifest;
  } catch {
    return null;
  }
}

export { ALLOWED_SUBDIRS };
