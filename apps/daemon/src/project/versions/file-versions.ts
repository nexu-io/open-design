/** @module versions/file-versions
 * Per-file version history for project HTML artifacts, stored under
 * `<project>/.file-versions/<sha256(fileName) prefix>/` with a `manifest.json`
 * index plus one content file per version. All mutating operations serialize
 * through an in-process per-file promise lock so concurrent writers cannot
 * interleave manifest updates.
 * Depends only on core/ (path validation, id checks, MIME/kind classification); no sibling imports.
 */
import type {
  ProjectFileKind,
  ProjectFileVersion,
  ProjectFileVersionPromptSource,
  ProjectFileVersionSource,
} from '@open-design/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isSafeId, kindFor, mimeFor, resolveProjectDir, validateProjectPath } from '../core/index.js';

const VERSION_ROOT = '.file-versions';
const VERSION_MANIFEST = 'manifest.json';
const VERSION_ID_RE = /^[A-Za-z0-9_-]+$/u;
const versionFileLocks = new Map<string, Promise<void>>();

type VersionPromptSource = ProjectFileVersionPromptSource;
type VersionSource = ProjectFileVersionSource;

interface VersionEntry {
  id: string;
  fileName: string;
  version: number;
  label: string;
  createdAt: number;
  source: VersionSource;
  prompt: string | null;
  promptSource?: VersionPromptSource;
  restoreFromVersionId?: string;
  size: number;
  mime: string;
  kind: ProjectFileKind;
  contentPath: string;
}

interface VersionManifestState {
  entries: VersionEntry[];
  deletedAt?: number;
}

interface CreateProjectFileVersionOptions {
  prompt?: string | null;
  promptSource?: VersionPromptSource;
  source?: VersionSource;
  label?: string | null;
  restoreFromVersionId?: string;
}

/**
 * Callbacks handed to a {@link withProjectFileVersionLock} body: version
 * creation primitives that are safe to call because the per-file lock is
 * already held.
 */
export interface ProjectFileVersionLockContext {
  safeName: string;
  createVersion: (content: string, options?: CreateProjectFileVersionOptions) => Promise<ProjectFileVersion>;
  ensureCurrentVersion: (content: string, options?: CreateProjectFileVersionOptions) => Promise<ProjectFileVersion | null>;
}

/** @internal Creates an Error carrying an errno-style `code` for route-layer mapping. */
function codedError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

/** @internal Extracts the string `code` from an unknown error, if present. */
function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

/** @internal True when a rename failed because the target already exists (EEXIST/ENOTEMPTY). */
function isExistingTargetError(err: unknown): boolean {
  const code = errorCode(err);
  return code === 'EEXIST' || code === 'ENOTEMPTY';
}

/** @internal Stable directory key for a file's version store: sha256(fileName) truncated to 24 hex chars. */
function fileVersionKey(fileName: string): string {
  return createHash('sha256').update(fileName).digest('hex').slice(0, 24);
}

/** @internal Absolute version-store directory for one project file; validates the project id. */
function versionRootFor(projectsRoot: string, projectId: string, fileName: string): string {
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(projectsRoot, projectId, VERSION_ROOT, fileVersionKey(fileName));
}

/** @internal NUL-joined lock-map key scoping the per-file lock to (root, project, file). */
function versionLockKey(projectsRoot: string, projectId: string, fileName: string): string {
  return `${path.resolve(projectsRoot)}\0${projectId}\0${fileName}`;
}

/**
 * @internal
 * FIFO promise-chain mutex for one lock key: waits for the previous holder,
 * runs `fn`, then releases and cleans the map entry when it is still the tail.
 */
async function withVersionLockKey<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = versionFileLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  versionFileLocks.set(key, chained);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (versionFileLocks.get(key) === chained) {
      versionFileLocks.delete(key);
    }
  }
}

/** @internal Runs `fn` while holding the single-file version lock. */
async function withVersionFileLock<T>(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withVersionLockKey(versionLockKey(projectsRoot, projectId, fileName), fn);
}

