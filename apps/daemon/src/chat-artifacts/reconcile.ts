// Crash recovery for chat artifact snapshots.
//
// Runs at boot and on a timer. Every residual state a crash can leave behind
// has exactly one classification here, and none of them ever resolve by
// copying the CURRENT file: a snapshot that cannot prove it holds the turn's
// bytes becomes an honest `failed` row.
//
//   pending + expected digest + blob already installed  -> complete
//   pending + expected digest + temp hashes to it       -> install, complete
//   pending + expected digest + temp gone or wrong      -> failed/interrupted
//   pending + no digest (path capture) + source matches -> re-capture cleanly
//   pending + no digest (path capture) + source moved   -> failed/source_changed
//   pending for a kind this build no longer stores      -> failed/not_captured
//   ready   + blob file gone                            -> failed/blob_missing
//   temp file no intent claims, past grace              -> deleted
//
// The last case is why the grace period exists: a temp written seconds ago may
// belong to a capture that has not reached its INSERT yet, and sweeping it
// would break a live turn.

import type Database from 'better-sqlite3';
import fs from 'node:fs';

import type { ChatArtifactBlobStore } from './blob-store.js';
import { captureChatArtifactSnapshotFromPath } from './capture.js';
import {
  getChatArtifactBlob,
  listSnapshotsByState,
  markSnapshotFailed,
  markSnapshotReady,
  upsertChatArtifactBlob,
  type ChatArtifactSnapshotRow,
} from './store.js';
import type { ChatArtifactQuota } from './quota.js';

export interface ChatArtifactReconcileDeps {
  db: Database.Database;
  blobs: ChatArtifactBlobStore;
  quota?: ChatArtifactQuota;
  /**
   * Turn a (projectId, project-relative path) back into an absolute path.
   * Injected because only the server knows PROJECTS_DIR and the imported-folder
   * `metadata.baseDir` exception. Absent means "cannot re-read sources", and
   * path intents then fail rather than guess.
   */
  resolveSourcePath?: (projectId: string, projectRelativePath: string) => string | null;
  /** How long an unclaimed temp file is left alone. Default 1 hour. */
  tempGraceMs?: number;
  now?: () => number;
}

export interface ChatArtifactReconcileReport {
  scanned: number;
  completed: number;
  failed: number;
  blobMissing: number;
  tempsSwept: number;
}

const DEFAULT_TEMP_GRACE_MS = 60 * 60 * 1000;

export async function reconcileChatArtifactSnapshots(
  deps: ChatArtifactReconcileDeps,
): Promise<ChatArtifactReconcileReport> {
  const report: ChatArtifactReconcileReport = {
    scanned: 0,
    completed: 0,
    failed: 0,
    blobMissing: 0,
    tempsSwept: 0,
  };

  const pending = listSnapshotsByState(deps.db, 'pending');
  report.scanned = pending.length;
  for (const row of pending) {
    if (row.expectedDigest) {
      const settled = await recoverInMemoryIntent(deps, row);
      if (settled === 'completed') report.completed += 1;
      else report.failed += 1;
    } else {
      const settled = await recoverPathIntent(deps, row);
      if (settled === 'completed') report.completed += 1;
      else report.failed += 1;
    }
  }

  report.blobMissing = await failSnapshotsWithMissingBlobs(deps);
  report.tempsSwept = await sweepUnclaimedTemps(deps);
  return report;
}

/**
 * An intent whose bytes came from memory. Its `expected_digest` is the exact
 * content address, so recovery is deterministic: either those bytes are still
 * reachable, or they are gone forever and the row says so.
 */
async function recoverInMemoryIntent(
  deps: ChatArtifactReconcileDeps,
  row: ChatArtifactSnapshotRow,
): Promise<'completed' | 'failed'> {
  const digest = row.expectedDigest;
  if (!digest) return 'failed';
  const now = deps.now ? deps.now() : Date.now();

  // Crash between install and the ready flip: the object is already there.
  const storageKey = deps.blobs.storageKeyFor(digest);
  if (await deps.blobs.hasBlob(storageKey)) {
    const byteSize = row.expectedSize ?? (getChatArtifactBlob(deps.db, digest)?.byteSize ?? 0);
    finishReady(deps, row, digest, storageKey, byteSize, now);
    return 'completed';
  }

  // Crash between temp write and install: the temp is the bytes, if it hashes.
  if (row.tempKey) {
    try {
      const installedKey = await deps.blobs.installTemp(row.tempKey, digest);
      const byteSize = row.expectedSize ?? 0;
      finishReady(deps, row, digest, installedKey, byteSize, now);
      return 'completed';
    } catch {
      // Missing, truncated, or a different digest — all mean the exact bytes
      // are unrecoverable. Provider bytes lived in RAM; there is no source to
      // re-read, and the current file is a different version by definition.
      if (row.tempKey) await deps.blobs.discardTemp(row.tempKey);
    }
  }
  markSnapshotFailed(deps.db, row.id, 'interrupted');
  return 'failed';
}

/**
 * An intent whose bytes lived at a path. It can only be finished when the file
 * is provably still the version the intent recorded.
 */
