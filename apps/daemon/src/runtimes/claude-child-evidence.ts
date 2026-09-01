import { createHash } from 'node:crypto';

import {
  NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
  NormalizedAgentObservationV1Schema,
  type ChildEvidenceCoverageV1,
  type NormalizedAgentObservationV1,
  type StrategyInputStageV2,
} from '@open-design/contracts';
import {
  buildSafeChildPromptTelemetry,
  type SafeChildPromptInput,
} from '../prompt-telemetry.js';

export const CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION =
  'od-claude-child-evidence/v1' as const;

export type ClaudeChildRuntimeFactState =
  | 'started'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'conflicted';

export type ClaudeChildEvidenceConflictReason =
  | 'runtime_session_changed'
  | 'task_parent_rebound'
  | 'native_agent_type_rebound'
  | 'native_agent_id_reused'
  | 'terminal_state_conflict';

/**
 * Provider-shaped fact emitted beside the existing Claude UI stream.
 *
 * Prompt text is immediately bounded/redacted and usage is accepted only from
 * the matching root tool result. The fact carries no strategy or exporter
 * field. A non-null `parent_tool_use_id` only proves a child lifecycle after
 * the matching native Task/Agent tool_use was observed.
 */
export interface ClaudeChildRuntimeFact {
  adapterVersion: typeof CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION;
  childId: string;
  parentChildId?: string;
  state: ClaudeChildRuntimeFactState;
  source: 'claude_stream_json';
  sourceEventType:
    | 'assistant.parent_tool_use_id'
    | 'user.tool_result'
    | 'system.init'
    | 'host_process_close';
  observedAtMs: number;
  startedAtMs: number;
  endedAtMs?: number;
  runtimeSessionId?: string;
  runtimeReportedVersion?: string;
  promptHash?: string;
  promptBytes?: number;
  promptSafePayload?: SafeChildPromptInput;
  promptTruncated?: boolean;
  nativeAgentId?: string;
  nativeAgentType?: string;
  resolvedModel?: string;
  buildPackageId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    thoughtTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  nativeDurationMs?: number;
  terminationReason?: 'assistant_error' | 'canceled' | 'timeout' | 'stream_incomplete';
  conflictReasons?: ClaudeChildEvidenceConflictReason[];
}

export type ClaudeChildToolRuntimeFactState =
  | 'started'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'conflicted';

export interface ClaudeChildToolRuntimeFact {
  adapterVersion: typeof CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION;
  childId: string;
  toolCallHash: string;
  toolName: string;
  state: ClaudeChildToolRuntimeFactState;
  source: 'claude_stream_json';
  sourceEventType:
    | 'assistant.child_tool_use'
    | 'user.child_tool_result'
    | 'host_process_close';
  observedAtMs: number;
  startedAtMs: number;
  endedAtMs?: number;
  runtimeSessionId?: string;
  runtimeReportedVersion?: string;
  buildPackageId?: string;
  terminationReason?: 'tool_error' | 'canceled' | 'timeout' | 'stream_incomplete';
  conflictReasons?: Array<'tool_call_reused' | 'tool_name_rebound' | 'terminal_state_conflict'>;
}

export type ClaudeOpenChildTerminationReason =
  | 'complete'
  | 'canceled'
  | 'timeout'
  | 'stream_incomplete';

export interface ClaudeChildEvidenceCollector {
  observe(value: unknown): void;
  finishOpenChildren(reason: ClaudeOpenChildTerminationReason): void;
  coverage(): ChildEvidenceCoverageV1;
}

interface NativeChildToolRegistration {
  childId: string;
  rawToolCallId: string;
  toolCallHash: string;
  toolName: string;
  startedAtMs: number;
  runtimeSessionId?: string;
  runtimeReportedVersion?: string;
  buildPackageId?: string;
  terminal?: {
    state: Exclude<ClaudeChildToolRuntimeFactState, 'started' | 'conflicted'>;
    terminationReason?: ClaudeChildToolRuntimeFact['terminationReason'];
  };
  poisoned: boolean;
  conflictReasons: Set<NonNullable<ClaudeChildToolRuntimeFact['conflictReasons']>[number]>;
  conflictEmitted: boolean;
}

interface NativeTaskRegistration {
  // This tuple is immutable for the collector lifetime. Provider evidence that
  // attempts to rebind any member poisons the Child instead of selecting the
  // newest frame.
  parentChildId?: string;
  runtimeSessionId?: string;
  runtimeReportedVersion?: string;
  prompt?: {
    hash: string;
    bytes: number;
    safePayload: SafeChildPromptInput;
    truncated: boolean;
  };
  nativeAgentType?: string;
  buildPackageId?: string;
  poisoned: boolean;
  conflictReasons: Set<ClaudeChildEvidenceConflictReason>;
}

