import type { StrategyTaskSettlementReasonV2, StrategyTaskDeclarationsV2 } from '@open-design/contracts';
import type Database from 'better-sqlite3';

import { countRenderableQuestionForms } from '../../question-form-detect.js';
import {
  compareAndTransitionStrategyTaskExecution,
  getStrategyTaskExecution,
  type StrategyTaskExecutionRecord,
} from '../task-store.js';
import type { StrategyRunWriteEvidence } from './write-evidence.js';

type SqliteDb = Database.Database;

export class OdNextCoordinatorError extends Error {
  constructor(
    message: string,
    readonly reasonCodes: string[],
  ) {
    super(message);
    this.name = 'OdNextCoordinatorError';
  }
}

/**
 * The host-observed facts one successful OD Next round leaves behind. Every
 * field is something the daemon saw itself; the two declarations are the
 * agent's own light signals and rank below the write evidence.
 */
export interface StrategyRunSettlementFacts {
  /** The reply with reserved machine blocks removed. */
  visibleText: string;
  declarations: StrategyTaskDeclarationsV2;
  writeEvidence: StrategyRunWriteEvidence;
  /** The turn was cut off by an output-token limit. */
  truncated: boolean;
  /** The round's last TodoWrite snapshot still has unfinished items. */
  todoUnfinished: boolean;
}

export type StrategyRunSettlementDecision =
  | { action: 'settle'; reason: StrategyTaskSettlementReasonV2; deliverableWritten: boolean }
  | { action: 'build'; reason: StrategyTaskSettlementReasonV2 };

/** Why the round did not prove delivery, in the order most worth reporting. */
function undeliveredReason(facts: StrategyRunSettlementFacts): StrategyTaskSettlementReasonV2 {
  if (facts.truncated) return 'truncated';
  if (facts.writeEvidence.unknown) return 'write_evidence_unknown';
  if (facts.writeEvidence.noteOnly) return 'note_only';
  if (facts.todoUnfinished) return 'todo_unfinished';
  return 'text_only';
}

/**
 * Decide what a successful round means for its task. The first rule that
 * applies wins:
 *
 * 1. The reply rendered a question form: wait for the user. Their answer is
 *    the next message and opens a new task.
 * 2. The round wrote a deliverable: done. An unfinished todo list does not
 *    outrank a file the host watched being written, and neither does a
 *    declaration that nothing should be written — facts first.
 * 3. The agent declared this is not a design request: done, counted apart.
 * 4. The agent declared the user wants discussion or a plan only: done.
 * 5. The task already had its one automatic round: done, with the reason the
 *    last round still did not deliver (the "continue remaining tasks" offer
 *    reads it).
 * 6. Otherwise start the one automatic build round.
 *
 * Nothing here validates the reply. A round that wrote no machine block, a
 * malformed one, or one written by an older strategy package settles the same
 * way as any other.
 */
export function decideStrategyRunSettlement(
  task: Pick<StrategyTaskExecutionRecord, 'autoRoundCount' | 'inputStage'>,
  facts: StrategyRunSettlementFacts,
): StrategyRunSettlementDecision {
  if (countRenderableQuestionForms(facts.visibleText) > 0) {
    return { action: 'settle', reason: 'question', deliverableWritten: false };
  }
  if (facts.writeEvidence.deliverableWritten) {
    return { action: 'settle', reason: 'deliverable_changed', deliverableWritten: true };
  }
  if (facts.declarations.nonDesignRequest) {
    return { action: 'settle', reason: 'non_design', deliverableWritten: false };
  }
  if (facts.declarations.noFileWrites) {
    return { action: 'settle', reason: 'no_file_writes', deliverableWritten: false };
  }
  const reason = undeliveredReason(facts);
  if (task.autoRoundCount >= 1 || task.inputStage === 'production') {
    return { action: 'settle', reason, deliverableWritten: false };
  }
  return { action: 'build', reason };
}

/**
 * Settle a task on its latest Run with the reason the decision produced. The
 * task ends `completed` whatever the reason — the physical Run succeeded and
 * the daemon has no gate left that could refuse it; what distinguishes the
 * endings is the reason and the delivered fact, which the chat and the
 * analytics buckets read.
 */
export function settleStrategyTask(db: SqliteDb, input: {
  taskExecutionId: string;
  runId: string;
  reason: StrategyTaskSettlementReasonV2;
  deliverableWritten: boolean;
  updatedAt?: number;
}): StrategyTaskExecutionRecord {
  const current = getStrategyTaskExecution(db, input.taskExecutionId);
  if (!current) {
    throw new OdNextCoordinatorError(
      `Unknown OD Next task execution ${input.taskExecutionId}.`,
      ['od_next_task_not_found'],
    );
  }
  if (current.outcome !== 'running') {
    throw new OdNextCoordinatorError(
      'Only the active running task can be settled.',
      ['od_next_task_not_running'],
    );
  }
  if (current.latestRunId !== input.runId) {
    throw new OdNextCoordinatorError(
      'Agent output must belong to the latest physical Run.',
      ['od_next_task_run_mismatch'],
    );
  }
  return compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: {
      route: current.route ?? 'full_plan',
      inputStage: current.inputStage,
      outcome: 'completed',
      executionMode: current.executionMode ?? 'simple',
    },
    settlement: {
      reason: input.reason,
      deliverableWritten: input.deliverableWritten || current.deliverableWritten,
    },
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
}
