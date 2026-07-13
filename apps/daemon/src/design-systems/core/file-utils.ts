/** @module file-utils
 * Atomic file write helpers for design system packages: snapshot-before-write, multi-file commit, and rollback on failure.
 * Also provides directory listing, file classification, and the manifest reader used by the catalog layer.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  DesignSystemFileKind,
  DesignSystemFileSummary,
  DesignSystemProjectManifest,
} from './types.js';

/**
 * Returns `true` when `err` is a filesystem absence error (`ENOENT` or `ENOTDIR`).
 * Used throughout the module to distinguish "file not found" from real I/O failures.
 *
 * @param err - The caught value from a try/catch block.
 */
export function isAbsenceError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Reads a file as UTF-8, returning `undefined` instead of throwing when the
 * file does not exist. Re-throws all other I/O errors.
 *
 * @param file - Absolute path to the file.
 * @returns File content, or `undefined` if absent.
 */
export async function readFileOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if (isAbsenceError(err)) return undefined;
    throw err;
  }
}

/**
 * Returns `true` when `relativePath` is safe to resolve inside a brand root —
 * non-empty, not absolute, and free of `.` / `..` path segments.
 *
 * @param relativePath - The path to validate.
 */
export function isSafeManifestPath(relativePath: string): boolean {
  if (relativePath.trim().length === 0) return false;
  if (path.isAbsolute(relativePath)) return false;
  const parts = relativePath.split(/[\\/]+/);
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

/**
 * Reads a manifest-declared file relative to a brand root, guarding against
 * path traversal. Returns `undefined` when the path fails the safety check or
 * the file is absent.
 *
 * @param brandRoot - Absolute path to the design-system directory.
 * @param relativePath - Path declared by `manifest.json` (validated by `isSafeManifestPath`).
 */
export async function readManifestFileOptional(
  brandRoot: string,
  relativePath: string,
): Promise<string | undefined> {
  if (!isSafeManifestPath(relativePath)) return undefined;
  return readFileOptional(path.join(brandRoot, relativePath));
}

/**
 * Strips an optional `prefix` from `id` and validates the remainder as a safe
 * filesystem directory name (alphanumeric, `.`, `_`, `-`; no traversal components).
 *
 * @param id - Incoming design-system identifier (e.g. `"user:my-brand"`).
 * @param prefix - Optional prefix to strip before validation (e.g. `"user:"`).
 * @returns The validated directory name, or `null` if the input is invalid.
 */
export function stripPrefixAndValidateId(id: string, prefix = ''): string | null {
  if (typeof id !== 'string') return null;
  if (prefix && !id.startsWith(prefix)) return null;
  const dirId = prefix ? id.slice(prefix.length) : id;
  if (!/^[a-zA-Z0-9._-]+$/.test(dirId)) return null;
  if (dirId === '.' || dirId === '..') return null;
  return dirId;
}

/**
 * Normalises and validates a caller-supplied relative file path, rejecting
 * absolute paths, null bytes, and any form of directory traversal.
 *
 * @param raw - Raw path from user input or an API request.
 * @returns POSIX-normalised relative path, or `null` if the input is unsafe.
 */
export function sanitizeRelativeFilePath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.includes('\0') || path.posix.isAbsolute(trimmed))
    return null;
  const normalized = path.posix.normalize(trimmed);
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) {
    return null;
  }
  return normalized;
}

/**
 * Classifies a design-system file by its extension and whether it is a directory.
 *
 * @param relativePath - POSIX-style relative path within the design-system package.
 * @param isDirectory - Whether the path refers to a directory entry.
 * @returns A `DesignSystemFileKind` tag.
 */
