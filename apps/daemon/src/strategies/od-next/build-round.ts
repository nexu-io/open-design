import {
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
  appendDaemonTranscript,
  composeOdNextBuildRoundInstructionV2,
  composeOdNextStrategyContinuationV2,
  deriveOdNextPromptBundleV2,
  parseOdNextPromptBundleV2,
  type StrategyTaskProjectionV2,
  type StrategyTaskSettlementReasonV2,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';

import type {
  InternalPhysicalRun,
  InternalRunCreateInput,
  InternalRunCreationService,
  PreparedInternalRunResult,
} from '../../services/internal-run-service.js';
import { mintRunDoneKey } from '../../runtimes/run-done-key.js';
import {
  compareAndTransitionStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  type StrategyTaskExecutionRecord,
} from '../task-store.js';

type SqliteDb = Database.Database;

const TERMINAL_OUTCOMES = new Set(['completed', 'blocked', 'canceled']);

export class OdNextAutomaticProductionError extends Error {
  constructor(
    message: string,
    readonly reasonCodes: string[],
  ) {
    super(message);
    this.name = 'OdNextAutomaticProductionError';
  }
}

export function projectStrategyTask(
  task: StrategyTaskExecutionRecord,
  viewedRunId?: string,
): StrategyTaskProjectionV2 {
  const viewedIndex = viewedRunId
    ? task.runs.findIndex((mapping) => mapping.runId === viewedRunId)
    : -1;
  const nextRunId = viewedIndex >= 0 ? task.runs[viewedIndex + 1]?.runId : undefined;
  const terminal = TERMINAL_OUTCOMES.has(task.outcome);
  const activeRunId = task.activeRunId ?? task.terminalRunId ?? task.latestRunId;
  // The source end event is also used to subscribe to the next Run. Include
  // only the relevant Run identities, using persisted indices (not positions
  // inferred by the client from stage or task analytics).
  const projectedRunIds = new Set([viewedRunId, activeRunId, !terminal ? nextRunId : undefined]);
  const runMappings = task.runs
    .filter((mapping) => projectedRunIds.has(mapping.runId))
    .map(({ runId, taskRunIndex }) => ({ runId, taskRunIndex }));
  return {
    taskExecutionId: task.taskExecutionId,
    strategy: {
      id: task.strategyId,
      version: task.strategyVersion,
      packageHash: task.strategyPackageHash,
      snapshotId: task.snapshotId,
    },
    inputStage: task.inputStage,
    outcome: task.outcome,
    route: task.route,
    executionMode: task.executionMode,
    activeRunId,
    runMappings,
    ...(!terminal && nextRunId ? { nextRunId } : {}),
    terminal,
    deliverableWritten: task.deliverableWritten,
    ...(task.outcome === 'completed' && task.settlementReason
      ? { settlementReason: task.settlementReason }
      : {}),
    autoRoundCount: task.autoRoundCount,
    // A blocked outcome is a sticky terminal verdict: project its persisted
    // attribution so clients can explain why instead of showing an anonymous
    // failure.
    ...(task.outcome === 'blocked' && task.blockedContext
      ? {
          blockedContext: {
            reasonCodes: [...task.blockedContext.reasonCodes],
            visibleText: task.blockedContext.visibleText,
          },
        }
      : {}),
  };
}

export function projectStrategyTaskByRunId(
  db: SqliteDb,
  runId: string,
): StrategyTaskProjectionV2 | undefined {
  const task = getStrategyTaskExecutionByRunId(db, runId);
  return task ? projectStrategyTask(task, runId) : undefined;
}

/**
 * The separator the first-round Bundle used between the request-stage host
 * protocols and the client's own system prompt (see
 * `initial-prompt-bundle-service.ts`). The host protocol text is four
 * segments long — gate, completion marker, follow-up suggestions, artifact
 * focus — so a cold-started build round drops exactly those and keeps
 * whatever the client supplied after them.
 */
const CLIENT_SYSTEM_PROMPT_SEPARATOR = '\n\n---\n\n';
const REQUEST_HOST_PROTOCOL_SEGMENTS = 4;
const REQUEST_HOST_PROTOCOL_PREFIX = 'OD Next host handoff gate:';

function clientSystemPromptWithoutRequestHostProtocol(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith(REQUEST_HOST_PROTOCOL_PREFIX)) return value;
  const segments = value.split(CLIENT_SYSTEM_PROMPT_SEPARATOR);
  const remainder = segments.slice(REQUEST_HOST_PROTOCOL_SEGMENTS).join(CLIENT_SYSTEM_PROMPT_SEPARATOR);
  return remainder.trim() ? remainder : undefined;
}

/**
 * The Bundle a cold-started build round sends: the task's frozen first-round
 * Bundle with the transcript extended by the user's message and the planning
 * round's visible reply, the request-stage host protocols replaced by the
 * build instruction, and the one-shot request slots (form answer override,
 * title directive) removed. The cache-stable head is byte-identical to the
 * first round's.
 *
 * The planning round's reply comes from the daemon's own stream, not from the
 * messages table: the web client writes the assistant message back after the
 * run ends, so at this moment the table does not hold it yet.
 */