interface ChildLifecycle {
  startedAtMs: number;
  terminal?: {
    state: Exclude<ClaudeChildRuntimeFactState, 'started' | 'conflicted'>;
    terminationReason?: ClaudeChildRuntimeFact['terminationReason'];
  };
  conflictEmitted: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function safeToolName(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value)
    ? value
    : undefined;
}

function toolCallHash(toolCallId: string): string {
  return createHash('sha256').update(toolCallId, 'utf8').digest('hex');
}

function nativeChildToolUses(value: unknown): Array<{ id: string; name: string }> {
  if (!isRecord(value) || !Array.isArray(value.content)) return [];
  return value.content.flatMap((block) => {
    if (
      !isRecord(block) ||
      block.type !== 'tool_use' ||
      block.name === 'Task' ||
      block.name === 'Agent'
    ) {
      return [];
    }
    const id = nonEmptyString(block.id);
    const name = safeToolName(block.name);
    return id && name ? [{ id, name }] : [];
  });
}

function nativeTaskToolUses(value: unknown): Array<{
  id: string;
  prompt?: NativeTaskRegistration['prompt'];
  nativeAgentType?: string;
}> {
  if (!isRecord(value) || !Array.isArray(value.content)) return [];
  return value.content.flatMap((block) => (
    isRecord(block) &&
    block.type === 'tool_use' &&
    (block.name === 'Task' || block.name === 'Agent') &&
    typeof block.id === 'string' &&
    block.id.trim()
      ? (() => {
          const toolInput = isRecord(block.input) ? block.input : {};
          const promptText = nonEmptyString(toolInput.prompt);
          const prompt = promptText
            ? buildSafeChildPromptTelemetry([promptText])
            : undefined;
          const nativeAgentType = nonEmptyString(toolInput.subagent_type);
          return [{
            id: block.id,
            ...(prompt
              ? {
                  prompt: {
                    hash: prompt.hash,
                    bytes: prompt.bytes,
                    safePayload: prompt.safePayload,
                    truncated: prompt.truncated,
                  },
                }
              : {}),
            ...(nativeAgentType
              ? { nativeAgentType }
              : {}),
          }];
        })()
      : []
  ));
}

function usageFromToolResult(value: unknown): ClaudeChildRuntimeFact['usage'] | undefined {
  if (!isRecord(value)) return undefined;
  const usage = isRecord(value.usage) ? value.usage : undefined;
  if (!usage) return undefined;
  const inputTokens = nonNegativeNumber(usage.input_tokens);
  const outputTokens = nonNegativeNumber(usage.output_tokens);
  const totalTokens = nonNegativeNumber(value.totalTokens);
  const thoughtTokens = isRecord(usage.output_tokens_details)
    ? nonNegativeNumber(usage.output_tokens_details.thinking_tokens)
    : undefined;
  const cacheReadTokens = nonNegativeNumber(usage.cache_read_input_tokens);
  const cacheWriteTokens = nonNegativeNumber(usage.cache_creation_input_tokens);
  const values = {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(thoughtTokens === undefined ? {} : { thoughtTokens }),
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
  };
  return Object.keys(values).length > 0 ? values : undefined;
}

/**
 * Collect native Claude Task sidechain lifecycle facts without changing the
 * order or meaning of the main stream parser. Unknown frames are ignored.
 */
