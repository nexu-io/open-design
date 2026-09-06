// Run-terminal orchestration: turn a finished turn's touched files into the
// message's immutable artifact refs.
//
// TIMING IS THE CONTRACT. This runs at the run's terminal chokepoint, BEFORE
// the terminal SSE frame is published and before the message can be presented
// as done. A client that refreshed the file list and then asked for a snapshot
// would already be racing the next turn's overwrite; by then the bytes are
// gone. Everything here happens while the daemon still owns the moment.
//
// TWO SOURCES, ONE STORE. When the media path already froze the exact provider
// bytes for this run, that snapshot is reused verbatim — no re-read of a path
// that may have been overwritten in between. Only paths with no such snapshot
// are copied from disk, and those copies are fingerprint-guarded.

import path from 'node:path';
import fs from 'node:fs';

import {
  captureChatArtifactSnapshotFromBytes,
  captureChatArtifactSnapshotFromPath,
  type ChatArtifactCaptureDeps,
  type ChatArtifactCaptureResult,
} from './capture.js';
import { chatArtifactPolicyForKind } from './policy.js';
import {
  ensureWorkspaceArtifactForPath,
  getChatArtifactSnapshot,
  getMessageArtifactRowById,
  markSnapshotReady,
  replaceMessageArtifacts,
  type MessageArtifactInput,
  type MessageArtifactRow,
} from './store.js';
import { kindForArtifactPath, mimeForArtifactPath } from './mime.js';
import type { ChatArtifactFailureCode } from './types.js';

export interface CaptureRunChatArtifactsInput {
  projectId: string;
  /** Absolute project directory the run wrote into. */
  projectRoot: string;
  /** Assistant message that will carry the refs. */
  messageId: string;
  runId?: string;
  /** Absolute paths the run created or modified. */
  touchedPaths: readonly string[];
  /** Optional lineage from the existing HTML version store, per entry path. */
  htmlVersionIds?: Readonly<Record<string, string>>;
  /** Cap on refs per message so a pathological run cannot flood the card list. */
  maxRefs?: number;
}

export interface CaptureRunChatArtifactsReport {
  refs: number;
  captured: number;
  reused: number;
  failed: number;
  /**
   * Why the failures failed, counted by code.
   *
   * A bare `failed` total cannot separate "the store is full" from "the file
   * changed under us", and those are different incidents: the first is a
   * capacity problem, the second means the bytes on disk stopped being the
   * bytes this turn produced — a timing failure that silently fabricates
   * history if anything downstream decides to substitute the current file.
   * `source_changed` therefore has to be countable on its own.
   */
  failureCodes: Partial<Record<ChatArtifactFailureCode, number>>;
  /**
   * The ref rows as written, in card order.
   *
   * The cover pass needs the ref IDs it is about to attach to, and re-reading
   * them would mean trusting that nothing rewrote this message's refs in
   * between. Returning what was just written keeps the two passes talking about
   * the same rows.
   */
  rows: MessageArtifactRow[];
}

const DEFAULT_MAX_REFS = 64;

