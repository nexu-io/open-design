// Snapshot capture: SQLite intent -> hashed temp -> atomic install -> ready.
//
// THE ORDERING IS THE POINT. The filesystem and SQLite cannot share a
// transaction, so every capture writes a durable intent FIRST (carrying the
// temp key and the expectation it must satisfy), only then touches bytes, and
// only flips to `ready` once the bytes are installed and re-hashed. A crash at
// any step leaves a row the reconciler can classify — never a silent half-state
// and never bytes the daemon cannot account for.
//
// THE OTHER POINT: a capture that cannot prove it holds the EXACT bytes of that
// turn fails. It never falls back to "whatever is at that path now". A failed
// snapshot is an honest gap; a substituted one is fabricated history.

import type Database from 'better-sqlite3';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

import type { ChatArtifactBlobStore } from './blob-store.js';
import { chatArtifactKindStoresOriginalBytes } from './policy.js';
import {
  ensureWorkspaceArtifactForPath,
  getChatArtifactBlob,
  insertSnapshotIntent,
  markSnapshotFailed,
  markSnapshotReady,
  upsertChatArtifactBlob,
} from './store.js';
import {
  DEFAULT_CHAT_ARTIFACT_QUOTA,
  projectSnapshotBytes,
  totalSnapshotBytes,
  type ChatArtifactQuota,
} from './quota.js';
import type { ChatArtifactFailureCode } from './types.js';

export interface ChatArtifactCaptureDeps {
  db: Database.Database;
  blobs: ChatArtifactBlobStore;
  quota?: ChatArtifactQuota;
  now?: () => number;
}

/** Which digest column the captured bytes populate. */
export type ChatArtifactCaptureRole = 'content' | 'thumbnail';

export interface CaptureFromBytesInput {
  projectId: string;
  /** Project-relative, forward-slash. Recorded as capture-time history. */
  projectRelativePath: string;
  kind: string;
  mime?: string;
  bytes: Buffer;
  role?: ChatArtifactCaptureRole;
  runId?: string;
  mediaTaskId?: string;
  /** Advance the Design Files latest pointer with these bytes. */
  advanceWorkspaceLatest?: boolean;
  sourceMtime?: number;
}

export interface CaptureFromPathInput {
  projectId: string;
  projectRelativePath: string;
  kind: string;
  mime?: string;
  absolutePath: string;
  role?: ChatArtifactCaptureRole;
  runId?: string;
  mediaTaskId?: string;
  /**
   * The fingerprint the terminal chokepoint observed. When present it is a
   * precondition, not a hint: a mismatch fails the capture as `source_changed`.
   */
  expected?: { size?: number; mtimeMs?: number };
}

export interface ChatArtifactCaptureResult {
  /** Empty string when `state` is `skipped` — no snapshot row was written. */
  snapshotId: string;
  workspaceArtifactId: string;
  /**
   * `skipped` means this kind's policy does not store original bytes at all
   * (user ruling 2026-09-02: video / audio). It is deliberately NOT `failed`:
   * nothing was attempted, so nothing is missing, and the card falls back to
   * the live workspace file exactly as a legacy message does. Reporting it as
   * a failure would bury the real failures — quota, drift, renderer — that the
   * state exists to surface.
   */
  state: 'ready' | 'failed' | 'skipped';
  failureCode?: ChatArtifactFailureCode;
  contentDigest?: string;
  byteSize?: number;
}

/**
 * Whether this capture is allowed to copy original bytes into the blob store.
 *
 * A `thumbnail` capture is exempt on purpose: a cover is a rendering OF the
 * file, never the file itself, so it is governed by `wantsStaticCover` rather
 * than `capturesContent`. Keying the gate on kind alone would have silently
 * killed every HTML card's cover, since `html` also declines to store originals.
 */
function mayStoreOriginalBytes(kind: string, role: ChatArtifactCaptureRole): boolean {
  return role !== 'content' || chatArtifactKindStoresOriginalBytes(kind);
}

function skipped(workspaceArtifactId: string): ChatArtifactCaptureResult {
  return { snapshotId: '', workspaceArtifactId, state: 'skipped' };
}

function quotaOf(deps: ChatArtifactCaptureDeps): ChatArtifactQuota {
  return deps.quota ?? DEFAULT_CHAT_ARTIFACT_QUOTA;
}

function nowOf(deps: ChatArtifactCaptureDeps): number {
  return deps.now ? deps.now() : Date.now();
}