export function createClaudeChildEvidenceCollector(input: {
  onFact?: (fact: ClaudeChildRuntimeFact) => void;
  onToolFact?: (fact: ClaudeChildToolRuntimeFact) => void;
  now?: () => number;
  /** Daemon-owned native agent handle -> locked Build Package id map. */
  nativeBuildPackageBindings?: Readonly<Record<string, string>>;
}): ClaudeChildEvidenceCollector {
  const now = input.now ?? Date.now;
  const nativeTasks = new Map<string, NativeTaskRegistration>();
  const lifecycles = new Map<string, ChildLifecycle>();
  const nativeAgentOwners = new Map<string, string>();
  const nativeTools = new Map<string, NativeChildToolRegistration>();
  const nativeToolOwners = new Map<string, string>();
  let runtimeSessionId: string | undefined;
  let runtimeReportedVersion: string | undefined;
  let runtimeSessionConflicted = false;
  let collectionTermination: ClaudeOpenChildTerminationReason | null = null;

  function emit(fact: ClaudeChildRuntimeFact): void {
    // This is a side channel. A telemetry/observer callback must never consume
    // or abort the production parser's main UI/lifecycle event stream.
    try {
      input.onFact?.(fact);
    } catch {}
  }

  function emitTool(fact: ClaudeChildToolRuntimeFact): void {
    try {
      input.onToolFact?.(fact);
    } catch {}
  }

  function nativeToolKey(childId: string, rawToolCallId: string): string {
    return `${childId}\u0000${rawToolCallId}`;
  }

  function emitToolConflict(registration: NativeChildToolRegistration): void {
    if (registration.conflictEmitted) return;
    registration.conflictEmitted = true;
    const observedAtMs = now();
    emitTool({
      adapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      childId: registration.childId,
      toolCallHash: registration.toolCallHash,
      toolName: registration.toolName,
      state: 'conflicted',
      source: 'claude_stream_json',
      sourceEventType: 'assistant.child_tool_use',
      observedAtMs,
      startedAtMs: registration.startedAtMs,
      ...(registration.runtimeSessionId
        ? { runtimeSessionId: registration.runtimeSessionId }
        : {}),
      ...(registration.runtimeReportedVersion
        ? { runtimeReportedVersion: registration.runtimeReportedVersion }
        : {}),
      ...(registration.buildPackageId
        ? { buildPackageId: registration.buildPackageId }
        : {}),
      conflictReasons: [...registration.conflictReasons].sort(),
    });
  }

  function poisonTool(
    registration: NativeChildToolRegistration,
    reason: NonNullable<ClaudeChildToolRuntimeFact['conflictReasons']>[number],
  ): void {
    registration.poisoned = true;
    registration.conflictReasons.add(reason);
    emitToolConflict(registration);
  }

  function registerChildTool(childId: string, rawToolCallId: string, toolName: string): void {
    const child = nativeTasks.get(childId);
    if (!child || child.poisoned) return;
    const key = nativeToolKey(childId, rawToolCallId);
    const existing = nativeTools.get(key);
    if (existing) {
      if (existing.toolName !== toolName) poisonTool(existing, 'tool_name_rebound');
      return;
    }
    const owner = nativeToolOwners.get(rawToolCallId);
    const registration: NativeChildToolRegistration = {
      childId,
      rawToolCallId,
      toolCallHash: toolCallHash(rawToolCallId),
      toolName,
      startedAtMs: now(),
      ...(child.runtimeSessionId ? { runtimeSessionId: child.runtimeSessionId } : {}),
      ...(child.runtimeReportedVersion
        ? { runtimeReportedVersion: child.runtimeReportedVersion }
        : {}),
      ...(child.buildPackageId ? { buildPackageId: child.buildPackageId } : {}),
      poisoned: false,
      conflictReasons: new Set(),
      conflictEmitted: false,
    };
    nativeTools.set(key, registration);
    if (owner && owner !== key) {
      const previous = nativeTools.get(owner);
      if (previous) poisonTool(previous, 'tool_call_reused');
      poisonTool(registration, 'tool_call_reused');
      return;
    }
    nativeToolOwners.set(rawToolCallId, key);
    emitTool({
      adapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      childId,
      toolCallHash: registration.toolCallHash,
      toolName,
      state: 'started',
      source: 'claude_stream_json',
      sourceEventType: 'assistant.child_tool_use',
      observedAtMs: registration.startedAtMs,
      startedAtMs: registration.startedAtMs,
      ...(registration.runtimeSessionId
        ? { runtimeSessionId: registration.runtimeSessionId }
        : {}),
      ...(registration.runtimeReportedVersion
        ? { runtimeReportedVersion: registration.runtimeReportedVersion }
        : {}),
      ...(registration.buildPackageId
        ? { buildPackageId: registration.buildPackageId }
        : {}),
    });
  }

  function terminalChildTool(inputFact: {
    childId: string;
    rawToolCallId: string;
    state: Exclude<ClaudeChildToolRuntimeFactState, 'started' | 'conflicted'>;
    sourceEventType: ClaudeChildToolRuntimeFact['sourceEventType'];
    terminationReason?: ClaudeChildToolRuntimeFact['terminationReason'];
  }): void {
    const registration = nativeTools.get(nativeToolKey(
      inputFact.childId,
      inputFact.rawToolCallId,
    ));
    if (!registration || registration.poisoned) return;
    if (registration.terminal) {
      if (
        registration.terminal.state !== inputFact.state ||
        registration.terminal.terminationReason !== inputFact.terminationReason
      ) {
        poisonTool(registration, 'terminal_state_conflict');
      }
      return;
    }
    registration.terminal = {
      state: inputFact.state,
      ...(inputFact.terminationReason
        ? { terminationReason: inputFact.terminationReason }
        : {}),
    };
    const observedAtMs = now();
    emitTool({
      adapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      childId: registration.childId,
      toolCallHash: registration.toolCallHash,
      toolName: registration.toolName,
      state: inputFact.state,
      source: 'claude_stream_json',
      sourceEventType: inputFact.sourceEventType,
      observedAtMs,
      startedAtMs: registration.startedAtMs,
      endedAtMs: observedAtMs,
      ...(registration.runtimeSessionId
        ? { runtimeSessionId: registration.runtimeSessionId }
        : {}),
      ...(registration.runtimeReportedVersion
        ? { runtimeReportedVersion: registration.runtimeReportedVersion }
        : {}),
      ...(registration.buildPackageId
        ? { buildPackageId: registration.buildPackageId }
        : {}),
      ...(inputFact.terminationReason
        ? { terminationReason: inputFact.terminationReason }
        : {}),
    });
  }

  function started(childId: string, at: number): ChildLifecycle {
    const existing = lifecycles.get(childId);
    if (existing) return existing;
    const lifecycle = { startedAtMs: at, conflictEmitted: false };
    lifecycles.set(childId, lifecycle);
    const registration = nativeTasks.get(childId);
    if (registration?.poisoned) {
      emitConflict(childId, lifecycle, registration);
      return lifecycle;
    }
    emit({
      adapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      childId,
      ...(registration?.parentChildId
        ? { parentChildId: registration.parentChildId }
        : {}),
      state: 'started',
      source: 'claude_stream_json',
      sourceEventType: 'assistant.parent_tool_use_id',
      observedAtMs: at,
      startedAtMs: at,
      ...(registration?.runtimeSessionId
        ? { runtimeSessionId: registration.runtimeSessionId }
        : {}),
      ...(registration?.runtimeReportedVersion
        ? { runtimeReportedVersion: registration.runtimeReportedVersion }
        : {}),
      ...(registration?.prompt
        ? {
            promptHash: registration.prompt.hash,
            promptBytes: registration.prompt.bytes,
            promptSafePayload: registration.prompt.safePayload,
            promptTruncated: registration.prompt.truncated,
          }
        : {}),
      ...(registration?.nativeAgentType
        ? { nativeAgentType: registration.nativeAgentType }
        : {}),
      ...(registration?.buildPackageId
        ? { buildPackageId: registration.buildPackageId }
        : {}),
    });
    return lifecycle;
  }

  function emitConflict(
    childId: string,
    lifecycle: ChildLifecycle,
    registration: NativeTaskRegistration,
  ): void {
    // `conflicted` adapts to a non-terminal observation. If the Child had not
    // terminated, the graph reports child_terminal_missing; if a contradictory
    // frame arrived after terminal, terminal_status_changed retracts L2.
    if (lifecycle.conflictEmitted) return;
    lifecycle.conflictEmitted = true;
    const at = now();
    emit({
      adapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      childId,
      ...(registration.parentChildId
        ? { parentChildId: registration.parentChildId }
        : {}),
      state: 'conflicted',
      source: 'claude_stream_json',
      sourceEventType: registration.conflictReasons.has('runtime_session_changed')
        ? 'system.init'
        : 'assistant.parent_tool_use_id',
      observedAtMs: at,
      startedAtMs: lifecycle.startedAtMs,
      ...(registration.runtimeSessionId
        ? { runtimeSessionId: registration.runtimeSessionId }
        : {}),
      ...(registration.runtimeReportedVersion
        ? { runtimeReportedVersion: registration.runtimeReportedVersion }
        : {}),
      conflictReasons: [...registration.conflictReasons].sort(),
    });
  }

  function poison(
    childId: string,
    reason: ClaudeChildEvidenceConflictReason,
  ): void {
    const registration = nativeTasks.get(childId);
    if (!registration) return;
    registration.poisoned = true;
    registration.conflictReasons.add(reason);
    const lifecycle = lifecycles.get(childId) ?? {
      startedAtMs: now(),
      conflictEmitted: false,
    };
    if (!lifecycles.has(childId)) lifecycles.set(childId, lifecycle);
    emitConflict(childId, lifecycle, registration);
  }

  function registerTask(
    childId: string,
    parentChildId: string | undefined,
    tool: Omit<ReturnType<typeof nativeTaskToolUses>[number], 'id'>,
  ): void {
    const existing = nativeTasks.get(childId);
    if (existing) {
      if (
        existing.parentChildId !== parentChildId ||
        existing.runtimeSessionId !== runtimeSessionId
      ) {
        poison(childId, existing.parentChildId !== parentChildId
          ? 'task_parent_rebound'
          : 'runtime_session_changed');
      }
      return;
    }
    nativeTasks.set(childId, {
      ...(parentChildId ? { parentChildId } : {}),
      ...(runtimeSessionId ? { runtimeSessionId } : {}),
      ...(runtimeReportedVersion ? { runtimeReportedVersion } : {}),
      ...(tool.prompt ? { prompt: tool.prompt } : {}),
      ...(tool.nativeAgentType ? { nativeAgentType: tool.nativeAgentType } : {}),
      ...(tool.nativeAgentType
        && nonEmptyString(input.nativeBuildPackageBindings?.[tool.nativeAgentType])
        ? { buildPackageId: input.nativeBuildPackageBindings![tool.nativeAgentType]! }
        : {}),
      poisoned: runtimeSessionConflicted,
      conflictReasons: new Set<ClaudeChildEvidenceConflictReason>(
        runtimeSessionConflicted ? ['runtime_session_changed'] : [],
      ),
    });
    if (runtimeSessionConflicted) poison(childId, 'runtime_session_changed');
    started(childId, now());
  }

  function terminal(inputFact: {
    childId: string;
    state: Exclude<ClaudeChildRuntimeFactState, 'started' | 'conflicted'>;
    sourceEventType: ClaudeChildRuntimeFact['sourceEventType'];
    terminationReason?: ClaudeChildRuntimeFact['terminationReason'];
    toolResult?: unknown;
  }): void {
    const at = now();
    const lifecycle = started(inputFact.childId, at);
    const registration = nativeTasks.get(inputFact.childId);
    if (!registration || registration.poisoned) return;
    const toolResult = isRecord(inputFact.toolResult) ? inputFact.toolResult : undefined;
    const nativeAgentId = toolResult ? nonEmptyString(toolResult.agentId) : undefined;
    const nativeAgentType = toolResult ? nonEmptyString(toolResult.agentType) : undefined;
    if (
      nativeAgentType
      && registration.nativeAgentType
      && nativeAgentType !== registration.nativeAgentType
    ) {
      poison(inputFact.childId, 'native_agent_type_rebound');
      return;
    }
    if (nativeAgentId) {
      const owner = nativeAgentOwners.get(nativeAgentId);
      if (owner && owner !== inputFact.childId) {
        poison(owner, 'native_agent_id_reused');
        poison(inputFact.childId, 'native_agent_id_reused');
        return;
      }
      nativeAgentOwners.set(nativeAgentId, inputFact.childId);
    }
    if (lifecycle.terminal) {
      if (
        lifecycle.terminal.state !== inputFact.state ||
        lifecycle.terminal.terminationReason !== inputFact.terminationReason
      ) {
        poison(inputFact.childId, 'terminal_state_conflict');
      }
      return;
    }
    lifecycle.terminal = {
      state: inputFact.state,
      ...(inputFact.terminationReason
        ? { terminationReason: inputFact.terminationReason }
        : {}),
    };
    const resolvedModel = toolResult ? nonEmptyString(toolResult.resolvedModel) : undefined;
    const usage = toolResult ? usageFromToolResult(toolResult) : undefined;
    const nativeDurationMs = toolResult
      ? nonNegativeNumber(toolResult.totalDurationMs)
      : undefined;
    emit({
      adapterVersion: CLAUDE_CHILD_EVIDENCE_ADAPTER_VERSION,
      childId: inputFact.childId,
      ...(registration?.parentChildId
        ? { parentChildId: registration.parentChildId }
        : {}),
      state: inputFact.state,
      source: 'claude_stream_json',
      sourceEventType: inputFact.sourceEventType,
      observedAtMs: at,
      startedAtMs: lifecycle.startedAtMs,
      endedAtMs: at,
      ...(registration.runtimeSessionId
        ? { runtimeSessionId: registration.runtimeSessionId }
        : {}),
      ...(registration.runtimeReportedVersion
        ? { runtimeReportedVersion: registration.runtimeReportedVersion }
        : {}),
      ...(registration.prompt
        ? {
            promptHash: registration.prompt.hash,
            promptBytes: registration.prompt.bytes,
            promptSafePayload: registration.prompt.safePayload,
            promptTruncated: registration.prompt.truncated,
          }
        : {}),
      ...(registration.nativeAgentType
        ? { nativeAgentType: registration.nativeAgentType }
        : {}),
      ...(registration.buildPackageId
        ? { buildPackageId: registration.buildPackageId }
        : {}),
      ...(toolResult
        ? {
            ...(nativeAgentId ? { nativeAgentId } : {}),
            ...(nativeAgentType ? { nativeAgentType } : {}),
            ...(resolvedModel ? { resolvedModel } : {}),
            ...(usage ? { usage } : {}),
            ...(nativeDurationMs === undefined ? {} : { nativeDurationMs }),
          }
        : {}),
      ...(inputFact.terminationReason
        ? { terminationReason: inputFact.terminationReason }
        : {}),
    });
  }

  function observe(value: unknown): void {
    if (!isRecord(value)) return;
    if (
      value.type === 'system' &&
      value.subtype === 'init' &&
      typeof value.session_id === 'string' &&
      value.session_id.trim()
    ) {
      if (runtimeSessionId === undefined) {
        runtimeSessionId = value.session_id;
        runtimeReportedVersion = nonEmptyString(value.claude_code_version);
        if (nativeTasks.size > 0) {
          runtimeSessionConflicted = true;
          for (const childId of nativeTasks.keys()) {
            poison(childId, 'runtime_session_changed');
          }
        }
      } else if (runtimeSessionId !== value.session_id) {
        runtimeSessionConflicted = true;
        for (const childId of nativeTasks.keys()) {
          poison(childId, 'runtime_session_changed');
        }
      }
      return;
    }
    if (value.type === 'user' && isRecord(value.message) && Array.isArray(value.message.content)) {
      const wrapperParentId = nonEmptyString(value.parent_tool_use_id);
      if (wrapperParentId && nativeTasks.has(wrapperParentId)) {
        for (const block of value.message.content) {
          if (!isRecord(block) || block.type !== 'tool_result') continue;
          const rawToolCallId = nonEmptyString(block.tool_use_id);
          if (!rawToolCallId) continue;
          terminalChildTool({
            childId: wrapperParentId,
            rawToolCallId,
            state: block.is_error === true ? 'failed' : 'completed',
            sourceEventType: 'user.child_tool_result',
            ...(block.is_error === true ? { terminationReason: 'tool_error' } : {}),
          });
        }
        return;
      }
      for (const block of value.message.content) {
        if (!isRecord(block) || block.type !== 'tool_result') continue;
        const childId = nonEmptyString(block.tool_use_id);
        if (!childId || !nativeTasks.has(childId)) continue;
        const toolResult = value.tool_use_result;
        const state = block.is_error === true
          ? 'failed'
          : isRecord(toolResult) && toolResult.status === 'completed'
            ? 'completed'
            : isRecord(toolResult)
              && (toolResult.status === 'canceled' || toolResult.status === 'cancelled')
              ? 'canceled'
              : isRecord(toolResult)
                && (toolResult.status === 'failed' || toolResult.status === 'error')
                ? 'failed'
                : undefined;
        if (!state) continue;
        terminal({
          childId,
          state,
          sourceEventType: 'user.tool_result',
          ...(state === 'failed' ? { terminationReason: 'assistant_error' } : {}),
          toolResult,
        });
      }
      return;
    }
    if (value.type !== 'assistant' || !isRecord(value.message)) return;

    const wrapperParentId = typeof value.parent_tool_use_id === 'string' &&
      value.parent_tool_use_id.trim()
      ? value.parent_tool_use_id
      : undefined;
    const wrapperIsKnownChild = wrapperParentId === undefined || nativeTasks.has(wrapperParentId);
    if (wrapperIsKnownChild) {
      for (const task of nativeTaskToolUses(value.message)) {
        registerTask(task.id, wrapperParentId, task);
      }
    }

    if (!wrapperParentId || !nativeTasks.has(wrapperParentId)) return;
    for (const tool of nativeChildToolUses(value.message)) {
      registerChildTool(wrapperParentId, tool.id, tool.name);
    }
    const lifecycle = started(wrapperParentId, now());
    const registration = nativeTasks.get(wrapperParentId);
    if (!registration || registration.poisoned) return;

    if (typeof value.error === 'string' && value.error.trim()) {
      terminal({
        childId: wrapperParentId,
        state: 'failed',
        sourceEventType: 'assistant.parent_tool_use_id',
        terminationReason: 'assistant_error',
      });
      return;
    }
    const stopReason = typeof value.message.stop_reason === 'string'
      ? value.message.stop_reason
      : null;
    // Only the observed native Task end_turn shape proves success. Unknown
    // future stop reasons (for example a provider truncation) keep coverage
    // incomplete instead of being promoted to a completed Child.
    if (stopReason === 'end_turn') {
      terminal({
        childId: wrapperParentId,
        state: 'completed',
        sourceEventType: 'assistant.parent_tool_use_id',
      });
    }
  }

  function finishOpenChildren(reason: ClaudeOpenChildTerminationReason): void {
    collectionTermination = reason;
    const openChildReason = reason === 'complete' ? 'stream_incomplete' : reason;
    for (const registration of nativeTools.values()) {
      if (registration.terminal || registration.poisoned) continue;
      terminalChildTool({
        childId: registration.childId,
        rawToolCallId: registration.rawToolCallId,
        state: openChildReason === 'canceled' ? 'canceled' : 'failed',
        sourceEventType: 'host_process_close',
        terminationReason: openChildReason,
      });
    }
    for (const [childId, lifecycle] of lifecycles) {
      const registration = nativeTasks.get(childId);
      if (lifecycle.terminal || registration?.poisoned) continue;
      terminal({
        childId,
        state: openChildReason === 'canceled' ? 'canceled' : 'failed',
        sourceEventType: 'host_process_close',
        terminationReason: openChildReason,
      });
    }
  }

  function coverage(): ChildEvidenceCoverageV1 {
    const childIds = new Set([...nativeTasks.keys(), ...lifecycles.keys()]);
    const diagnosticCounts = new Map<string, number>();
    const addDiagnostic = (code: string) => {
      diagnosticCounts.set(code, (diagnosticCounts.get(code) ?? 0) + 1);
    };
    if (collectionTermination === null) {
      addDiagnostic('child_collection_not_finalized');
    } else if (collectionTermination !== 'complete') {
      addDiagnostic(`child_collection_${collectionTermination}`);
    }
    if (runtimeSessionConflicted) addDiagnostic('runtime_session_conflicted');
    for (const childId of childIds) {
      const registration = nativeTasks.get(childId);
      const lifecycle = lifecycles.get(childId);
      if (registration?.poisoned) addDiagnostic('child_lifecycle_conflicted');
      if (!lifecycle) {
        addDiagnostic('child_start_unobserved');
      } else if (!lifecycle.terminal) {
        addDiagnostic('child_terminal_unobserved');
      } else if (lifecycle.terminal.terminationReason === 'stream_incomplete') {
        addDiagnostic('child_stream_incomplete');
      }
    }
    const knownChildCount = childIds.size;
    const diagnostics = [...diagnosticCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => ({ code, count }));
    const complete = diagnostics.length === 0;
    return {
      availability: complete ? 'complete' : knownChildCount > 0 ? 'partial' : 'unavailable',
      source: 'claude_stream_json',
      knownChildCount,
      explicitZero: complete && knownChildCount === 0,
      limitations: complete ? [] : diagnostics.map(({ code }) => code),
      diagnosticCounts: diagnostics,
    };
  }

  return { observe, finishOpenChildren, coverage };
}