/**
 * @internal
 * Acquires the locks for several files in sorted key order (deadlock-free)
 * before running `fn`; used by cross-file operations like store rename.
 */
async function withVersionFileLocks<T>(
  projectsRoot: string,
  projectId: string,
  fileNames: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const keys = [...new Set(fileNames.map((fileName) => versionLockKey(projectsRoot, projectId, fileName)))]
    .sort();

  const acquire = (index: number): Promise<T> => {
    if (index >= keys.length) return fn();
    const key = keys[index];
    if (!key) return fn();
    return withVersionLockKey(key, () => acquire(index + 1));
  };

  return acquire(0);
}

/**
 * Validates the file name, then runs `fn` under that file's version lock with
 * a {@link ProjectFileVersionLockContext} of already-locked primitives.
 * Lets callers (e.g. the write route) compose "snapshot current + write new
 * version" atomically with respect to other version writers.
 *
 * @param metadata Project metadata; forwarded to sandbox/base-dir availability checks.
 */
export async function withProjectFileVersionLock<T>(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  metadata: unknown,
  fn: (context: ProjectFileVersionLockContext) => Promise<T>,
): Promise<T> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  return withVersionFileLock(projectsRoot, projectId, safeName, () =>
    fn({
      safeName,
      createVersion: (content, options = {}) =>
        createProjectFileVersionUnlocked(projectsRoot, projectId, safeName, content, options),
      ensureCurrentVersion: (content, options = {}) =>
        ensureCurrentProjectFileVersionUnlocked(projectsRoot, projectId, safeName, content, options),
    }),
  );
}

/** @internal Trims a prompt string; empty/non-string becomes `null`. */
function normalizePrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** @internal Accepts a safe stored content filename or falls back to `<id>.html`. */
function normalizeContentPath(value: unknown, id: string): string {
  if (typeof value === 'string' && /^[A-Za-z0-9._-]+\.html$/u.test(value) && !value.includes('..')) {
    return value;
  }
  return `${id}.html`;
}

/** @internal Coerces a finite number or returns the fallback. */
function normalizeVersionNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** @internal Narrows an unknown value to a valid prompt-source union member. */
function normalizePromptSource(value: unknown): VersionPromptSource | undefined {
  return value === 'message' || value === 'project' || value === 'manual' || value === 'restore'
    ? value
    : undefined;
}

/** @internal Narrows an unknown value to a valid version-source union member. */
function normalizeVersionSource(value: unknown): VersionSource | undefined {
  return value === 'ai' || value === 'manual' || value === 'restore' ? value : undefined;
}

/** @internal Derives the version source, inferring `restore`/`manual` from prompt provenance when unset. */
function inferVersionSource(
  value: unknown,
  promptSource?: VersionPromptSource,
  restoreFromVersionId?: string,
): VersionSource {
  const normalized = normalizeVersionSource(value);
  if (normalized) return normalized;
  if (restoreFromVersionId || promptSource === 'restore') return 'restore';
  if (promptSource === 'manual') return 'manual';
  return 'ai';
}

/** @internal Validates one raw manifest entry; returns `null` when the id is unusable. */
function normalizeManifestEntry(raw: Record<string, unknown>, fileName: string, index: number): VersionEntry | null {
  const id = raw.id;
  if (typeof id !== 'string' || !VERSION_ID_RE.test(id)) return null;
  const version = normalizeVersionNumber(raw.version, index + 1);
  const promptSource = normalizePromptSource(raw.promptSource);
  const restoreFromVersionId =
    typeof raw.restoreFromVersionId === 'string' && VERSION_ID_RE.test(raw.restoreFromVersionId)
      ? raw.restoreFromVersionId
      : undefined;
  const entry: VersionEntry = {
    id,
    fileName,
    version,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : `Version ${version}`,
    createdAt: normalizeVersionNumber(raw.createdAt, Date.now()),
    source: inferVersionSource(raw.source, promptSource, restoreFromVersionId),
    prompt: normalizePrompt(raw.prompt),
    size: normalizeVersionNumber(raw.size, 0),
    mime: typeof raw.mime === 'string' ? raw.mime : mimeFor(fileName),
    kind: (typeof raw.kind === 'string' ? raw.kind : kindFor(fileName)) as ProjectFileKind,
    contentPath: normalizeContentPath(raw.contentPath, id),
  };
  if (promptSource) entry.promptSource = promptSource;
  if (restoreFromVersionId) {
    entry.restoreFromVersionId = restoreFromVersionId;
  }
  return entry;
}