export function classifyDesignSystemFile(
  relativePath: string,
  isDirectory: boolean,
): DesignSystemFileKind {
  if (isDirectory) return 'folder';
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.html') return 'page';
  if (ext === '.css') return 'stylesheet';
  if (ext === '.md') return 'document';
  if (ext === '.json') return 'data';
  if (['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  return 'asset';
}

/**
 * Returns `true` for file extensions that should be transferred as UTF-8 text
 * rather than base64 binary when serving pull-file content.
 *
 * @param relativePath - POSIX-style relative path within the design-system package.
 */
export function isTextDesignSystemPullFile(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return new Set([
    '.css', '.html', '.js', '.jsx', '.json', '.md', '.mjs',
    '.svg', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml',
  ]).has(ext);
}

/**
 * Returns `true` when `filePath` points to an existing file (not a directory).
 * Returns `false` on absence; re-throws other I/O errors.
 *
 * @param filePath - Absolute path to check.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const existing = await stat(filePath);
    return existing.isFile();
  } catch (err) {
    if (isAbsenceError(err)) return false;
    throw err;
  }
}

/**
 * Recursively collects all non-hidden file and directory entries under `base/relativeDir`,
 * omitting `metadata.json` and `revisions/` at the top level (internal daemon state).
 * Appends results into `files`; the caller owns the array.
 *
 * @param base - Absolute root of the design-system directory.
 * @param relativeDir - Sub-path being scanned relative to `base` (empty string for root).
 * @param files - Accumulator array mutated in place.
 */
export async function collectDesignSystemFiles(
  base: string,
  relativeDir: string,
  files: DesignSystemFileSummary[],
): Promise<void> {
  const dir = path.join(base, relativeDir);
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) continue;
    if (!relativeDir && (entry.name === 'metadata.json' || entry.name === 'revisions')) continue;
    const relativePath = relativeDir
      ? path.posix.join(relativeDir.replaceAll(path.sep, '/'), entry.name)
      : entry.name;
    const fullPath = path.join(base, relativePath);
    const stats = await stat(fullPath);
    files.push({
      path: relativePath,
      name: entry.name,
      kind: classifyDesignSystemFile(relativePath, entry.isDirectory()),
      ...(entry.isDirectory() ? {} : { size: stats.size }),
      updatedAt: stats.mtime.toISOString(),
    });
    if (entry.isDirectory()) {
      await collectDesignSystemFiles(base, relativePath, files);
    }
  }
}

/**
 * @internal
 * Validates that a parsed JSON object matches the `od-design-system-project/v1`
 * manifest schema and declares the expected `id`.
 */
function isProjectManifest(value: unknown, expectedId: string): value is DesignSystemProjectManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 'od-design-system-project/v1') return false;
  if (record.id !== expectedId) return false;
  if (typeof record.name !== 'string' || record.name.trim().length === 0) return false;
  if (typeof record.category !== 'string' || record.category.trim().length === 0) return false;
  if (record.description !== undefined && typeof record.description !== 'string') return false;
  const files = record.files;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return false;
  const fileRecord = files as Record<string, unknown>;
  return (
    fileRecord.design === 'DESIGN.md' &&
    fileRecord.tokens === 'tokens.css' &&
    (fileRecord.designTokens === undefined || fileRecord.designTokens === 'design-tokens.json') &&
    (fileRecord.tailwind === undefined || fileRecord.tailwind === 'tailwind-v4.css') &&
    (fileRecord.components === undefined || fileRecord.components === 'components.html')
  );
}

/**
 * Reads and parses `<brandRoot>/manifest.json`, returning a validated
 * `DesignSystemProjectManifest` or `null` when the file is absent, unparseable,
 * or fails schema validation (including an `id` mismatch).
 *
 * @param brandRoot - Absolute path to the design-system directory.
 * @param expectedId - Directory name that the manifest `id` field must equal.
 */
export async function readProjectManifest(
  brandRoot: string,
  expectedId: string,
): Promise<DesignSystemProjectManifest | null> {
  let raw: string | undefined;
  try {
    raw = await readFileOptional(path.join(brandRoot, 'manifest.json'));
  } catch {
    return null;
  }
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isProjectManifest(parsed, expectedId)) return null;
    return parsed;
  } catch {
    return null;
  }
}