export async function captureRunChatArtifactSnapshots(
  deps: ChatArtifactCaptureDeps,
  input: CaptureRunChatArtifactsInput,
): Promise<CaptureRunChatArtifactsReport> {
  const report: CaptureRunChatArtifactsReport = {
    refs: 0,
    captured: 0,
    reused: 0,
    failed: 0,
    failureCodes: {},
    rows: [],
  };
  const maxRefs = input.maxRefs ?? DEFAULT_MAX_REFS;
  const projectRoot = path.resolve(input.projectRoot);
  const seen = new Set<string>();
  const refs: MessageArtifactInput[] = [];

  for (const absolute of input.touchedPaths) {
    if (refs.length >= maxRefs) break;
    const relative = projectRelativePath(projectRoot, absolute);
    // A touched path outside the project root is not this project's artifact.
    // Refusing it here keeps a stray absolute path out of the snapshot store
    // and out of every label the client will render.
    if (!relative || seen.has(relative)) continue;
    seen.add(relative);

    const kind = kindForArtifactPath(relative);
    const mime = mimeForArtifactPath(relative);
    const policy = chatArtifactPolicyForKind(kind);

    if (!policy.capturesContent) {
      // HTML / doc: the click target is the live workspace identity. The frozen
      // cover, when a renderer produces one, is attached later through
      // `attachChatArtifactThumbnail`.
      const workspace = await ensureLatestPointer(deps, {
        projectId: input.projectId,
        relative,
        absolute,
        kind,
        mime,
      });
      if (!workspace) continue;
      const ref: MessageArtifactInput = {
        workspaceArtifactId: workspace,
        displayPolicy: policy.displayPolicy,
        label: relative,
        kind,
      };
      const lineage = input.htmlVersionIds?.[relative];
      if (lineage) ref.htmlVersionId = lineage;
      refs.push(ref);
      report.refs += 1;
      continue;
    }

    const reused = findRunSnapshotForPath(deps, {
      projectId: input.projectId,
      relative,
      ...(input.runId ? { runId: input.runId } : {}),
    });
    let result: ChatArtifactCaptureResult;
    if (reused) {
      result = {
        snapshotId: reused.id,
        workspaceArtifactId: reused.workspaceArtifactId ?? '',
        state: 'ready',
        ...(reused.contentDigest ? { contentDigest: reused.contentDigest } : {}),
      };
      report.reused += 1;
    } else {
      result = await captureChatArtifactSnapshotFromPath(deps, {
        projectId: input.projectId,
        projectRelativePath: relative,
        kind,
        ...(mime ? { mime } : {}),
        absolutePath: absolute,
        ...(input.runId ? { runId: input.runId } : {}),
      });
      if (result.state === 'ready') {
        report.captured += 1;
      } else if (result.state === 'failed') {
        report.failed += 1;
        // Every failure path in `capture.ts` names a code (`failed()` takes it
        // as a required argument), so an uncoded failure would be a new,
        // unclassified one. It stays in `failed` and out of the histogram
        // rather than being filed under a code it does not have.
        if (result.failureCode) {
          report.failureCodes[result.failureCode] =
            (report.failureCodes[result.failureCode] ?? 0) + 1;
        }
      }
    }

    const ref: MessageArtifactInput = {
      snapshotId: result.snapshotId,
      workspaceArtifactId: result.workspaceArtifactId || null,
      displayPolicy: policy.displayPolicy,
      label: relative,
      kind,
    };
    refs.push(ref);
    report.refs += 1;
  }

  if (refs.length > 0) {
    report.rows = replaceMessageArtifacts(deps.db, input.messageId, refs);
  }
  return report;
}

/**
 * Attach a rendered static cover to an existing ref.
 *
 * This is the seam the first-viewport renderer plugs into. It is separate from
 * capture because the cover may arrive after the turn ends, while the ORIGINAL
 * bytes never may — those must be frozen at the chokepoint or not at all.
 */