/** @internal Extracts the valid entries array from a raw manifest document. */
function normalizeManifest(raw: unknown, fileName: string): VersionEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const entries = Array.isArray((raw as { entries?: unknown }).entries)
    ? (raw as { entries: unknown[] }).entries
    : [];
  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const normalized = normalizeManifestEntry(entry as Record<string, unknown>, fileName, index);
    return normalized ? [normalized] : [];
  });
}

/** @internal Full manifest state: entries plus the optional soft-delete timestamp. */
function normalizeManifestState(raw: unknown, fileName: string): VersionManifestState {
  const state: VersionManifestState = { entries: normalizeManifest(raw, fileName) };
  const deletedAt = raw && typeof raw === 'object'
    ? Number((raw as { deletedAt?: unknown }).deletedAt)
    : NaN;
  if (Number.isFinite(deletedAt) && deletedAt > 0) {
    state.deletedAt = deletedAt;
  }
  return state;
}

/** @internal Throws when the project's root is unavailable (e.g. sandboxed imported folder). */
function assertProjectAvailable(projectsRoot: string, projectId: string, metadata?: unknown): void {
  resolveProjectDir(projectsRoot, projectId, metadata);
}

/** @internal Reads + normalizes the manifest state; a missing manifest yields empty entries. */
async function readVersionManifestState(
  projectsRoot: string,
  projectId: string,
  fileName: string,
): Promise<VersionManifestState> {
  try {
    const raw = await readFile(path.join(versionRootFor(projectsRoot, projectId, fileName), VERSION_MANIFEST), 'utf8');
    return normalizeManifestState(JSON.parse(raw) as unknown, fileName);
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return { entries: [] };
    throw err;
  }
}

/** @internal Convenience: manifest entries only, without the soft-delete state. */
async function readVersionManifest(projectsRoot: string, projectId: string, fileName: string): Promise<VersionEntry[]> {
  return (await readVersionManifestState(projectsRoot, projectId, fileName)).entries;
}

/** @internal Persists the manifest document, preserving an optional `deletedAt` marker. */
async function writeVersionManifest(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  entries: VersionEntry[],
  options: { deletedAt?: number } = {},
): Promise<void> {
  const root = versionRootFor(projectsRoot, projectId, fileName);
  await mkdir(root, { recursive: true });
  const manifest: { schemaVersion: number; fileName: string; entries: VersionEntry[]; deletedAt?: number } = {
    schemaVersion: 1,
    fileName,
    entries,
  };
  if (typeof options.deletedAt === 'number' && Number.isFinite(options.deletedAt)) {
    manifest.deletedAt = options.deletedAt;
  }
  await writeFile(path.join(root, VERSION_MANIFEST), JSON.stringify(manifest, null, 2));
}

/** @internal Maps an internal entry to the contracts DTO, marking whether it is current. */
function publicVersion(entry: VersionEntry, currentId: string | null): ProjectFileVersion {
  const version: ProjectFileVersion = {
    id: entry.id,
    fileName: entry.fileName,
    version: entry.version,
    label: entry.label,
    createdAt: entry.createdAt,
    source: entry.source,
    prompt: entry.prompt,
    size: entry.size,
    mime: entry.mime,
    kind: entry.kind,
    current: currentId === entry.id,
  };
  if (entry.promptSource) version.promptSource = entry.promptSource;
  if (entry.restoreFromVersionId) version.restoreFromVersionId = entry.restoreFromVersionId;
  return version;
}

