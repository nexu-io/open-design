import { createHash } from 'node:crypto';

import {
  NormalizedAgentObservationV1Schema,
  normalizeAgentObservationV1,
  type NormalizedAgentObservationV1,
  type StrategyInputStageV2,
} from '@open-design/contracts';

import {
  adaptClaudeChildToolRuntimeFactV1,
  adaptClaudeChildRuntimeFactV1,
  type ClaudeChildRuntimeFact,
  type ClaudeChildToolRuntimeFact,
} from '../runtimes/claude-child-evidence.js';
import {
  adaptOpenCodeChildRuntimeFactV1,
  adaptOpenCodeTaskCandidateV1,
  type OpenCodeChildRuntimeFact,
  type OpenCodeTaskTerminalCandidate,
} from '../runtimes/opencode-child-evidence.js';
import {
  adaptVelaChildRuntimeFactV1,
  type VelaChildRuntimeFact,
} from '../runtimes/vela-child-evidence.js';

const MAX_MAIN_TOOL_OBSERVATIONS_PER_RUN = 256;
const SAFE_TOOL_NAME_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const CHILD_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'canceled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeToolName(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_TOOL_NAME_RE.test(value) ? value : undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function mainRunToolObservationId(runId: string, rawToolCallId: string): string {
  return `agent-tool:${runId}:${sha256(rawToolCallId)}`;
}

/**
 * Build safe parent-Agent tool spans from the already-normalized Run event
 * stream shared by every runtime. Tool arguments, results, and raw provider
 * call ids never cross this adapter.
 */
export function adaptMainRunToolObservationsV1(input: {
  events: ReadonlyArray<{ event: string; data: unknown; timestamp?: number }>;
  taskExecutionId: string;
  runId: string;
  taskRunIndex: number;
  taskRunObservationId: string;
  stage: StrategyInputStageV2;
  agentCliVersion?: string;
  runtimeCompanionVersion?: string;
  runtimeAdapterVersion?: string;
}): NormalizedAgentObservationV1[] {
  const calls = new Map<string, {
    toolCallHash: string;
    toolName: string;
    startedAtMs?: number;
    endedAtMs?: number;
    status: 'running' | 'completed' | 'failed' | 'unknown';
    conflicted: boolean;
  }>();

  for (const record of input.events) {
    if (record.event !== 'agent' || !isRecord(record.data)) continue;
    const data = record.data;
    if (data.type === 'tool_use') {
      const rawId = typeof data.id === 'string' && data.id.trim() ? data.id : undefined;
      const toolName = safeToolName(data.name);
      if (!rawId || !toolName) continue;
      const existing = calls.get(rawId);
      if (existing) {
        if (existing.toolName !== toolName) {
          existing.conflicted = true;
          existing.status = 'unknown';
        }
        continue;
      }
      if (calls.size >= MAX_MAIN_TOOL_OBSERVATIONS_PER_RUN) continue;
      calls.set(rawId, {
        toolCallHash: sha256(rawId),
        toolName,
        ...(typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
          ? { startedAtMs: record.timestamp }
          : {}),
        status: 'running',
        conflicted: false,
      });
      continue;
    }
    if (data.type === 'tool_result') {
      const rawId = typeof data.toolUseId === 'string' && data.toolUseId.trim()
        ? data.toolUseId
        : undefined;
      if (!rawId) continue;
      const call = calls.get(rawId);
      if (!call || call.conflicted) continue;
      const nextStatus = data.isError === true ? 'failed' : 'completed';
      if (call.status !== 'running' && call.status !== nextStatus) {
        call.conflicted = true;
        call.status = 'unknown';
        continue;
      }
      call.status = nextStatus;
      if (typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)) {
        if (call.startedAtMs !== undefined && record.timestamp < call.startedAtMs) {
          call.conflicted = true;
          call.status = 'unknown';
        } else {
          call.endedAtMs = record.timestamp;
        }
      }
    }
  }

  return [...calls.values()].map((call) => normalizeAgentObservationV1({
    identity: {
      observationId: `agent-tool:${input.runId}:${call.toolCallHash}`,
      taskExecutionId: input.taskExecutionId,
      runId: input.runId,
      taskRunIndex: input.taskRunIndex,
      parentObservationId: input.taskRunObservationId,
    },
    kind: 'tool',
    stage: input.stage,
    status: call.status,
    prompt: {
      hostComposed: {
        availability: 'unobservable',
        limitations: ['tool_prompt_boundary_not_applicable'],
      },
      childInjected: {
        availability: 'unobservable',
        limitations: ['tool_prompt_boundary_not_applicable'],
      },
      agentEffectiveContext: {
        availability: 'unobservable',
        limitations: ['tool_effective_context_not_exposed'],
      },
    },
    usage: {
      availability: 'unavailable',
      source: 'unknown',
      accountingMode: 'unknown',
      limitations: ['tool_usage_not_independently_reported'],
    },
    timing: call.startedAtMs === undefined && call.endedAtMs === undefined
      ? {
          availability: 'unavailable',
          limitations: ['tool_timing_not_observed'],
        }
      : {
          availability: 'partial',
          evidence: [{
            source: 'host_wall_clock',
            clockDomain: 'unix_epoch_ms',
            ...(call.startedAtMs === undefined ? {} : { startedAtMs: call.startedAtMs }),
            ...(call.endedAtMs === undefined ? {} : { endedAtMs: call.endedAtMs }),
            ...(call.startedAtMs !== undefined && call.endedAtMs !== undefined
              ? { durationMs: Math.max(0, call.endedAtMs - call.startedAtMs) }
              : {}),
          }],
          limitations: ['tool_timing_is_host_event_window'],
        },
    limitations: [
      'tool_input_and_output_redacted',
      ...(call.conflicted ? ['tool_lifecycle_conflicted'] : []),
    ],
    attributes: {
      toolName: call.toolName,
      toolCallHash: call.toolCallHash,
      source: 'normalized_agent_event',
      ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
      ...(input.runtimeCompanionVersion
        ? { runtimeCompanionVersion: input.runtimeCompanionVersion }
        : {}),
      ...(input.runtimeAdapterVersion
        ? { runtimeAdapterVersion: input.runtimeAdapterVersion }
        : {}),
    },
  }));
}

