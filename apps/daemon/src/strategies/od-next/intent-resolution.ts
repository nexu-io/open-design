import {
  composeOdNextIntentResolutionTurnV1,
  OdNextIntentResolutionResultSchema,
  parseOdNextPromptBundleV2,
} from '@open-design/contracts';

import type { StrategyTaskExecutionRecord } from '../task-store.js';
import type { OdNextMachineProtocolResult } from './protocol.js';
import { intentResolutionDigest } from './intent-resolution-store.js';

export interface IntentResolutionResult {
  runId: string;
  parsed: OdNextMachineProtocolResult;
  toolUseCount: number;
  completionEvidence?: {
    physicalStatus: 'succeeded' | 'failed' | 'canceled';
    deliverableValid: boolean;
    filesWritten?: number;
    filesWrittenUnknown?: boolean;
    filesWrittenSource?: 'filesystem' | 'tool_stream' | 'unknown';
  };
}

function decodeResult(value: unknown): IntentResolutionResult {
  const result = OdNextIntentResolutionResultSchema.parse(value);
  const p = result.parsed;
  const e = result.completionEvidence;
  return {
    runId: result.runId, toolUseCount: result.toolUseCount,
    parsed: {
      visibleText: p.visibleText, issues: p.issues, normalizations: p.normalizations,
      ...(p.planContract ? { planContract: p.planContract } : {}),
      ...(p.runtimeState ? { runtimeState: p.runtimeState } : {}),
      ...(p.repairPlanContract ? { repairPlanContract: p.repairPlanContract } : {}),
      ...(p.repairRuntimeState ? { repairRuntimeState: p.repairRuntimeState } : {}),
    },
    ...(e ? { completionEvidence: {
      physicalStatus: e.physicalStatus, deliverableValid: e.deliverableValid,
      ...(e.filesWritten === undefined ? {} : { filesWritten: e.filesWritten }),
      ...(e.filesWrittenUnknown === undefined ? {} : { filesWrittenUnknown: e.filesWrittenUnknown }),
      ...(e.filesWrittenSource === undefined ? {} : { filesWrittenSource: e.filesWrittenSource }),
    } } : {}),
  };
}

export function isStrategyIntentResolutionRun(task: StrategyTaskExecutionRecord, runId = task.latestRunId): boolean {
  return task.runs.some(mapping => mapping.runId === runId && mapping.purpose === 'intent_resolution');
}

/** Missing intent is tolerated at the question boundary, never at the production boundary. */
export function requiresStrategyIntentResolution(task: StrategyTaskExecutionRecord, parsed: OdNextMachineProtocolResult): boolean {
  if (task.intentResolution?.state !== 'unresolved' || parsed.runtimeState?.executionIntent !== undefined
    || !['request', 'clarification'].includes(task.inputStage) || task.route === 'direct_edit') return false;
  const plan = parsed.planContract ?? parsed.repairPlanContract;
  return (parsed.issues.length === 0 && parsed.runtimeState?.outcome === 'plan_ready' && Boolean(plan))
    || (parsed.issues.length > 0 && Boolean(plan) && task.planContractRepairAttempts === 0);
}

export function composeStrategyIntentResolution(task: StrategyTaskExecutionRecord, source: IntentResolutionResult): {
  sourceResultJson: string; instruction: string;
} {
  const validated = OdNextIntentResolutionResultSchema.parse(source);
  if (source.runId !== task.latestRunId || !['request', 'clarification'].includes(task.inputStage)) {
    throw new TypeError('Agent output must belong to the latest physical Run.');
  }
  const sourceResultJson = JSON.stringify(validated);
  const state = source.parsed.runtimeState ?? source.parsed.repairRuntimeState;
  const plan = source.parsed.planContract ?? source.parsed.repairPlanContract;
  return {
    sourceResultJson,
    instruction: composeOdNextIntentResolutionTurnV1({
      taskExecutionId: task.taskExecutionId,
      stage: task.inputStage as 'request' | 'clarification',
      taskRunIndex: task.runs.length,
      sourceRunId: source.runId,
      promptBundleSha256: task.promptBundle.sha256,
      sourceResultSha256: intentResolutionDigest(sourceResultJson),
      originalRequest: parseOdNextPromptBundleV2(task.promptBundle.text).userFirstPrompt,
      executionMode: state?.executionMode ?? plan?.fullPlan.executionMode ?? null,
    }),
  };
}

