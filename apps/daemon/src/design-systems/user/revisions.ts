import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { randomUUID } from 'node:crypto';

import { isAbsenceError, sanitizeRelativeFilePath } from '../core/file-utils.js';
import {
  cleanMultiline,
  cleanText,
  isDesignSystemArtifactMode,
  isDesignSystemRevisionStatus,
  normalizeBody,
} from '../core/body.js';
import type {
  AtomicTextFileSnapshot,
  AtomicTextFileWrite,
  DesignSystemRevision,
  DesignSystemRevisionFileChange,
  UserDesignSystemMetadata,
} from '../core/types.js';

export { isDesignSystemArtifactMode };

// `cleanProjectIdForMetadata`, `normalizeArtifactMode`, and `readUserMetadata` are
// foundational metadata primitives shared by both the read (catalog) and write (user)
// layers; they live in `core/metadata.ts`. Import them from `../core/index.js`.

/**
 * Writes `metadata` as JSON to `<root>/<id>/metadata.json`.
 * The directory must already exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Directory name of the specific design system.
 * @param metadata - Metadata object to serialise.
 */
export async function writeUserMetadata(
  root: string,
  id: string,
  metadata: UserDesignSystemMetadata,
): Promise<void> {
  await writeFile(
    path.join(root, id, 'metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Validates a revision ID string: non-empty, alphanumeric + hyphens only.
 *
 * @param raw - Raw revision ID from user input or a stored file name.
 * @returns Trimmed valid ID, or `null` if invalid.
 */
export function sanitizeRevisionId(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^[a-zA-Z0-9-]+$/.test(value) ? value : null;
}

/**
 * Parses an unknown value as a `DesignSystemRevision`, enforcing required fields
 * and re-binding the `designSystemId`. Unknown or invalid fields are stripped.
 *
 * @param raw - Parsed JSON from a revision file.
 * @param designSystemId - Canonical design-system ID to bind into the result.
 * @returns A valid `DesignSystemRevision`, or `null` if required fields are missing.
 */
export function parseDesignSystemRevision(
  raw: unknown,
  designSystemId: string,
): DesignSystemRevision | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<DesignSystemRevision>;
  const id = sanitizeRevisionId(value.id);
  const feedback = cleanMultiline(value.feedback);
  const baseBody = normalizeBody(value.baseBody);
  const proposedBody = normalizeBody(value.proposedBody);
  if (!id || !feedback || !baseBody || !proposedBody) return null;
  return {
    id,
    designSystemId,
    status: isDesignSystemRevisionStatus(value.status) ? value.status : 'pending',
    feedback,
    baseBody,
    proposedBody,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    ...(cleanText(value.sectionTitle) ? { sectionTitle: cleanText(value.sectionTitle) } : {}),
    ...(typeof value.jobId === 'string' ? { jobId: value.jobId } : {}),
    ...(normalizeRevisionFileChanges(value.fileChanges).length > 0
      ? { fileChanges: normalizeRevisionFileChanges(value.fileChanges) }
      : {}),
  };
}

/**
 * Validates and deduplicates an array of `DesignSystemRevisionFileChange` items.
 * Paths are sanitised; entries exceeding 200 KB or with duplicate paths are dropped.
 *
 * @param raw - Untrusted array from an API request or stored JSON.
 * @returns Normalised, deduplicated array of file changes.
 */
export function normalizeRevisionFileChanges(raw: unknown): DesignSystemRevisionFileChange[] {
  if (!Array.isArray(raw)) return [];
  const out: DesignSystemRevisionFileChange[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const cleanPath = typeof record.path === 'string' ? sanitizeRelativeFilePath(record.path) : null;
    if (!cleanPath || seen.has(cleanPath)) continue;
    const baseContent = typeof record.baseContent === 'string' ? record.baseContent : '';
    const proposedContent = typeof record.proposedContent === 'string' ? record.proposedContent : '';
    if (proposedContent.length > 200_000 || baseContent.length > 200_000) continue;
    seen.add(cleanPath);
    out.push({ path: cleanPath, baseContent, proposedContent });
  }
  return out;
}

/**
 * Writes a revision record as `<root>/<id>/revisions/<revision.id>.json`.
 * Creates the `revisions/` directory if it does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Directory name of the specific design system.
 * @param revision - Validated revision to persist.
 */
export async function writeUserDesignSystemRevision(
  root: string,
  id: string,
  revision: DesignSystemRevision,
): Promise<void> {
  await mkdir(path.join(root, id, 'revisions'), { recursive: true });
  await writeFile(
    path.join(root, id, 'revisions', `${revision.id}.json`),
    `${JSON.stringify(revision, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Converts `fileChanges` from an accepted revision into `AtomicTextFileWrite`
 * entries, resolving paths relative to `<root>/<dirId>` and filtering out
 * protected paths (`DESIGN.md`, `metadata.json`, `revisions/`).
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param dirId - Bare directory name (no `user:` prefix).
 * @param fileChanges - Raw file changes from the revision, normalised internally.
 * @returns Array of atomic write descriptors safe to pass to `writeTextFilesAtomically`.
 */
export function revisionFileChangeWrites(
  root: string,
  dirId: string,
  fileChanges: DesignSystemRevisionFileChange[] | undefined,
): AtomicTextFileWrite[] {
  const changes = normalizeRevisionFileChanges(fileChanges);
  if (changes.length === 0) return [];
  const base = path.join(root, dirId);
  const resolvedBase = path.resolve(base);
  const writes: AtomicTextFileWrite[] = [];
  for (const change of changes) {
    if (
      change.path === 'DESIGN.md'
      || change.path === 'metadata.json'
      || change.path.startsWith('revisions/')
    ) {
      continue;
    }
    const target = path.resolve(base, change.path);
    if (target !== resolvedBase && !target.startsWith(`${resolvedBase}${path.sep}`)) continue;
    writes.push({ targetPath: target, content: change.proposedContent });
  }
  return writes;
}

/**
 * @internal
 * Rolls back successfully applied writes after a partial failure, restoring
 * original content from `snapshots`. Errors during rollback are swallowed to
 * preserve the original failure as the actionable error.
 *
 * @param applied - Absolute paths written so far, in order of application.
 * @param snapshots - Pre-write content snapshots keyed by absolute path.
 */
async function rollbackAtomicTextFileWrites(
  applied: string[],
  snapshots: Map<string, AtomicTextFileSnapshot>,
): Promise<void> {
  for (const targetPath of applied.reverse()) {
    const snapshot = snapshots.get(targetPath);
    try {
      if (snapshot?.existed) {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, snapshot.content, 'utf8');
      } else {
        await rm(targetPath, { force: true });
      }
    } catch {
      // Keep the original write failure as the actionable error.
    }
  }
}

/**
 * Commits a batch of file writes atomically using a write-then-rename strategy:
 * all files are staged under a temporary directory inside `base`, then each
 * renamed into place. On failure, previously renamed files are restored from
 * pre-write snapshots.
 *
 * De-duplicates the write list by `targetPath` (last write wins).
 *
 * @param base - Absolute directory used for the staging temp folder.
 * @param writes - Write descriptors; duplicate target paths are de-duplicated.
 */
export async function writeTextFilesAtomically(base: string, writes: AtomicTextFileWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const deduped = [...new Map(writes.map((write) => [write.targetPath, write])).values()];
  const snapshots = new Map<string, AtomicTextFileSnapshot>();
  for (const write of deduped) {
    try {
      snapshots.set(write.targetPath, {
        existed: true,
        content: await readFile(write.targetPath, 'utf8'),
      });
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
      snapshots.set(write.targetPath, { existed: false });
    }
  }
  const tempDir = path.join(base, `.tmp-revision-accept-${randomUUID()}`);
  const stagedWrites: Array<AtomicTextFileWrite & { tempPath: string }> = [];
  await mkdir(tempDir, { recursive: true });
  try {
    for (const [index, write] of deduped.entries()) {
      const tempPath = path.join(tempDir, `${index}.tmp`);
      await writeFile(tempPath, write.content, 'utf8');
      stagedWrites.push({ ...write, tempPath });
    }
    for (const write of stagedWrites) {
      await mkdir(path.dirname(write.targetPath), { recursive: true });
    }
    const applied: string[] = [];
    try {
      for (const write of stagedWrites) {
        await rename(write.tempPath, write.targetPath);
        applied.push(write.targetPath);
      }
    } catch (err) {
      await rollbackAtomicTextFileWrites(applied, snapshots);
      throw err;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