export interface AdaptRuntimeChildObservationsInput {
  events: ReadonlyArray<{ event: string; data: unknown }>;
  taskExecutionId: string;
  runId: string;
  taskRunIndex: number;
  taskRunObservationId: string;
  stage: StrategyInputStageV2;
  agentCliVersion?: string;
  runtimeCompanionVersion?: string;
  /** Tool spans are exporter detail and must not widen complex-production gates. */
  includeChildTools?: boolean;
  /** Exporter-only hierarchy: task Run -> native Agent tool -> Child Agent. */
  mainToolObservationIds?: ReadonlySet<string>;
}

/**
 * Adapt the post-run OpenCode child facts ahead of the main pass, and keep only
 * the children whose sanitized export yielded a complete running -> terminal
 * pair on one observation id.
 *
 * Half a lifecycle is worse than none: it contributes an observation id that
 * `evaluateRuntimeEvidenceGraphV1` rejects with `child_started_missing`, while
 * the L1 candidate it replaced is no longer there to carry the bounded
 * childInjected Prompt. So a missing, unrelated, or malformed export leaves
 * that child entirely on the L1 candidate path.
 */
function verifiedOpenCodeChildren(input: AdaptRuntimeChildObservationsInput): {
  byEventIndex: ReadonlyMap<number, NormalizedAgentObservationV1>;
  supersededChildSessionIds: ReadonlySet<string>;
} {
  const adapted = new Map<
    number,
    { observation: NormalizedAgentObservationV1; childSessionId: string }
  >();
  const statusesByChild = new Map<string, Set<string>>();
  input.events.forEach((record, index) => {
    if (record.event !== 'agent' || !isRecord(record.data)) return;
    const diagnostic = record.data;
    if (diagnostic.type !== 'diagnostic') return;
    if (diagnostic.name !== 'opencode_child_runtime_fact') return;
    const childSessionId = typeof diagnostic.childSessionId === 'string'
      ? diagnostic.childSessionId
      : undefined;
    if (!childSessionId) return;
    try {
      const observation = adaptOpenCodeChildRuntimeFactV1({
        fact: diagnostic as unknown as OpenCodeChildRuntimeFact,
        ...input,
      });
      adapted.set(index, { observation, childSessionId });
      const statuses = statusesByChild.get(childSessionId) ?? new Set<string>();
      statuses.add(observation.status);
      statusesByChild.set(childSessionId, statuses);
    } catch {
      // Adapter version drift or a truncated fact. Absent evidence keeps the
      // caller's gate failing closed on the L1 candidate.
    }
  });

  const supersededChildSessionIds = new Set<string>();
  for (const [childSessionId, statuses] of statusesByChild) {
    if (!statuses.has('running')) continue;
    if (![...statuses].some((status) => CHILD_TERMINAL_STATUSES.has(status))) continue;
    supersededChildSessionIds.add(childSessionId);
  }

  const byEventIndex = new Map<number, NormalizedAgentObservationV1>();
  for (const [index, entry] of adapted) {
    if (!supersededChildSessionIds.has(entry.childSessionId)) continue;
    byEventIndex.set(index, entry.observation);
  }
  return { byEventIndex, supersededChildSessionIds };
}