/**
 * Capture bytes the daemon already holds in memory.
 *
 * This is the STRONG path (spec §5.1.1): the provider handed us these exact
 * bytes, so there is no filesystem race to lose. Nothing is re-read from a
 * path that a later turn may already have overwritten.
 */
export async function captureChatArtifactSnapshotFromBytes(
  deps: ChatArtifactCaptureDeps,
  input: CaptureFromBytesInput,
): Promise<ChatArtifactCaptureResult> {
  const now = nowOf(deps);
  const role: ChatArtifactCaptureRole = input.role ?? 'content';
  const digest = `sha256:${createHash('sha256').update(input.bytes).digest('hex')}`;
  const byteSize = input.bytes.byteLength;

  // `advanceWorkspaceLatest: false` means these bytes are a rendering OF the
  // file, not the file — a cover. So every fact that describes the file's
  // CONTENT stays out, MIME INCLUDED. `image/jpeg` is true of a video's poster
  // and false of the video; letting it through would restamp the mutable Design
  // Files identity that the card's click resolves through, and `mime` is written
  // with COALESCE, so a non-null value overwrites rather than fills in. The row
  // is still ensured to EXIST, because that identity must survive a cover that
  // never lands.
  const workspaceArtifact = ensureWorkspaceArtifactForPath(deps.db, {
    projectId: input.projectId,
    path: input.projectRelativePath,
    kind: input.kind,
    ...(input.advanceWorkspaceLatest === false
      ? {}
      : {
          mime: input.mime ?? null,
          digest,
          size: byteSize,
          mtime: input.sourceMtime ?? now,
        }),
    now,
  });

  // The gate sits AFTER the latest pointer on purpose. Dropping the frozen copy
  // must not drop the mutable Design Files identity: that pointer is what the
  // card's click resolves through, and it is one row, not a blob.
  if (!mayStoreOriginalBytes(input.kind, role)) return skipped(workspaceArtifact.id);

  const tempKey = deps.blobs.newTempKey();
  const snapshotId = randomUUID();
  insertSnapshotIntent(deps.db, {
    id: snapshotId,
    projectId: input.projectId,
    workspaceArtifactId: workspaceArtifact.id,
    sourcePathAtCapture: input.projectRelativePath,
    kind: input.kind,
    mime: input.mime ?? null,
    runId: input.runId ?? null,
    mediaTaskId: input.mediaTaskId ?? null,
    expectedSize: byteSize,
    expectedMtime: input.sourceMtime ?? null,
    // In-memory bytes let us record the exact expectation up front, which is
    // what makes crash recovery for this path deterministic.
    expectedDigest: digest,
    tempKey,
    now,
  });

  const budget = checkBudget(deps, {
    projectId: input.projectId,
    byteSize,
    role,
    digest,
  });
  if (budget) {
    markSnapshotFailed(deps.db, snapshotId, budget);
    return failure(snapshotId, workspaceArtifact.id, budget);
  }

  try {
    await deps.blobs.writeTempFromBytes(tempKey, input.bytes);
    const storageKey = await deps.blobs.installTemp(tempKey, digest);
    commitReady(deps, {
      snapshotId,
      role,
      digest,
      storageKey,
      byteSize,
      mime: input.mime ?? null,
      sourceSize: byteSize,
      sourceMtime: input.sourceMtime ?? null,
      now,
    });
  } catch (err) {
    await deps.blobs.discardTemp(tempKey);
    markSnapshotFailed(deps.db, snapshotId, 'internal_error');
    logCaptureFailure('bytes', input.projectRelativePath, err);
    return failure(snapshotId, workspaceArtifact.id, 'internal_error');
  }

  return {
    snapshotId,
    workspaceArtifactId: workspaceArtifact.id,
    state: 'ready',
    contentDigest: digest,
    byteSize,
  };
}

/**
 * Capture bytes that only exist at a path.
 *
 * This is the GENERIC path (spec §5.1.2) for shell / Write / Edit writes. It
 * stats before and after the copy and refuses on any drift: the file is a
 * moving target, so "the copy completed" is not sufficient evidence that the
 * copy is of the right version.
 */
