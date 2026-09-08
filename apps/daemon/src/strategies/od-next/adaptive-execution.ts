import { composeOdNextAdaptiveClarificationContinuationV1 } from '@open-design/contracts';
import type Database from 'better-sqlite3';

import { scanQuestionForms } from '../../question-form-detect.js';
import {
  compareAndTransitionStrategyTaskExecution,
  getStrategyTaskExecution,
  type StrategyTaskExecutionRecord,
} from '../task-store.js';
import type { OdNextCoordinatorResult } from './coordinator.js';
import type { OdNextMachineProtocolResult } from './protocol.js';

function requireAdaptiveTask(db: Database.Database, taskExecutionId: string): StrategyTaskExecutionRecord {
  const task = getStrategyTaskExecution(db, taskExecutionId);
  if (!task || task.executionPolicy !== 'adaptive_v1') {
    throw new Error('The task must have a frozen adaptive execution recipe.');
  }
  return task;
}

/** Only a user answer allocates another main Run; planning never does. */
export function beginAdaptiveStrategyClarification(db: Database.Database, input: {
  taskExecutionId: string;
  sourceRunId: string;
  nextRunId: string;
  answer: string;
}): OdNextCoordinatorResult {
  const current = requireAdaptiveTask(db, input.taskExecutionId);
  if (current.outcome !== 'clarification_required'
    || current.latestRunId !== input.sourceRunId
    || !input.answer.trim()) {
    throw new Error('The answer must continue the latest waiting adaptive task Run.');
  }
  const answer = input.answer.trim();
  const task = compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: { route: null, inputStage: 'clarification', outcome: 'running', executionMode: null },
    nextRun: {
      runId: input.nextRunId,
      sourceRunId: input.sourceRunId,
      finalText: composeOdNextAdaptiveClarificationContinuationV1({
        nativeSessionResume: true,
        taskExecutionId: current.taskExecutionId,
        taskRunIndex: current.runs.length,
        answer,
      }),
    },
  });
  return { action: 'running', task, visibleText: '', reasonCodes: [],
    instruction: { stage: 'clarification', nativeSessionResume: true, answer } };
}

/** Finalize the current Run without a plan handoff, repair turn, or production allocation. */
export function finalizeAdaptiveStrategyTurn(db: Database.Database, input: {
  taskExecutionId: string;
  runId: string;
  parsed: OdNextMachineProtocolResult;
  completionEvidence: {
    physicalStatus: 'succeeded' | 'failed' | 'canceled';
    deliverableValid: boolean;
    visibleConclusion: boolean;
  };
}): OdNextCoordinatorResult {
  const current = requireAdaptiveTask(db, input.taskExecutionId);
  if (current.outcome !== 'running' || current.latestRunId !== input.runId) {
    throw new Error('Only the latest running adaptive task Run can be finalized.');
  }
  const { parsed, completionEvidence } = input;
  const visibleText = parsed.visibleText;
  const state = parsed.adaptiveRuntimeState;
  const form = scanQuestionForms(visibleText);
  const reasons = parsed.issues.map((issue) => issue.code as string);
  if (parsed.planContract || parsed.repairPlanContract || parsed.runtimeState) {
    reasons.push('od_next_adaptive_legacy_protocol_unexpected');
  }
  if (form.unterminated) reasons.push('od_next_question_form_unterminated');
  if (form.unrenderable > 0) reasons.push('od_next_question_form_unrenderable');
  if (form.renderable > 1) reasons.push('od_next_clarification_form_ambiguous');
  // A valid user-question artifact already declares a wait to every host
  // surface. Do not lose an actionable question solely for a missing status.
  const questionOnly = !state && form.renderable === 1
    && reasons.every((code) => code === 'od_next_protocol_runtime_state_missing');
  if (questionOnly) reasons.length = 0;
  let outcome = state?.outcome ?? (questionOnly ? 'clarification_required' : 'blocked');
  if (outcome === 'clarification_required' && form.renderable !== 1) {
    reasons.push('od_next_clarification_form_missing');
  }
  if (outcome === 'completed') {
    if (form.renderable > 0) reasons.push('od_next_clarification_form_unexpected');
    if (state?.deliveryKind === 'answer' || state?.deliveryKind === 'plan') {
      if (!completionEvidence.visibleConclusion) {
        reasons.push('od_next_adaptive_conclusion_missing');
      }
    } else if (!completionEvidence.deliverableValid) {
      reasons.push('od_next_canonical_deliverable_invalid');
    }
  }
  if (completionEvidence.physicalStatus !== 'succeeded') {
    reasons.push('od_next_physical_run_not_succeeded');
  }
  if (reasons.length > 0) outcome = 'blocked';
  if (outcome === 'blocked') {
    reasons.push(...(state?.reasonCodes ?? []));
    if (reasons.length === 0) reasons.push('od_next_agent_declared_block');
  }
  const reasonCodes = [...new Set(reasons)];
  const task = compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: { route: null, inputStage: current.inputStage, outcome, executionMode: null },
    ...(outcome === 'blocked' ? {
      blockedContext: { reasonCodes, visibleText: visibleText.trim() ? visibleText : null },
    } : {}),
  });
  return {
    action: outcome === 'clarification_required' ? 'awaiting_clarification' : outcome,
    task, visibleText, reasonCodes,
  };
}