/** @internal The newest entry's id (manifest order is append-only), or `null` when empty. */
function currentVersionId(entries: VersionEntry[]): string | null {
  return entries.at(-1)?.id ?? null;
}

/** @internal Default label for a new version, annotating restores with their origin version. */
function nextLabel(version: number, restoredFrom?: VersionEntry | null): string {
  if (!restoredFrom) return `Version ${version}`;
  return Number.isFinite(restoredFrom.version)
    ? `Version ${version} · restored from v${restoredFrom.version}`
    : `Version ${version}`;
}

/**
 * @internal
 * Validates a caller-supplied file name and refuses paths inside the version
 * store itself (surfaced as ENOENT so the store stays invisible to file APIs).
 */
function validateUserFileName(fileName: string): string {
  const safeName = validateProjectPath(fileName);
  if (isProjectFileVersionPath(safeName)) {
    throw codedError('file not found', 'ENOENT');
  }
  return safeName;
}

/**
 * True when a project-relative path points inside the `.file-versions` store.
 * File routes use this to hide version-store internals from normal file APIs.
 */
export function isProjectFileVersionPath(raw: unknown): boolean {
  const value = String(raw ?? '').replace(/\\/g, '/');
  return value.split('/').filter(Boolean).includes(VERSION_ROOT);
}

/**
 * Lists the stored versions of one project file (oldest first), marking the
 * newest entry as current.
 *
 * @returns Contracts DTOs; empty when the file has no version history.
 */
export async function listProjectFileVersions(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  metadata?: unknown,
): Promise<ProjectFileVersion[]> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const entries = await readVersionManifest(projectsRoot, projectId, safeName);
  const currentId = currentVersionId(entries);
  return entries.map((entry) => publicVersion(entry, currentId));
}

/**
 * Reads one stored version's metadata and full content.
 *
 * @throws EINVAL for a malformed version id; ENOENT when the version is unknown.
 */
export async function readProjectFileVersion(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  versionId: string,
  metadata?: unknown,
): Promise<{ version: ProjectFileVersion; content: string }> {
  const safeName = validateUserFileName(fileName);
  const safeVersionId = String(versionId || '').trim();
  if (!safeVersionId || !VERSION_ID_RE.test(safeVersionId)) {
    throw codedError('version id required', 'EINVAL');
  }
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const entries = await readVersionManifest(projectsRoot, projectId, safeName);
  const currentId = currentVersionId(entries);
  const entry = entries.find((item) => item.id === safeVersionId);
  if (!entry) {
    throw codedError('version not found', 'ENOENT');
  }
  const content = await readFile(path.join(versionRootFor(projectsRoot, projectId, safeName), entry.contentPath), 'utf8');
  return {
    version: publicVersion(entry, currentId),
    content,
  };
}

/**
 * Appends a new version of a file to its store under the per-file lock.
 * A store previously marked deleted is wiped first unless this write restores
 * one of its surviving entries.
 */
export async function createProjectFileVersion(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  content: string,
  options: CreateProjectFileVersionOptions = {},
  metadata?: unknown,
): Promise<ProjectFileVersion> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  return withVersionFileLock(projectsRoot, projectId, safeName, () =>
    createProjectFileVersionUnlocked(projectsRoot, projectId, safeName, content, options),
  );
}