export function adaptRuntimeChildObservationsV1(input: AdaptRuntimeChildObservationsInput) {
  const openCodeChildren = verifiedOpenCodeChildren(input);
  return input.events.flatMap((record, index) => {
    if (record.event !== 'agent' || !record.data || typeof record.data !== 'object') {
      return [];
    }
    const diagnostic = record.data as Record<string, unknown>;
    if (diagnostic.type !== 'diagnostic') return [];
    try {
      if (diagnostic.name === 'normalized_agent_observation_v1') {
        const parsed = NormalizedAgentObservationV1Schema.safeParse(diagnostic.observation);
        return parsed.success ? [parsed.data] : [];
      }
      if (diagnostic.name === 'opencode_child_runtime_fact') {
        const verified = openCodeChildren.byEventIndex.get(index);
        return verified ? [verified] : [];
      }
      if (diagnostic.name === 'opencode_child_task_candidate') {
        const candidate = diagnostic as unknown as OpenCodeTaskTerminalCandidate;
        // The verified export already covers this child on its own observation
        // id. Emitting both would leave a terminal-only L1 id in the same graph
        // and drop the whole Run back below L2.
        if (openCodeChildren.supersededChildSessionIds.has(candidate.childSessionId)) {
          return [];
        }
        return [adaptOpenCodeTaskCandidateV1({ candidate, ...input })];
      }
      if (diagnostic.name === 'vela_opencode_child_agent_lifecycle') {
        return [adaptVelaChildRuntimeFactV1({
          fact: diagnostic as unknown as VelaChildRuntimeFact,
          ...input,
        })];
      }
      if (diagnostic.name === 'claude_child_runtime_fact') {
        const fact = diagnostic as unknown as ClaudeChildRuntimeFact;
        return [adaptClaudeChildRuntimeFactV1({
          fact,
          ...(() => {
            const candidate = mainRunToolObservationId(input.runId, fact.childId);
            return !fact.parentChildId && input.mainToolObservationIds?.has(candidate)
              ? { rootParentToolObservationId: candidate }
              : {};
          })(),
          ...input,
        })];
      }
      if (diagnostic.name === 'claude_child_tool_runtime_fact') {
        if (input.includeChildTools !== true) return [];
        return [adaptClaudeChildToolRuntimeFactV1({
          fact: diagnostic as unknown as ClaudeChildToolRuntimeFact,
          ...input,
        })];
      }
    } catch {
      // Native evidence is optional. Invalid/stale facts remain absent so the
      // caller's graph or production gate fails closed on missing coverage.
    }
    return [];
  });
}
