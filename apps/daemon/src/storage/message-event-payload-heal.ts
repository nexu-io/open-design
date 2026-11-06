/**
 * I3 — Existing oversized run-event rows are healed once.
 *
 * Before the run-event payload budget (`runtimes/run-event-payload-budget.ts`)
 * the daemon stored agent tool lines verbatim; a long cursor-agent
 * conversation reached ~1.4 MB per turn in `messages.events_json` and
 * `message_event_batches`. The writer is bounded now, but those rows are still
 * on disk, and every conversation read has to bound them again until they are
 * rewritten. This pass rewrites them with the same budget, once:
 *
 * - started after the daemon is listening, never on a request path;
 * - ONE row per transaction (`healOversizedMessageEvents` /
 *   `healOversizedMessageEventBatch` in `db.ts`), streaming each row's events
 *   out of SQLite one element at a time — never a whole conversation, never a
 *   whole event log in JS;
 * - yields to the event loop between rows, so request handling interleaves;
 * - skips rows whose run is still queued/running (their writer owns them);
 * - idempotent: an already-bounded row is not rewritten, and once a pass has
 *   covered every row without skipping any, a completion marker stops later
 *   starts from rescanning. Dying mid-way is safe — each row is either as it
 *   was or fully healed, and the next start resumes.
 */
import type Database from 'better-sqlite3';

import {
  hasCompletedDaemonMaintenancePass,
  healOversizedMessageEventBatch,
  healOversizedMessageEvents,
  listRunEventHealBatchCandidates,
  listRunEventHealMessageCandidates,
  recordCompletedDaemonMaintenancePass,
  type RunEventPayloadHealOutcome,
} from '../db.js';

/** Completion-marker name; bump the suffix if the budget ever tightens. */
export const MESSAGE_EVENT_PAYLOAD_HEAL_PASS = 'run-event-payload-budget-v1';

const CANDIDATE_PAGE_SIZE = 64;

export interface MessageEventPayloadHealReport {
  /** A previous pass already completed; nothing was scanned. */
  alreadyCompleted: boolean;
  /** Every candidate row was examined and none had to be skipped or failed. */
  completed: boolean;
  messagesExamined: number;
  messagesRewritten: number;
  batchesExamined: number;
  batchesRewritten: number;
  /** Rows (messages or batches) left alone because their run is still active. */
  skippedActive: number;
  /** Rows whose stored events are not a JSON array; nothing to heal safely. */
  skippedMalformed: number;
  errors: number;
  /** UTF-8 bytes of the rewritten rows before and after. */
  bytesBefore: number;
  bytesAfter: number;
}

export interface MessageEventPayloadHealOptions {
  db: Database.Database;
  /** Rescan even when a completed pass is on record (tests, diagnostics). */
  ignoreCompletionMarker?: boolean;
  /** Checked between rows; returning true ends the pass early (incomplete). */
  shouldStop?: () => boolean;
  /** Called after each row that was rewritten. */
  onRowHealed?: (row: { table: 'messages' | 'message_event_batches'; bytesBefore: number; bytesAfter: number }) => void;
  logger?: (message: string) => void;
}

