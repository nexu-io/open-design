// Run-terminal produced-file association.
//
// THE INVARIANT: a run that succeeded and touched artifacts leaves that
// association on its assistant message, whether or not a browser was watching.
//
// `produced_files_json` has only ever had one writer — the web client, from a
// closure inside `ProjectView`'s SSE `onDone`. Detach that stream and the
// column is never written: leaving the project mid-run (or merely switching
// conversations) aborts the controller, `streamViaDaemon` swallows the
// `AbortError` without calling any handler, and the turn's deliverable is never
// attached to the turn. The daemon meanwhile promotes the same row to
// `succeeded` (`reconcileAssistantMessageOnRunEnd`) — publishing a terminal
// state while withholding the artifact association that terminal state was
// supposed to carry. On the user's return the client's own repair is refused,
// because a succeeded row with prose is past
// `DESIGN_DELIVERY_RECONCILIATION_WINDOW_MS`. The card is then unreachable
// forever. (Plane OPEND-2598, OPEND-2608.)
//
// This closes the hole at the same terminal chokepoint that already freezes the
// turn's artifact bytes, where the run's own filesystem diff is in hand.
//
// A FLOOR, NOT A VERDICT. The client sees the pre-turn snapshot and the daemon
// does not, so the client's list stays authoritative: this only ever fills a
// column that is still NULL, in one idempotent statement. A client write —
// before or after — wins by construction, and re-running this is a no-op.
//
// The turn's diff cannot describe a file that did not exist yet when it was
// taken, so an async media generation needs a second, additive entry point —
// `associateLateRunProducedFile` at the bottom of this file.

import path from 'node:path';
import { promises as fsp } from 'node:fs';

import type Database from 'better-sqlite3';

import { kindForArtifactPath, mimeForArtifactPath } from '../chat-artifacts/mime.js';

/**
 * One entry of the message's produced-file list, shaped exactly like the
 * `ProjectFile` the file listing hands the web (`projects.ts` `collectFiles`).
 *
 * The shape is load-bearing, not decorative: the chat card picks the image
 * card vs. the audio capsule from `kind`/the extension, builds its preview URL
 * from `name`, and shows `size`. A list of bare filenames would persist and
 * then render as nothing.
 */
export interface RunProducedFile {
  name: string;
  path: string;
  localPath: string;
  type: 'file';
  size: number;
  mtime: number;
  kind: string;
  mime: string;
}

export interface AssociateRunProducedFilesInput {
  /** Assistant message that carries the turn. */
  messageId: string;
  /** Absolute project directory the run wrote into. */
  projectRoot: string;
  /** Absolute paths the run created or modified (the run's artifact diff). */
  touchedPaths: readonly string[];
  /** Cap so a pathological run cannot flood the column. */
  maxFiles?: number;
}

export type AssociateRunProducedFilesOutcome =
  | { written: false; reason: 'no-paths' | 'unreadable' | 'client-owned' }
  | { written: true; files: RunProducedFile[] };

/** Mirrors `captureRunChatArtifactSnapshots`' ref cap — same list, same bound. */
const DEFAULT_MAX_FILES = 64;

/**
 * Project-relative key for a touched path, or null when the path escapes the
 * project root.
 *
 * Only positive evidence counts: every consumer downstream treats this string
 * as a project file key (`/raw/<project-relative path>`, tab identity, card
 * dedupe), so a path we cannot place inside the project must be dropped rather
 * than guessed at by basename — pointing a card at the wrong file is worse
 * than showing no card.
 */
function projectRelativeKey(projectRoot: string, absolutePath: string): string | null {
  const rel = path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
  if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return rel;
}

async function describeTouchedFile(
  projectRoot: string,
  absolutePath: string,
): Promise<RunProducedFile | null> {
  const rel = projectRelativeKey(projectRoot, absolutePath);
  if (!rel) return null;
  let stat;
  try {
    stat = await fsp.stat(absolutePath);
  } catch {
    // The file was touched during the run and is gone by the terminal snapshot
    // (a temp write, or the next turn already moved it). A card for a file that
    // is not there is a lie; drop it.
    return null;
  }
  if (!stat.isFile()) return null;
  return {
    name: rel,
    path: rel,
    localPath: path.resolve(absolutePath),
    type: 'file',
    size: stat.size,
    mtime: stat.mtimeMs,
    kind: kindForArtifactPath(rel),
    mime: mimeForArtifactPath(rel) ?? 'application/octet-stream',
  };
}

/**
 * Fill this message's produced-file list from the run's touched paths, but only
 * while it is still empty.
 *
 * Never throws: a missed association costs one card, it must not fail the run.
 */
export async function associateRunProducedFiles(
  db: Database.Database,
  input: AssociateRunProducedFilesInput,
): Promise<AssociateRunProducedFilesOutcome> {
  if (input.touchedPaths.length === 0) return { written: false, reason: 'no-paths' };

  const described = await Promise.all(
    input.touchedPaths
      .slice(0, input.maxFiles ?? DEFAULT_MAX_FILES)
      .map((absolutePath) => describeTouchedFile(input.projectRoot, absolutePath)),
  );
  const files = described
    .filter((file): file is RunProducedFile => file !== null)
    // Newest first, matching the order `listFiles` gives the web so the card
    // strip does not reorder itself once the client's own list replaces this.
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return { written: false, reason: 'unreadable' };

  const result = db
    .prepare(
      `UPDATE messages
          SET produced_files_json = ?
        WHERE id = ? AND produced_files_json IS NULL`,
    )
    .run(JSON.stringify(files), input.messageId);
  if (result.changes === 0) return { written: false, reason: 'client-owned' };
  return { written: true, files };
}