export async function attachChatArtifactThumbnail(
  deps: ChatArtifactCaptureDeps,
  input: { messageArtifactId: string; bytes: Buffer; mime?: string },
): Promise<ChatArtifactCaptureResult> {
  const row = getMessageArtifactRowById(deps.db, input.messageArtifactId);
  if (!row) throw new Error(`unknown message artifact ref: ${input.messageArtifactId}`);
  const projectId = projectIdForRef(deps, row.workspaceArtifactId, row.snapshotId);
  if (!projectId) throw new Error('message artifact ref is not bound to a project');

  const existing = row.snapshotId ? getChatArtifactSnapshot(deps.db, row.snapshotId) : null;
  const captured = await captureChatArtifactSnapshotFromBytes(deps, {
    projectId,
    projectRelativePath: row.labelAtCapture,
    kind: row.kind,
    ...(input.mime ? { mime: input.mime } : {}),
    bytes: input.bytes,
    role: 'thumbnail',
    // A cover is a rendering OF the file, never the file itself. It must not
    // move the Design Files latest pointer.
    advanceWorkspaceLatest: false,
  });
  if (captured.state !== 'ready') return captured;

  if (existing && existing.captureState === 'ready') {
    // The ref already owns a snapshot (an image original). Fold the cover into
    // that same row so one ref never needs two snapshot ids.
    const blobDigest = getChatArtifactSnapshot(deps.db, captured.snapshotId)?.contentDigest;
    if (blobDigest) {
      markSnapshotReady(deps.db, { id: existing.id, thumbnailDigest: blobDigest });
      deps.db
        .prepare(`DELETE FROM chat_artifact_snapshots WHERE id = ?`)
        .run(captured.snapshotId);
      return { ...captured, snapshotId: existing.id };
    }
  }

  // Promote the thumbnail's digest onto the thumbnail column of its own row and
  // point the ref at it.
  const fresh = getChatArtifactSnapshot(deps.db, captured.snapshotId);
  if (fresh?.contentDigest) {
    deps.db
      .prepare(
        `UPDATE chat_artifact_snapshots
            SET thumbnail_digest = content_digest, content_digest = NULL
          WHERE id = ?`,
      )
      .run(captured.snapshotId);
  }
  deps.db
    .prepare(`UPDATE message_artifacts SET snapshot_id = ? WHERE id = ?`)
    .run(captured.snapshotId, row.id);
  return captured;
}

/**
 * The exact-bytes snapshot the media path already froze for this run and path,
 * if any. Scoped to the run so a PREVIOUS turn's snapshot of the same file can
 * never be presented as this turn's output.
 */
function findRunSnapshotForPath(
  deps: ChatArtifactCaptureDeps,
  args: { projectId: string; relative: string; runId?: string },
) {
  if (!args.runId) return null;
  const row = deps.db
    .prepare(
      `SELECT id, workspace_artifact_id AS workspaceArtifactId,
              content_digest AS contentDigest
         FROM chat_artifact_snapshots
        WHERE project_id = ?
          AND run_id = ?
          AND source_path_at_capture = ?
          AND capture_state = 'ready'
          AND content_digest IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(args.projectId, args.runId, args.relative) as
      | { id: string; workspaceArtifactId: string | null; contentDigest: string | null }
      | undefined;
  return row ?? null;
}

async function ensureLatestPointer(
  deps: ChatArtifactCaptureDeps,
  args: {
    projectId: string;
    relative: string;
    absolute: string;
    kind: string;
    mime: string | undefined;
  },
): Promise<string | null> {
  let size: number | null = null;
  let mtime: number | null = null;
  try {
    const stat = await fs.promises.stat(args.absolute);
    size = stat.size;
    mtime = stat.mtimeMs;
  } catch {
    // The file vanished between the diff and here. Still bind the identity so
    // the card can honestly report a deleted latest.
  }
  const workspace = ensureWorkspaceArtifactForPath(deps.db, {
    projectId: args.projectId,
    path: args.relative,
    kind: args.kind,
    mime: args.mime ?? null,
    size,
    mtime,
  });
  return workspace.id;
}

function projectIdForRef(
  deps: ChatArtifactCaptureDeps,
  workspaceArtifactId: string | null,
  snapshotId: string | null,
): string | null {
  if (snapshotId) {
    const snapshot = getChatArtifactSnapshot(deps.db, snapshotId);
    if (snapshot) return snapshot.projectId;
  }
  if (workspaceArtifactId) {
    const row = deps.db
      .prepare(`SELECT project_id AS projectId FROM workspace_artifacts WHERE id = ?`)
      .get(workspaceArtifactId) as { projectId: string } | undefined;
    if (row) return row.projectId;
  }
  return null;
}

/**
 * Project-relative, forward-slash, containment-checked. Returns null for any
 * path that is not genuinely inside the project root — an absolute stray must
 * never become a snapshot label or a storage input.
 */
function projectRelativePath(projectRoot: string, absolute: string): string | null {
  const resolved = path.resolve(absolute);
  const relative = path.relative(projectRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  if (path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}