export interface AdaptClaudeChildFactInput {
  fact: ClaudeChildRuntimeFact;
  agentCliVersion?: string;
  taskExecutionId: string;
  runId: string;
  taskRunIndex: number;
  taskRunObservationId: string;
  /** Langfuse-only parent span for the root native Agent tool invocation. */
  rootParentToolObservationId?: string;
  stage: StrategyInputStageV2;
}

function childObservationId(runId: string, childId: string): string {
  return `claude-child:${runId}:${childId}`;
}

/**
 * Convert one Claude runtime fact to the provider-neutral V1 observation.
 * Claude 2.1.233 exposes Child task text in the structured Agent tool input
 * and independent usage in the matching root tool result. Effective context
 * remains unobservable and is never inferred from the injected task text.
 */
export function adaptClaudeChildRuntimeFactV1(
  input: AdaptClaudeChildFactInput,
): NormalizedAgentObservationV1 {
  const fact = input.fact;
  const status = fact.state === 'started' || fact.state === 'conflicted'
    ? 'running'
    : fact.state === 'completed'
      ? 'completed'
      : fact.state === 'canceled'
        ? 'canceled'
        : 'failed';
  const observation = {
    schema: NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
    identity: {
      observationId: childObservationId(input.runId, fact.childId),
      taskExecutionId: input.taskExecutionId,
      runId: input.runId,
      taskRunIndex: input.taskRunIndex,
      parentObservationId: fact.parentChildId
        ? childObservationId(input.runId, fact.parentChildId)
        : input.rootParentToolObservationId ?? input.taskRunObservationId,
      ...(fact.runtimeSessionId ? { runtimeSessionId: fact.runtimeSessionId } : {}),
    },
    kind: 'child_agent' as const,
    stage: input.stage,
    status,
    prompt: {
      hostComposed: {
        availability: 'unobservable' as const,
        limitations: ['Claude child host-composed Prompt is outside the stream-json boundary.'],
      },
      childInjected: {
        ...(fact.promptHash && fact.promptBytes !== undefined && fact.promptSafePayload
          ? {
              availability: 'exact' as const,
              source: 'provider_stream' as const,
              hash: fact.promptHash,
              bytes: fact.promptBytes,
              safePayload: fact.promptSafePayload,
              limitations: [
                'child_prompt_safe_payload_redacted',
                ...(fact.promptTruncated ? ['child_prompt_safe_payload_truncated'] : []),
              ],
            }
          : {
              availability: 'unavailable' as const,
              source: 'unknown' as const,
              limitations: ['Claude Agent tool input did not expose the Child Prompt.'],
            }),
      },
      agentEffectiveContext: {
        availability: 'unobservable' as const,
        limitations: ['Claude does not expose the effective Child context in this stream.'],
      },
    },
    usage: fact.usage
      ? {
          availability: fact.usage.inputTokens !== undefined
            && fact.usage.outputTokens !== undefined
            ? 'complete' as const
            : 'partial' as const,
          source: 'provider_stream' as const,
          accountingMode: 'unknown' as const,
          values: fact.usage,
          valueSources: Object.fromEntries(
            Object.keys(fact.usage).map((key) => [key, 'provider_stream' as const]),
          ),
          limitations: [
            'claude_child_usage_accounting_unknown',
            ...(fact.usage.inputTokens !== undefined
              && fact.usage.outputTokens !== undefined
              ? []
              : ['claude_child_usage_partial']),
          ],
        }
      : {
          availability: 'unavailable' as const,
          source: 'unknown' as const,
          accountingMode: 'unknown' as const,
          limitations: ['Claude Child usage was not independently reported.'],
        },
    timing: {
      availability: 'partial' as const,
      evidence: [{
        source: 'host_wall_clock' as const,
        clockDomain: 'unix_epoch_ms',
        startedAtMs: fact.startedAtMs,
        ...(fact.endedAtMs === undefined
          ? {}
          : {
              endedAtMs: fact.endedAtMs,
              durationMs: fact.endedAtMs - fact.startedAtMs,
            }),
      }],
      limitations: [
        fact.endedAtMs === undefined
          ? 'Child terminal time has not been observed.'
          : 'Host observation window begins at first sidechain frame, not native Child spawn.',
      ],
    },
    limitations: [
      'Lifecycle is derived only from a matched native Task tool_use and parent_tool_use_id.',
      ...(fact.state === 'conflicted'
        ? ['Claude Child association evidence conflicted; this observation must not be promoted to L2.']
        : []),
    ],
    attributes: {
      runtimeAdapterVersion: fact.adapterVersion,
      ...(input.agentCliVersion
        ? { agentCliVersion: input.agentCliVersion }
        : {}),
      ...(fact.runtimeReportedVersion
        ? { runtimeReportedVersion: fact.runtimeReportedVersion }
        : {}),
      nativeTaskToolUseId: fact.childId,
      ...(fact.nativeAgentId ? { nativeAgentId: fact.nativeAgentId } : {}),
      ...(fact.nativeAgentType ? { nativeAgentType: fact.nativeAgentType } : {}),
      ...(fact.resolvedModel ? { model: fact.resolvedModel } : {}),
      ...(fact.buildPackageId ? { buildPackageId: fact.buildPackageId } : {}),
      source: fact.source,
      sourceEventType: fact.sourceEventType,
      associationStatus: fact.state === 'conflicted' ? 'conflicted' : 'verified',
      ...(fact.conflictReasons ? { conflictReasons: fact.conflictReasons } : {}),
      ...(fact.terminationReason ? { terminationReason: fact.terminationReason } : {}),
    },
  };
  return NormalizedAgentObservationV1Schema.parse(observation);
}