export async function captureChatArtifactSnapshotFromPath(
  deps: ChatArtifactCaptureDeps,
  input: CaptureFromPathInput,
): Promise<ChatArtifactCaptureResult> {
  const now = nowOf(deps);
  const role: ChatArtifactCaptureRole = input.role ?? 'content';

  const workspaceArtifact = ensureWorkspaceArtifactForPath(deps.db, {
    projectId: input.projectId,
    path: input.projectRelativePath,
    kind: input.kind,
    mime: input.mime ?? null,
    now,
  });

  // Same gate as the in-memory path, for the same reason: this is a chokepoint,
  // not a helper. `run-capture` already routes non-storing kinds to the latest
  // pointer before it ever gets here, so today this is defence in depth — it is
  // what stops the next call site from reintroducing the exclusion as a bug.
  if (!mayStoreOriginalBytes(input.kind, role)) return skipped(workspaceArtifact.id);

  let before: fs.Stats;
  try {
    before = await fs.promises.stat(input.absolutePath);
  } catch {
    const snapshotId = recordImmediateFailure(deps, {
      input,
      workspaceArtifactId: workspaceArtifact.id,
      now,
      failureCode: 'source_missing',
    });
    return failure(snapshotId, workspaceArtifact.id, 'source_missing');
  }

  // The chokepoint's fingerprint is a precondition. If the file already moved
  // on, the turn's bytes are gone; copying today's file would be fabrication.
  if (!fingerprintMatches(input.expected, before)) {
    const snapshotId = recordImmediateFailure(deps, {
      input,
      workspaceArtifactId: workspaceArtifact.id,
      now,
      failureCode: 'source_changed',
    });
    return failure(snapshotId, workspaceArtifact.id, 'source_changed');
  }

  const tempKey = deps.blobs.newTempKey();
  const snapshotId = randomUUID();
  insertSnapshotIntent(deps.db, {
    id: snapshotId,
    projectId: input.projectId,
    workspaceArtifactId: workspaceArtifact.id,
    sourcePathAtCapture: input.projectRelativePath,
    kind: input.kind,
    mime: input.mime ?? null,
    runId: input.runId ?? null,
    mediaTaskId: input.mediaTaskId ?? null,
    expectedSize: before.size,
    expectedMtime: before.mtimeMs,
    expectedDigest: null,
    tempKey,
    now,
  });

  const budget = checkBudget(deps, {
    projectId: input.projectId,
    byteSize: before.size,
    role,
    digest: null,
  });
  if (budget) {
    markSnapshotFailed(deps.db, snapshotId, budget);
    return failure(snapshotId, workspaceArtifact.id, budget);
  }

  let written: { digest: string; byteSize: number };
  try {
    written = await deps.blobs.writeTempFromPath(tempKey, input.absolutePath);
  } catch (err) {
    await deps.blobs.discardTemp(tempKey);
    markSnapshotFailed(deps.db, snapshotId, 'source_unreadable');
    logCaptureFailure('path', input.projectRelativePath, err);
    return failure(snapshotId, workspaceArtifact.id, 'source_unreadable');
  }

  // Second stat: a write that landed WHILE we were copying would otherwise
  // hand us a torn mixture of two versions.
  let after: fs.Stats;
  try {
    after = await fs.promises.stat(input.absolutePath);
  } catch {
    await deps.blobs.discardTemp(tempKey);
    markSnapshotFailed(deps.db, snapshotId, 'source_changed');
    return failure(snapshotId, workspaceArtifact.id, 'source_changed');
  }
  if (
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    written.byteSize !== before.size
  ) {
    await deps.blobs.discardTemp(tempKey);
    markSnapshotFailed(deps.db, snapshotId, 'source_changed');
    return failure(snapshotId, workspaceArtifact.id, 'source_changed');
  }

  try {
    const storageKey = await deps.blobs.installTemp(tempKey, written.digest);
    commitReady(deps, {
      snapshotId,
      role,
      digest: written.digest,
      storageKey,
      byteSize: written.byteSize,
      mime: input.mime ?? null,
      sourceSize: before.size,
      sourceMtime: before.mtimeMs,
      now,
    });
  } catch (err) {
    await deps.blobs.discardTemp(tempKey);
    markSnapshotFailed(deps.db, snapshotId, 'internal_error');
    logCaptureFailure('path', input.projectRelativePath, err);
    return failure(snapshotId, workspaceArtifact.id, 'internal_error');
  }

  // The workspace latest pointer learns what it currently holds, which is what
  // lets a later capture skip a redundant re-hash.
  ensureWorkspaceArtifactForPath(deps.db, {
    projectId: input.projectId,
    path: input.projectRelativePath,
    kind: input.kind,
    mime: input.mime ?? null,
    digest: written.digest,
    size: written.byteSize,
    mtime: before.mtimeMs,
    now,
  });

  return {
    snapshotId,
    workspaceArtifactId: workspaceArtifact.id,
    state: 'ready',
    contentDigest: written.digest,
    byteSize: written.byteSize,
  };
}