async function recoverPathIntent(
  deps: ChatArtifactReconcileDeps,
  row: ChatArtifactSnapshotRow,
): Promise<'completed' | 'failed'> {
  if (row.tempKey) await deps.blobs.discardTemp(row.tempKey);
  const absolutePath = deps.resolveSourcePath?.(row.projectId, row.sourcePathAtCapture) ?? null;
  if (!absolutePath) {
    markSnapshotFailed(deps.db, row.id, 'interrupted');
    return 'failed';
  }
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(absolutePath);
  } catch {
    markSnapshotFailed(deps.db, row.id, 'source_missing');
    return 'failed';
  }
  const sizeMatches = row.expectedSize === null || row.expectedSize === stat.size;
  const mtimeMatches = row.expectedMtime === null || row.expectedMtime === stat.mtimeMs;
  if (!sizeMatches || !mtimeMatches) {
    markSnapshotFailed(deps.db, row.id, 'source_changed');
    return 'failed';
  }
  // Fingerprint still holds: a clean re-capture produces exactly the bytes the
  // interrupted one was after. The abandoned intent is retired either way.
  const expected: { size?: number; mtimeMs?: number } = {};
  if (row.expectedSize !== null) expected.size = row.expectedSize;
  if (row.expectedMtime !== null) expected.mtimeMs = row.expectedMtime;
  const recaptured = await captureChatArtifactSnapshotFromPath(
    {
      db: deps.db,
      blobs: deps.blobs,
      ...(deps.quota ? { quota: deps.quota } : {}),
      ...(deps.now ? { now: deps.now } : {}),
    },
    {
      projectId: row.projectId,
      projectRelativePath: row.sourcePathAtCapture,
      kind: row.kind,
      ...(row.mime ? { mime: row.mime } : {}),
      absolutePath,
      ...(row.runId ? { runId: row.runId } : {}),
      expected,
    },
  );
  if (recaptured.state === 'skipped') {
    // A pending intent written by a build that still stored this kind's
    // originals (video / audio, before the 2026-09-02 ruling). Recovery must
    // retire it, not finish it: re-capturing here would quietly reinstall the
    // exact bytes the current policy just excluded, on the one code path whose
    // whole job is to run before anyone is watching.
    markSnapshotFailed(deps.db, row.id, 'not_captured');
    return 'failed';
  }
  if (recaptured.state !== 'ready' || !recaptured.contentDigest) {
    markSnapshotFailed(deps.db, row.id, recaptured.failureCode ?? 'internal_error');
    return 'failed';
  }
  // Fold the recovered content back onto the ORIGINAL snapshot id so any ref
  // already pointing at it resolves, and retire the helper row.
  const now = deps.now ? deps.now() : Date.now();
  markSnapshotReady(deps.db, {
    id: row.id,
    contentDigest: recaptured.contentDigest,
    sourceSize: stat.size,
    sourceMtime: stat.mtimeMs,
    now,
  });
  deps.db
    .prepare(`DELETE FROM chat_artifact_snapshots WHERE id = ?`)
    .run(recaptured.snapshotId);
  return 'completed';
}

function finishReady(
  deps: ChatArtifactReconcileDeps,
  row: ChatArtifactSnapshotRow,
  digest: string,
  storageKey: string,
  byteSize: number,
  now: number,
): void {
  const tx = deps.db.transaction(() => {
    upsertChatArtifactBlob(deps.db, {
      digest,
      storageKey,
      byteSize,
      mime: row.mime,
      now,
    });
    markSnapshotReady(deps.db, {
      id: row.id,
      // A thumbnail intent is distinguished by already carrying a thumbnail
      // expectation; content is the default and by far the common case.
      contentDigest: digest,
      sourceSize: row.expectedSize,
      sourceMtime: row.expectedMtime,
      now,
    });
  });
  tx();
}

/**
 * A ready snapshot whose blob file is gone must stop claiming to be ready.
 * The card degrades honestly instead of the endpoint 500ing on every open.
 */
async function failSnapshotsWithMissingBlobs(
  deps: ChatArtifactReconcileDeps,
): Promise<number> {
  const blobs = deps.db
    .prepare(`SELECT digest, storage_key AS storageKey, byte_size AS byteSize FROM chat_artifact_blobs`)
    .all() as Array<{ digest: string; storageKey: string; byteSize: number }>;
  let failed = 0;
  for (const blob of blobs) {
    let ok = false;
    try {
      ok = await deps.blobs.verifyBlob(blob.storageKey, blob.byteSize);
    } catch {
      ok = false;
    }
    if (ok) continue;
    const affected = deps.db
      .prepare(
        `SELECT id FROM chat_artifact_snapshots
          WHERE (content_digest = ? OR thumbnail_digest = ?)
            AND capture_state = 'ready'`,
      )
      .all(blob.digest, blob.digest) as Array<{ id: string }>;
    for (const row of affected) {
      markSnapshotFailed(deps.db, row.id, 'blob_missing');
      failed += 1;
    }
    deps.db.prepare(`DELETE FROM chat_artifact_blobs WHERE digest = ?`).run(blob.digest);
  }
  return failed;
}

/** Temps older than the grace period that no pending intent still claims. */
async function sweepUnclaimedTemps(deps: ChatArtifactReconcileDeps): Promise<number> {
  const grace = deps.tempGraceMs ?? DEFAULT_TEMP_GRACE_MS;
  const now = deps.now ? deps.now() : Date.now();
  const claimed = new Set(
    (deps.db
      .prepare(
        `SELECT temp_key AS tempKey FROM chat_artifact_snapshots
          WHERE capture_state = 'pending' AND temp_key IS NOT NULL AND temp_key <> ''`,
      )
      .all() as Array<{ tempKey: string }>).map((r) => r.tempKey),
  );
  let swept = 0;
  for (const entry of await deps.blobs.listTempEntries()) {
    if (claimed.has(entry.key)) continue;
    if (now - entry.mtimeMs < grace) continue;
    await deps.blobs.discardTemp(entry.key);
    swept += 1;
  }
  return swept;
}