// ---------------------------------------------------------------------------
// The other half: a file this run produced that did not exist yet when the
// terminal snapshot was taken. (Plane OPEND-2608, OPEND-2609.)
//
// `od media generate` is a 202 dispatch. The CLI polls for a bounded budget and
// then hands off ("task N still running"), so a generation that outlives that
// budget writes its bytes into the project AFTER the turn is already terminal.
// The floor above cannot see it — the run's own diff was frozen before the file
// existed — and neither can the browser: `ProjectView`'s `onDone` computes its
// list at the same instant, off the same daemon-authoritative touched paths, so
// the client persists a list that simply does not contain the file (very often
// an empty one). That is the whole of OPEND-2609: the audio is generated, it
// plays in the project pane, and there is no card in chat.
//
// So the association has to be made by the party that knows the file landed:
// the media task, on completing, against the message its run belongs to.
// `media_tasks.run_id` carries the run; `messages.run_id` carries it back to the
// assistant message. Both are already persisted, so nothing new is invented.
// ---------------------------------------------------------------------------

/** Run states after which no further terminal snapshot will be taken. */
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  'succeeded',
  'failed',
  'canceled',
]);

export interface AssociateLateRunProducedFileInput {
  /** The run the producing task was spawned from (`media_tasks.run_id`). */
  runId: string;
  /** Absolute project directory the task wrote into. */
  projectRoot: string;
  /** Project-relative path of the file the task just produced. */
  projectRelativePath: string;
}

export type AssociateLateRunProducedFileOutcome =
  | {
      written: false;
      reason: 'no-message' | 'run-active' | 'unreadable' | 'already-listed' | 'contended';
    }
  | { written: true; messageId: string; file: RunProducedFile };

interface LateAssociationTarget {
  id: string;
  runStatus: string | null;
  producedFilesJson: string | null;
}

/**
 * Attach a late-landing file to the assistant message of the run that produced
 * it, without ever taking anything away.
 *
 * STILL A FLOOR, by two rules:
 *
 *  1. It only ever ADDS. The stored list is read, the one new entry is put in
 *     front of it, and every entry the client wrote survives verbatim. The
 *     client's verdict on what this turn produced is never contradicted, only
 *     completed with a file the client could not have seen. Re-running it is a
 *     no-op: a path already in the list is left alone.
 *  2. It refuses to act while the turn is still live. A media task that
 *     completes DURING its run needs nothing from here — its file is on disk
 *     before the terminal snapshot, so the floor above already carries it — and
 *     writing early would make that floor read the column as client-owned and
 *     silently drop every other file the same turn produced.
 *
 * THE READ-MODIFY-WRITE MUST STAY UNBROKEN. The list is re-read AFTER the only
 * `await` in here and then extended and written with nothing awaited in
 * between, which is what makes it atomic against every other writer in this
 * single-threaded daemon — including a client `PUT` that lands while the
 * `stat` is in flight, and a sibling media task of the same batch finishing
 * alongside this one. Introduce an `await` between that re-read and the
 * `UPDATE` and two concurrent late files start overwriting each other.
 *
 * Never throws: a missed association costs one card, it must not fail the task.
 */
export async function associateLateRunProducedFile(
  db: Database.Database,
  input: AssociateLateRunProducedFileInput,
): Promise<AssociateLateRunProducedFileOutcome> {
  const readTarget = () =>
    db
      .prepare(
        `SELECT id, run_status AS runStatus, produced_files_json AS producedFilesJson
           FROM messages
          WHERE run_id = ? AND role = 'assistant'
          ORDER BY position DESC
          LIMIT 1`,
      )
      .get(input.runId) as LateAssociationTarget | undefined;

  const target = readTarget();
  if (!target) return { written: false, reason: 'no-message' };
  if (!target.runStatus || !TERMINAL_RUN_STATUSES.has(target.runStatus)) {
    return { written: false, reason: 'run-active' };
  }

  const absolutePath = path.resolve(input.projectRoot, input.projectRelativePath);
  const file = await describeTouchedFile(input.projectRoot, absolutePath);
  if (!file) return { written: false, reason: 'unreadable' };

  // Everything from here to the UPDATE is one uninterrupted synchronous block
  // — see THE READ-MODIFY-WRITE MUST STAY UNBROKEN above.
  const current = readTarget();
  if (!current || current.id !== target.id) return { written: false, reason: 'contended' };

  const priorJson = current.producedFilesJson;
  let existing: RunProducedFile[] = [];
  if (priorJson !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(priorJson);
    } catch {
      // Not something this can safely extend. Leave the client's bytes alone.
      return { written: false, reason: 'contended' };
    }
    if (!Array.isArray(parsed)) return { written: false, reason: 'contended' };
    existing = parsed as RunProducedFile[];
  }

  if (existing.some((entry) => entry && (entry.path === file.path || entry.name === file.name))) {
    return { written: false, reason: 'already-listed' };
  }

  // Newest first, same order `listFiles` hands the web: this file is by
  // construction the most recent write of the turn.
  const result = db
    .prepare(
      `UPDATE messages
          SET produced_files_json = ?
        WHERE id = ?`,
    )
    .run(JSON.stringify([file, ...existing]), current.id);
  if (result.changes === 0) return { written: false, reason: 'contended' };
  return { written: true, messageId: current.id, file };
}