function fingerprintMatches(
  expected: CaptureFromPathInput['expected'],
  stat: fs.Stats,
): boolean {
  if (!expected) return true;
  if (typeof expected.size === 'number' && expected.size !== stat.size) return false;
  if (typeof expected.mtimeMs === 'number' && expected.mtimeMs !== stat.mtimeMs) return false;
  return true;
}

function recordImmediateFailure(
  deps: ChatArtifactCaptureDeps,
  args: {
    input: CaptureFromPathInput;
    workspaceArtifactId: string;
    now: number;
    failureCode: ChatArtifactFailureCode;
  },
): string {
  const snapshotId = randomUUID();
  insertSnapshotIntent(deps.db, {
    id: snapshotId,
    projectId: args.input.projectId,
    workspaceArtifactId: args.workspaceArtifactId,
    sourcePathAtCapture: args.input.projectRelativePath,
    kind: args.input.kind,
    mime: args.input.mime ?? null,
    runId: args.input.runId ?? null,
    mediaTaskId: args.input.mediaTaskId ?? null,
    expectedSize: args.input.expected?.size ?? null,
    expectedMtime: args.input.expected?.mtimeMs ?? null,
    expectedDigest: null,
    // No bytes were ever staged, so there is no temp for the reconciler.
    tempKey: null,
    now: args.now,
  });
  markSnapshotFailed(deps.db, snapshotId, args.failureCode);
  return snapshotId;
}

/**
 * Budget gate. Returns the failure code to record, or null when the capture may
 * proceed. A digest that is already installed costs nothing new, so it is
 * always allowed through — refusing a dedupe hit would fail a capture that
 * consumes zero additional bytes.
 */
function checkBudget(
  deps: ChatArtifactCaptureDeps,
  args: {
    projectId: string;
    byteSize: number;
    role: ChatArtifactCaptureRole;
    digest: string | null;
  },
): ChatArtifactFailureCode | null {
  const quota = quotaOf(deps);
  const cap = args.role === 'thumbnail' ? quota.thumbnailMaxBytes : quota.perBlobMaxBytes;
  if (args.byteSize > cap) return 'too_large';
  if (args.digest && getChatArtifactBlob(deps.db, args.digest)) return null;
  if (projectSnapshotBytes(deps.db, args.projectId) + args.byteSize > quota.projectMaxBytes) {
    return 'quota_exceeded';
  }
  if (totalSnapshotBytes(deps.db) + args.byteSize > quota.totalMaxBytes) {
    return 'quota_exceeded';
  }
  return null;
}

/** Phase 4: one SQLite transaction flips the blob index and the snapshot. */
function commitReady(
  deps: ChatArtifactCaptureDeps,
  args: {
    snapshotId: string;
    role: ChatArtifactCaptureRole;
    digest: string;
    storageKey: string;
    byteSize: number;
    mime: string | null;
    sourceSize: number | null;
    sourceMtime: number | null;
    now: number;
  },
): void {
  const tx = deps.db.transaction(() => {
    upsertChatArtifactBlob(deps.db, {
      digest: args.digest,
      storageKey: args.storageKey,
      byteSize: args.byteSize,
      mime: args.mime,
      now: args.now,
    });
    markSnapshotReady(deps.db, {
      id: args.snapshotId,
      contentDigest: args.role === 'content' ? args.digest : null,
      thumbnailDigest: args.role === 'thumbnail' ? args.digest : null,
      sourceSize: args.sourceSize,
      sourceMtime: args.sourceMtime,
      now: args.now,
    });
  });
  tx();
}

function failure(
  snapshotId: string,
  workspaceArtifactId: string,
  failureCode: ChatArtifactFailureCode,
): ChatArtifactCaptureResult {
  return { snapshotId, workspaceArtifactId, state: 'failed', failureCode };
}

function logCaptureFailure(source: string, filePath: string, err: unknown): void {
  // Never log bytes or absolute paths — only the project-relative label.
  const message = err instanceof Error ? err.message : String(err);
  try {
    console.warn(`[chat-artifacts] ${source} capture failed for ${filePath}: ${message}`);
  } catch {
    // logging is best effort
  }
}
