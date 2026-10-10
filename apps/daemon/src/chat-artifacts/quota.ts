// Storage budget for immutable chat artifact snapshots.
//
// Three tiers (spec §7.1): one blob, one project, one daemon data root.
// Exceeding a budget fails THAT capture, never the turn — the message still
// completes and the card honestly reports "history was not saved".

import type Database from 'better-sqlite3';

export interface ChatArtifactQuota {
  /** Largest single original blob. */
  perBlobMaxBytes: number;
  /** Largest single cover PNG. Covers are regenerable, so keep them small. */
  thumbnailMaxBytes: number;
  /** Total distinct blob bytes reachable from one project's ready snapshots. */
  projectMaxBytes: number;
  /** Total installed blob bytes across the whole daemon data root. */
  totalMaxBytes: number;
}

const MiB = 1024 * 1024;

export const DEFAULT_CHAT_ARTIFACT_QUOTA: ChatArtifactQuota = {
  perBlobMaxBytes: 64 * MiB,
  thumbnailMaxBytes: 8 * MiB,
  projectMaxBytes: 2048 * MiB,
  totalMaxBytes: 8192 * MiB,
};

function positiveInt(raw: string | undefined, fallback: number): number {
  if (typeof raw !== 'string') return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Operator overrides. Env is read ONCE per call by the caller that owns the
 * process environment; nothing downstream re-reads it.
 */
export function resolveChatArtifactQuota(
  env: Record<string, string | undefined> = process.env,
): ChatArtifactQuota {
  return {
    perBlobMaxBytes: positiveInt(
      env.OD_CHAT_ARTIFACT_BLOB_MAX_BYTES,
      DEFAULT_CHAT_ARTIFACT_QUOTA.perBlobMaxBytes,
    ),
    thumbnailMaxBytes: positiveInt(
      env.OD_CHAT_ARTIFACT_THUMBNAIL_MAX_BYTES,
      DEFAULT_CHAT_ARTIFACT_QUOTA.thumbnailMaxBytes,
    ),
    projectMaxBytes: positiveInt(
      env.OD_CHAT_ARTIFACT_PROJECT_MAX_BYTES,
      DEFAULT_CHAT_ARTIFACT_QUOTA.projectMaxBytes,
    ),
    totalMaxBytes: positiveInt(
      env.OD_CHAT_ARTIFACT_TOTAL_MAX_BYTES,
      DEFAULT_CHAT_ARTIFACT_QUOTA.totalMaxBytes,
    ),
  };
}

/**
 * Distinct blob bytes reachable from one project's ready snapshots.
 *
 * Recomputed from the foreign keys every time rather than cached in a counter
 * column: a stale `ref_count` is exactly the kind of second truth source that
 * makes a GC delete something a message still points at.
 */
export function projectSnapshotBytes(
  db: Database.Database,
  projectId: string,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(b.byte_size), 0) AS total
         FROM chat_artifact_blobs b
        WHERE b.digest IN (
                SELECT content_digest FROM chat_artifact_snapshots
                 WHERE project_id = ? AND capture_state = 'ready'
                   AND content_digest IS NOT NULL
                UNION
                SELECT thumbnail_digest FROM chat_artifact_snapshots
                 WHERE project_id = ? AND capture_state = 'ready'
                   AND thumbnail_digest IS NOT NULL
              )`,
    )
    .get(projectId, projectId) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

/** Total installed blob bytes recorded in the index. */
export function totalSnapshotBytes(db: Database.Database): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(byte_size), 0) AS total FROM chat_artifact_blobs`)
    .get() as { total: number } | undefined;
  return Number(row?.total ?? 0);
}