export function composeOdNextColdBuildRoundBundle(input: {
  frozenBundleText: string;
  userFirstPrompt: string;
  planningRoundVisibleText: string;
  agentId: string;
  hostProtocolKey: string;
  locale?: string | undefined;
  priorTranscript?: string | undefined;
  clientSystemPrompt?: string | undefined;
}): string {
  const priorTranscript = appendDaemonTranscript(input.priorTranscript ?? '', [
    { role: 'user', content: input.userFirstPrompt },
    { role: 'assistant', content: input.planningRoundVisibleText, agentId: input.agentId },
  ]);
  return deriveOdNextPromptBundleV2(input.frozenBundleText, {
    context: {
      priorTranscript,
      clientSystemPrompt: clientSystemPromptWithoutRequestHostProtocol(input.clientSystemPrompt),
      formOverride: undefined,
    },
    taskMetadata: { titleDirective: undefined },
    userFirstPrompt: composeOdNextBuildRoundInstructionV2({
      hostProtocolKey: input.hostProtocolKey,
      locale: input.locale,
      coldStart: true,
    }),
  });
}

export interface PreparedAutomaticBuildRound<TRun> {
  prepared: PreparedInternalRunResult<TRun>;
  task: StrategyTaskExecutionRecord;
  /** How the round reaches the agent: a delta into its native session, or a fresh process with the full Bundle. */
  transport: 'resume' | 'cold_start';
}

/**
 * Claim the one automatic build round inside the assistant-message
 * transaction of the planning round's verdict. The returned Run is
 * deliberately not started: the caller first publishes the source Run's
 * terminal state, then invokes the shared service's start method so
 * subscribers never observe an inverted chain.
 *
 * `resume` says whether the agent can continue the planning round's native
 * session. When it can, the round is a short request turn; when it cannot,
 * the round is a full Bundle derived from the task's frozen first round with
 * the conversation so far in its transcript slot.
 */
export function prepareAutomaticBuildRound<
  TMeta extends InternalRunCreateInput,
  TRun extends InternalPhysicalRun,
>(input: {
  db: SqliteDb;
  service: InternalRunCreationService<TMeta, TRun>;
  task: StrategyTaskExecutionRecord;
  reason: StrategyTaskSettlementReasonV2;
  resume: boolean;
  planningRoundVisibleText: string;
  createMeta: (instruction: string, taskRunIndex: number) => TMeta;
  locale?: string | undefined;
  updatedAt?: number;
}): PreparedAutomaticBuildRound<TRun> {
  const { task } = input;
  if (task.outcome !== 'running' || task.autoRoundCount >= 1 || task.inputStage === 'production') {
    throw new OdNextAutomaticProductionError(
      'A task gets at most one automatic build round.',
      ['od_next_auto_round_exhausted'],
    );
  }
  const hostProtocolKey = mintRunDoneKey();
  let finalText: string;
  if (input.resume) {
    finalText = composeOdNextStrategyContinuationV2({
      stage: 'production',
      taskExecutionId: task.taskExecutionId,
      taskRunIndex: task.runs.length,
      hostProtocolKey,
      locale: input.locale,
    });
  } else {
    // A task frozen on the first Bundle version has no tree to derive from;
    // its build round cannot start cold. The caller settles the task instead.
    if (task.promptBundle.schema !== OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2) {
      throw new OdNextAutomaticProductionError(
        'A cold-started build round needs the current Prompt Bundle version.',
        ['od_next_cold_start_unavailable'],
      );
    }
    const frozen = parseOdNextPromptBundleV2(task.promptBundle.text);
    finalText = composeOdNextColdBuildRoundBundle({
      frozenBundleText: task.promptBundle.text,
      userFirstPrompt: frozen.userFirstPrompt,
      planningRoundVisibleText: input.planningRoundVisibleText,
      agentId: task.selectedAgentId,
      hostProtocolKey,
      locale: input.locale,
      priorTranscript: frozen.context.priorTranscript,
      clientSystemPrompt: frozen.context.clientSystemPrompt,
    });
  }
  let claimed: StrategyTaskExecutionRecord | null = null;
  const meta = input.createMeta(finalText, task.runs.length);
  meta.doneKey = hostProtocolKey;
  const prepared = input.service.prepare({
    meta,
    beforeClaimCommit: (run) => {
      claimed = compareAndTransitionStrategyTaskExecution(input.db, {
        taskExecutionId: task.taskExecutionId,
        expectedRevision: task.revision,
        to: {
          route: task.route ?? 'full_plan',
          inputStage: 'production',
          outcome: 'running',
          executionMode: task.executionMode ?? 'simple',
        },
        nextRun: {
          runId: run.id,
          sourceRunId: task.latestRunId,
          finalText,
          kind: input.resume ? 'turn' : 'bundle',
        },
        autoRound: { reason: input.reason },
        ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
      });
    },
  });
  if (prepared.kind === 'reused') {
    const current = getStrategyTaskExecutionByRunId(input.db, prepared.run.id);
    const mapping = current?.runs.find((candidate) => candidate.runId === prepared.run.id);
    if (
      current
      && current.taskExecutionId === task.taskExecutionId
      && current.latestRunId === prepared.run.id
      && mapping?.sourceRunId === task.latestRunId
    ) {
      return {
        prepared,
        task: current,
        transport: mapping.finalText.kind === 'bundle' ? 'cold_start' : 'resume',
      };
    }
  }
  if (prepared.kind !== 'ready' || !claimed) {
    throw new OdNextAutomaticProductionError(
      `Automatic build round could not be claimed (${prepared.kind}).`,
      ['od_next_next_run_claim_failed'],
    );
  }
  return {
    prepared,
    task: claimed as StrategyTaskExecutionRecord,
    transport: input.resume ? 'resume' : 'cold_start',
  };
}
