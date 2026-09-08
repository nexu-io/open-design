// Mark-sweep garbage collection for snapshot blobs.
//
// WHY MARK-SWEEP AND NOT A REFERENCE COUNTER: a counter is a second truth
// source. It drifts on every crash between the row delete and the decrement,
// and a drifted counter deletes bytes a message still points at — silently
// destroying exactly the history this whole feature exists to preserve. The
// real reference set is recomputable from the `message_artifacts` foreign keys,
// so it is recomputed. A counter would only ever be a cache.
//
// Deletes never happen on a UI request path. Project delete and conversation
// delete drop refs through the FK cascade and leave the bytes to this sweep.

import type Database from 'better-sqlite3';
import fs from 'node:fs';

import type { ChatArtifactBlobStore } from './blob-store.js';

export interface ChatArtifactGcDeps {
  db: Database.Database;
  blobs: ChatArtifactBlobStore;
  /** How long an unreferenced snapshot row is kept. Default 24h. */
  snapshotGraceMs?: number;
  /** How long an unreferenced blob is kept. Default 24h. */
  blobGraceMs?: number;
  /** Cap on rows touched per pass so a huge store stays resumable. */
  batchLimit?: number;
  /** Report only. Used to observe the sweep before enabling it for real. */
  dryRun?: boolean;
  now?: () => number;
}

export interface ChatArtifactGcReport {
  markedDigests: number;
  snapshotsSwept: number;
  blobsSwept: number;
  bytesReclaimed: number;
  orphanFilesSwept: number;
  failures: number;
  dryRun: boolean;
}

const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 1000;

export async function sweepChatArtifactStorage(
  deps: ChatArtifactGcDeps,
): Promise<ChatArtifactGcReport> {
  const now = deps.now ? deps.now() : Date.now();
  const snapshotGrace = deps.snapshotGraceMs ?? DEFAULT_GRACE_MS;
  const blobGrace = deps.blobGraceMs ?? DEFAULT_GRACE_MS;
  const batchLimit = deps.batchLimit ?? DEFAULT_BATCH_LIMIT;
  const dryRun = deps.dryRun === true;
  const report: ChatArtifactGcReport = {
    markedDigests: 0,
    snapshotsSwept: 0,
    blobsSwept: 0,
    bytesReclaimed: 0,
    orphanFilesSwept: 0,
    failures: 0,
    dryRun,
  };

  // --- Sweep unreferenced snapshot rows -----------------------------------
  // A snapshot is dead when no message ref points at it AND it is past grace.
  // `pending` rows are never swept here: they belong to the reconciler, which
  // is the only thing allowed to decide an in-flight capture's fate.
  const deadSnapshots = deps.db
    .prepare(
      `SELECT id FROM chat_artifact_snapshots
        WHERE capture_state <> 'pending'
          AND created_at < ?
          AND id NOT IN (
                SELECT snapshot_id FROM message_artifacts WHERE snapshot_id IS NOT NULL
              )
        ORDER BY created_at ASC
        LIMIT ?`,
    )
    .all(now - snapshotGrace, batchLimit) as Array<{ id: string }>;
  report.snapshotsSwept = deadSnapshots.length;
  if (!dryRun && deadSnapshots.length > 0) {
    const remove = deps.db.prepare(`DELETE FROM chat_artifact_snapshots WHERE id = ?`);
    const tx = deps.db.transaction((ids: Array<{ id: string }>) => {
      for (const row of ids) remove.run(row.id);
    });
    tx(deadSnapshots);
  }

  // --- Mark ---------------------------------------------------------------
  // A digest is live when ANY surviving snapshot names it, in any state. A
  // pending intent counts: its bytes may be mid-install right now.
  const doomed = new Set(deadSnapshots.map((row) => row.id));
  const marked = new Set<string>();
  const named = deps.db
    .prepare(
      `SELECT id, content_digest AS contentDigest, thumbnail_digest AS thumbnailDigest
         FROM chat_artifact_snapshots`,
    )
    .all() as Array<{
      id: string;
      contentDigest: string | null;
      thumbnailDigest: string | null;
    }>;
  for (const row of named) {
    // In dry-run the doomed rows are still on disk; exclude them so the report
    // matches what a real sweep would do.
    if (dryRun && doomed.has(row.id)) continue;
    if (row.contentDigest) marked.add(row.contentDigest);
    if (row.thumbnailDigest) marked.add(row.thumbnailDigest);
  }
  report.markedDigests = marked.size;

  // --- Sweep unmarked blobs ------------------------------------------------
  const blobRows = deps.db
    .prepare(
      `SELECT digest, storage_key AS storageKey, byte_size AS byteSize, created_at AS createdAt
         FROM chat_artifact_blobs
        WHERE created_at <= ?
        ORDER BY created_at ASC
        LIMIT ?`,
    )
    .all(now - blobGrace, batchLimit) as Array<{
      digest: string;
      storageKey: string;
      byteSize: number;
      createdAt: number;
    }>;
  for (const blob of blobRows) {
    if (marked.has(blob.digest)) continue;
    report.blobsSwept += 1;
    report.bytesReclaimed += blob.byteSize;
    if (dryRun) continue;
    try {
      await deps.blobs.removeBlob(blob.storageKey);
      deps.db.prepare(`DELETE FROM chat_artifact_blobs WHERE digest = ?`).run(blob.digest);
    } catch {
      report.failures += 1;
    }
  }

  // --- Reclaim object files no row claims ----------------------------------
  // A crash between `installTemp` and the SQLite commit leaves bytes nothing
  // will ever reference. The grace window keeps a just-installed object safe
  // from a sweep racing its own commit.
  const knownKeys = new Set(
    (deps.db.prepare(`SELECT storage_key AS storageKey FROM chat_artifact_blobs`).all() as Array<{
      storageKey: string;
    }>).map((row) => row.storageKey),
  );
  for (const key of await deps.blobs.listObjectKeys()) {
    if (knownKeys.has(key)) continue;
    let mtimeMs: number;
    try {
      const stat = await fs.promises.stat(deps.blobs.resolveStorageKey(key));
      mtimeMs = stat.mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs < blobGrace) continue;
    report.orphanFilesSwept += 1;
    if (dryRun) continue;
    try {
      await deps.blobs.removeBlob(key);
    } catch {
      report.failures += 1;
    }
  }

  return report;
}