export interface AdaptClaudeChildToolFactInput {
  fact: ClaudeChildToolRuntimeFact;
  agentCliVersion?: string;
  taskExecutionId: string;
  runId: string;
  taskRunIndex: number;
  stage: StrategyInputStageV2;
}

/**
 * Convert one provider-observed Child tool lifecycle into a safe tool span.
 * Tool arguments and results are intentionally absent; only the allowlisted
 * tool name, hashed native call identity, lifecycle, timing, versions, and
 * optional locked Build Package ownership cross the telemetry boundary.
 */
export function adaptClaudeChildToolRuntimeFactV1(
  input: AdaptClaudeChildToolFactInput,
): NormalizedAgentObservationV1 {
  const fact = input.fact;
  const status = fact.state === 'started'
    ? 'running'
    : fact.state === 'completed'
      ? 'completed'
      : fact.state === 'canceled'
        ? 'canceled'
        : fact.state === 'failed'
          ? 'failed'
          : 'unknown';
  return NormalizedAgentObservationV1Schema.parse({
    schema: NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
    identity: {
      observationId:
        `claude-child-tool:${input.runId}:${fact.childId}:${fact.toolCallHash}`,
      taskExecutionId: input.taskExecutionId,
      runId: input.runId,
      taskRunIndex: input.taskRunIndex,
      parentObservationId: childObservationId(input.runId, fact.childId),
      ...(fact.runtimeSessionId ? { runtimeSessionId: fact.runtimeSessionId } : {}),
    },
    kind: 'tool',
    stage: input.stage,
    status,
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
    timing: {
      availability: 'partial',
      evidence: [{
        source: 'host_wall_clock',
        clockDomain: 'unix_epoch_ms',
        startedAtMs: fact.startedAtMs,
        ...(fact.endedAtMs === undefined
          ? {}
          : {
              endedAtMs: fact.endedAtMs,
              durationMs: fact.endedAtMs - fact.startedAtMs,
            }),
      }],
      limitations: [
        fact.endedAtMs === undefined
          ? 'tool_terminal_not_observed'
          : 'tool_timing_is_host_observation_window',
      ],
    },
    limitations: [
      'tool_input_and_output_redacted',
      ...(fact.state === 'conflicted' ? ['tool_lifecycle_conflicted'] : []),
    ],
    attributes: {
      runtimeAdapterVersion: fact.adapterVersion,
      ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
      ...(fact.runtimeReportedVersion
        ? { runtimeReportedVersion: fact.runtimeReportedVersion }
        : {}),
      toolName: fact.toolName,
      toolCallHash: fact.toolCallHash,
      ...(fact.buildPackageId ? { buildPackageId: fact.buildPackageId } : {}),
      source: fact.source,
      sourceEventType: fact.sourceEventType,
      associationStatus: fact.state === 'conflicted' ? 'conflicted' : 'verified',
      ...(fact.conflictReasons ? { conflictReasons: fact.conflictReasons } : {}),
      ...(fact.terminationReason ? { terminationReason: fact.terminationReason } : {}),
    },
  });
}