/** Reconstitute the original result; the supplemental response may supply only executionIntent. */
export function validateStrategyIntentResolutionReply(task: StrategyTaskExecutionRecord, rawReply: IntentResolutionResult): {
  source: IntentResolutionResult;
  executionIntent: 'produce' | 'plan_only';
  parsed: OdNextMachineProtocolResult;
} {
  return validateIntentResolutionReplyForRun(task, rawReply, task.latestRunId, task.inputStage);
}

/** A consumed reply may outlive its physical terminal write while a successor is already claimed. */
export function validateConsumedStrategyIntentResolutionReply(task: StrategyTaskExecutionRecord, rawReply: IntentResolutionResult) {
  const saved = task.intentResolution;
  const mapping = task.runs.find(run => run.runId === saved?.runId && run.purpose === 'intent_resolution');
  if (saved?.state !== 'resolved' || !mapping || task.executionIntent === undefined) {
    throw new TypeError('Agent output must belong to the latest physical Run.');
  }
  const result = validateIntentResolutionReplyForRun(task, rawReply, mapping.runId, mapping.inputStage);
  if (result.executionIntent !== task.executionIntent) {
    throw new TypeError('The parsed response was not eligible for contract repair.');
  }
  return result;
}

function validateIntentResolutionReplyForRun(
  task: StrategyTaskExecutionRecord,
  rawReply: IntentResolutionResult,
  runId: string,
  inputStage: StrategyTaskExecutionRecord['inputStage'],
) {
  const resolution = task.intentResolution;
  if (!resolution?.sourceResultJson || resolution.runId !== runId
    || resolution.runId !== rawReply.runId || !isStrategyIntentResolutionRun(task, runId)) {
    throw new TypeError('Agent output must belong to the latest physical Run.');
  }
  const source = decodeResult(JSON.parse(resolution.sourceResultJson));
  const reply = decodeResult(rawReply);
  const state = reply.parsed.runtimeState;
  const sourceState = source.parsed.runtimeState ?? source.parsed.repairRuntimeState;
  const sourcePlan = source.parsed.planContract ?? source.parsed.repairPlanContract;
  const executionMode = sourceState?.executionMode ?? sourcePlan?.fullPlan.executionMode ?? null;
  if (source.runId !== resolution.sourceRunId || source.completionEvidence?.physicalStatus !== 'succeeded'
    || reply.completionEvidence?.physicalStatus !== 'succeeded' || reply.completionEvidence.filesWritten !== 0
    || reply.completionEvidence.filesWrittenUnknown === true || reply.toolUseCount !== 0
    || !state?.executionIntent || state.route !== 'full_plan' || state.inputStage !== inputStage
    || state.executionMode !== executionMode || state.reasonCodes.length !== 0
    || state.outcome !== (state.executionIntent === 'plan_only' ? 'completed' : 'plan_ready')
    || reply.parsed.issues.length !== 0 || reply.parsed.visibleText.trim().length !== 0
    || reply.parsed.planContract || reply.parsed.repairPlanContract || reply.parsed.repairRuntimeState) {
    throw new TypeError('The parsed response was not eligible for contract repair.');
  }
  return {
    source,
    executionIntent: state.executionIntent,
    parsed: {
      ...source.parsed,
      // Never promote a recovered anchor into strict output or discard original issues.
      ...(source.parsed.runtimeState ? { runtimeState: { ...source.parsed.runtimeState, executionIntent: state.executionIntent } } : {}),
      ...(source.parsed.repairRuntimeState ? { repairRuntimeState: { ...source.parsed.repairRuntimeState, executionIntent: state.executionIntent } } : {}),
    },
  };
}