function emptyReport(): MessageEventPayloadHealReport {
  return {
    alreadyCompleted: false,
    completed: false,
    messagesExamined: 0,
    messagesRewritten: 0,
    batchesExamined: 0,
    batchesRewritten: 0,
    skippedActive: 0,
    skippedMalformed: 0,
    errors: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const handle = setImmediate(resolve);
    handle.unref?.();
  });
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One full pass over messages, then batches. Resolves with what it did. */
export async function runMessageEventPayloadHealPass(
  options: MessageEventPayloadHealOptions,
): Promise<MessageEventPayloadHealReport> {
  const { db } = options;
  const report = emptyReport();
  const log = options.logger ?? ((message: string) => console.warn(message));
  const stopped = () => !db.open || options.shouldStop?.() === true;

  // A daemon (or test) that closes its database mid-pass simply ends the pass.
  if (stopped()) return report;
  if (!options.ignoreCompletionMarker && hasCompletedDaemonMaintenancePass(db, MESSAGE_EVENT_PAYLOAD_HEAL_PASS)) {
    return { ...report, alreadyCompleted: true, completed: true };
  }

  const account = (
    table: 'messages' | 'message_event_batches',
    outcome: RunEventPayloadHealOutcome,
  ) => {
    if (outcome.status === 'rewritten') {
      if (table === 'messages') report.messagesRewritten += 1;
      else report.batchesRewritten += 1;
      report.bytesBefore += outcome.bytesBefore;
      report.bytesAfter += outcome.bytesAfter;
      options.onRowHealed?.({ table, bytesBefore: outcome.bytesBefore, bytesAfter: outcome.bytesAfter });
    } else if (outcome.status === 'active') {
      report.skippedActive += 1;
    } else if (outcome.status === 'malformed') {
      report.skippedMalformed += 1;
    }
  };

  const finish = (completed: boolean): MessageEventPayloadHealReport => {
    report.completed = completed;
    if (completed && db.open) {
      recordCompletedDaemonMaintenancePass(db, MESSAGE_EVENT_PAYLOAD_HEAL_PASS);
    }
    if (report.messagesRewritten > 0 || report.batchesRewritten > 0 || report.errors > 0) {
      log(
        `[db] run-event payload heal${completed ? '' : ' (incomplete)'}: `
        + `messages=${report.messagesRewritten}/${report.messagesExamined} `
        + `batches=${report.batchesRewritten}/${report.batchesExamined} `
        + `${formatMegabytes(report.bytesBefore)} -> ${formatMegabytes(report.bytesAfter)} `
        + `skippedActive=${report.skippedActive} malformed=${report.skippedMalformed} errors=${report.errors}`,
      );
    }
    return report;
  };

  let afterRowid = 0;
  for (;;) {
    if (stopped()) return finish(false);
    const candidates = listRunEventHealMessageCandidates(db, afterRowid, CANDIDATE_PAGE_SIZE);
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      if (stopped()) return finish(false);
      afterRowid = candidate.rowid;
      report.messagesExamined += 1;
      try {
        account('messages', healOversizedMessageEvents(db, candidate.id));
      } catch (error) {
        report.errors += 1;
        log(`[db] run-event payload heal failed for message ${candidate.id}: ${String(error)}`);
      }
      await yieldToEventLoop();
    }
  }

  let afterBatchId = 0;
  for (;;) {
    if (stopped()) return finish(false);
    const candidates = listRunEventHealBatchCandidates(db, afterBatchId, CANDIDATE_PAGE_SIZE);
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      if (stopped()) return finish(false);
      afterBatchId = candidate.id;
      report.batchesExamined += 1;
      try {
        account('message_event_batches', healOversizedMessageEventBatch(db, candidate.id));
      } catch (error) {
        report.errors += 1;
        log(`[db] run-event payload heal failed for event batch ${candidate.id}: ${String(error)}`);
      }
      await yieldToEventLoop();
    }
  }

  // A skipped active row may still be oversized once its run ends (a crashed
  // 0.22.x run can sit in `running` until reconciled), so the pass only
  // declares itself complete when it had nothing to skip.
  return finish(report.skippedActive === 0 && report.errors === 0);
}

export interface MessageEventPayloadHealHandle {
  /** Ends the pass at the next row boundary and waits for it to settle. */
  stop(): Promise<void>;
}

/** Start one background pass. Failures are logged, never thrown. */
export function startMessageEventPayloadHeal(options: {
  db: Database.Database;
  logger?: (message: string) => void;
}): MessageEventPayloadHealHandle {
  let stopRequested = false;
  const log = options.logger ?? ((message: string) => console.warn(message));
  const pass = (async () => {
    // Let the listener finish its own startup work first.
    await yieldToEventLoop();
    await runMessageEventPayloadHealPass({
      db: options.db,
      logger: log,
      shouldStop: () => stopRequested,
    });
  })().catch((error) => {
    // Closing the database under a pass is how shutdown ends it; only a
    // failure against an open database is worth reporting.
    if (options.db.open) log(`[db] run-event payload heal pass failed: ${String(error)}`);
  });
  return {
    stop: async () => {
      stopRequested = true;
      await pass;
    },
  };
}