/** @internal Lock-free core of version creation; callers must already hold the file lock. */
async function createProjectFileVersionUnlocked(
  projectsRoot: string,
  projectId: string,
  safeName: string,
  content: string,
  options: CreateProjectFileVersionOptions,
): Promise<ProjectFileVersion> {
  const root = versionRootFor(projectsRoot, projectId, safeName);
  await mkdir(root, { recursive: true });
  const state = await readVersionManifestState(projectsRoot, projectId, safeName);
  const preserveDeletedHistory =
    typeof options.restoreFromVersionId === 'string' &&
    state.entries.some((entry) => entry.id === options.restoreFromVersionId);
  let entries = state.entries;
  if (state.deletedAt && !preserveDeletedHistory) {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    entries = [];
  }
  const restoredFrom = typeof options.restoreFromVersionId === 'string'
    ? entries.find((entry) => entry.id === options.restoreFromVersionId) ?? null
    : null;
  const now = Date.now();
  const version = entries.reduce((max, entry) => Math.max(max, Number(entry.version) || 0), 0) + 1;
  const id = randomUUID();
  const contentPath = `${String(version).padStart(4, '0')}-${id}.html`;
  const text = String(content ?? '');
  const entry: VersionEntry = {
    id,
    fileName: safeName,
    version,
    label: typeof options.label === 'string' && options.label.trim()
      ? options.label.trim()
      : nextLabel(version, restoredFrom),
    createdAt: now,
    source: inferVersionSource(options.source, options.promptSource, options.restoreFromVersionId),
    prompt: normalizePrompt(options.prompt),
    size: Buffer.byteLength(text),
    mime: mimeFor(safeName),
    kind: kindFor(safeName) as ProjectFileKind,
    contentPath,
  };
  if (options.promptSource) entry.promptSource = options.promptSource;
  if (typeof options.restoreFromVersionId === 'string' && VERSION_ID_RE.test(options.restoreFromVersionId)) {
    entry.restoreFromVersionId = options.restoreFromVersionId;
  }
  await writeFile(path.join(root, contentPath), text);
  const nextEntries = [...entries, entry];
  await writeVersionManifest(projectsRoot, projectId, safeName, nextEntries);
  return publicVersion(entry, id);
}

/**
 * Soft-deletes an HTML file's version store when the file itself is deleted:
 * history is kept on disk with a `deletedAt` marker so a later restore can
 * still resurrect it, while a later fresh write starts clean.
 */
export async function markProjectFileVersionStoreDeleted(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  metadata?: unknown,
): Promise<void> {
  const safeName = validateUserFileName(fileName);
  if (!/\.html?$/i.test(safeName)) return;
  assertProjectAvailable(projectsRoot, projectId, metadata);
  await withVersionFileLock(projectsRoot, projectId, safeName, async () => {
    const state = await readVersionManifestState(projectsRoot, projectId, safeName);
    if (state.entries.length === 0) return;
    await writeVersionManifest(projectsRoot, projectId, safeName, state.entries, {
      deletedAt: Date.now(),
    });
  });
}

/**
 * Moves an HTML file's version store when the file is renamed, holding both
 * file locks. Handles every target state: fast-path directory rename, a
 * soft-deleted source (history discarded), a soft-deleted target (replaced),
 * and a live target (histories merged without duplicating version ids).
 */
export async function renameProjectFileVersionStore(
  projectsRoot: string,
  projectId: string,
  fromName: string,
  toName: string,
  metadata?: unknown,
): Promise<void> {
  const safeFrom = validateUserFileName(fromName);
  const safeTo = validateUserFileName(toName);
  if (safeFrom === safeTo) return;
  if (!/\.html?$/i.test(safeFrom) || !/\.html?$/i.test(safeTo)) return;

  assertProjectAvailable(projectsRoot, projectId, metadata);
  await withVersionFileLocks(projectsRoot, projectId, [safeFrom, safeTo], async () => {
    const oldRoot = versionRootFor(projectsRoot, projectId, safeFrom);
    const newRoot = versionRootFor(projectsRoot, projectId, safeTo);
    try {
      await stat(oldRoot);
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return;
      throw err;
    }

    const fromState = await readVersionManifestState(projectsRoot, projectId, safeFrom);
    if (fromState.deletedAt) {
      await rm(oldRoot, { recursive: true, force: true });
      const toState = await readVersionManifestState(projectsRoot, projectId, safeTo);
      if (toState.deletedAt) {
        await rm(newRoot, { recursive: true, force: true });
      }
      return;
    }

    const renamedEntries = fromState.entries.map((entry) => ({ ...entry, fileName: safeTo }));

    try {
      await rename(oldRoot, newRoot);
      await writeVersionManifest(projectsRoot, projectId, safeTo, renamedEntries);
      return;
    } catch (err) {
      if (!isExistingTargetError(err)) throw err;
    }

    const existingState = await readVersionManifestState(projectsRoot, projectId, safeTo);
    if (existingState.deletedAt) {
      await rm(newRoot, { recursive: true, force: true });
      await rename(oldRoot, newRoot);
      await writeVersionManifest(projectsRoot, projectId, safeTo, renamedEntries);
      return;
    }

    await mkdir(newRoot, { recursive: true });
    const existingEntries = existingState.entries;
    const existingIds = new Set(existingEntries.map((entry) => entry.id));
    for (const entry of renamedEntries) {
      if (existingIds.has(entry.id)) continue;
      try {
        await rename(path.join(oldRoot, entry.contentPath), path.join(newRoot, entry.contentPath));
      } catch (err) {
        if (errorCode(err) !== 'ENOENT' && errorCode(err) !== 'EEXIST') throw err;
      }
    }
    await writeVersionManifest(projectsRoot, projectId, safeTo, [
      ...existingEntries,
      ...renamedEntries.filter((entry) => !existingIds.has(entry.id)),
    ]);
    await rm(oldRoot, { recursive: true, force: true });
  });
}

/**
 * Guarantees the store's newest version matches `content`: no-ops when the
 * latest stored content is byte-identical, otherwise appends a new version.
 * Only applies to HTML files (returns `null` for other kinds). Used to
 * snapshot the pre-edit state before an agent run rewrites a file.
 */
export async function ensureCurrentProjectFileVersion(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  content: string,
  options: CreateProjectFileVersionOptions = {},
  metadata?: unknown,
): Promise<ProjectFileVersion | null> {
  const safeName = validateUserFileName(fileName);
  if (!/\.html?$/i.test(safeName)) return null;
  assertProjectAvailable(projectsRoot, projectId, metadata);
  return withVersionFileLock(projectsRoot, projectId, safeName, () =>
    ensureCurrentProjectFileVersionUnlocked(projectsRoot, projectId, safeName, content, options),
  );
}

/** @internal Lock-free core of {@link ensureCurrentProjectFileVersion}; callers hold the file lock. */
async function ensureCurrentProjectFileVersionUnlocked(
  projectsRoot: string,
  projectId: string,
  safeName: string,
  content: string,
  options: CreateProjectFileVersionOptions,
): Promise<ProjectFileVersion | null> {
  if (!/\.html?$/i.test(safeName)) return null;
  const text = String(content ?? '');
  const state = await readVersionManifestState(projectsRoot, projectId, safeName);
  if (!state.deletedAt) {
    const latest = state.entries.at(-1);
    if (latest?.contentPath) {
      try {
        const prior = await readFile(path.join(versionRootFor(projectsRoot, projectId, safeName), latest.contentPath), 'utf8');
        if (prior === text) return publicVersion(latest, latest.id);
      } catch (err) {
        if (errorCode(err) !== 'ENOENT') throw err;
      }
    }
  }
  return createProjectFileVersionUnlocked(projectsRoot, projectId, safeName, text, options);
}

/**
 * Test/diagnostic helper: the store directory, its raw entries, and mtime for
 * one file's version root. Missing stores yield empty entries and mtime 0
 * instead of throwing.
 */
export async function getProjectFileVersionRootStats(
  projectsRoot: string,
  projectId: string,
  fileName: string,
  metadata?: unknown,
): Promise<{ root: string; entries: string[]; mtime: number }> {
  const safeName = validateUserFileName(fileName);
  assertProjectAvailable(projectsRoot, projectId, metadata);
  const root = versionRootFor(projectsRoot, projectId, safeName);
  const entries = await readdir(root).catch(() => []);
  const st = await stat(root).catch(() => null);
  return { root, entries, mtime: st?.mtimeMs ?? 0 };
}
