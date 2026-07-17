import type {
  AgentActivityFailureReason,
  AgentActivityTerminalSource,
  AgentActivityTokenCountSource,
  AgentActivityTrigger,
} from '@open-design/contracts';

export type AgentActivityPayload = {
  type: 'activity';
  activity: 'context_compaction';
  activityId: string;
  trigger?: AgentActivityTrigger;
  detail?: string;
  tokenCountSource?: AgentActivityTokenCountSource;
  tokensBefore?: number;
  tokensAfter?: number;
  failureReason?: AgentActivityFailureReason;
  terminalSource?: AgentActivityTerminalSource;
} & (
  | { phase: 'started' | 'progress'; startedAt: number; elapsedMs?: never }
  | { phase: 'completed' | 'failed'; startedAt?: number; elapsedMs?: number }
);

type ActiveActivity = {
  activityId: string;
  trigger?: AgentActivityTrigger;
  startedAt: number;
  tokenCountSource?: AgentActivityTokenCountSource;
  tokensBefore?: number;
};

const TOKEN_COUNT_SOURCES = new Set<AgentActivityTokenCountSource>([
  'native',
  'usage_snapshot',
  'estimated',
  'unavailable',
]);
const FAILURE_REASONS = new Set<AgentActivityFailureReason>([
  'aborted',
  'runtime_error',
  'run_terminated',
  'protocol_error',
  'unknown',
]);
const TERMINAL_SOURCES = new Set<AgentActivityTerminalSource>(['native', 'run_finalizer']);

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

export function isAgentActivityPayload(value: unknown): value is AgentActivityPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (
    event.type !== 'activity' ||
    event.activity !== 'context_compaction' ||
    typeof event.activityId !== 'string' ||
    !event.activityId
  ) {
    return false;
  }
  if (event.phase === 'started' || event.phase === 'progress') {
    return typeof event.startedAt === 'number';
  }
  return event.phase === 'completed' || event.phase === 'failed';
}

export function normalizeAgentActivityPayload(
  event: AgentActivityPayload,
  scope: { runId: string; attemptIndex: number },
): AgentActivityPayload {
  const prefix = `${scope.runId}:attempt-${scope.attemptIndex}:`;
  const activityId = event.activityId.startsWith(prefix)
    ? event.activityId
    : `${prefix}${event.activityId}`;
  const normalizedTokenCountSource = event.tokenCountSource
    && TOKEN_COUNT_SOURCES.has(event.tokenCountSource)
    ? event.tokenCountSource
    : undefined;
  const normalizedTokensBefore = tokenCount(event.tokensBefore);
  const normalizedTokensAfter = tokenCount(event.tokensAfter);
  const common = {
    type: 'activity' as const,
    activity: 'context_compaction' as const,
    activityId,
    ...(event.trigger ? { trigger: event.trigger } : {}),
    ...(normalizedTokenCountSource
      ? { tokenCountSource: normalizedTokenCountSource }
      : {}),
    ...(normalizedTokensBefore !== undefined
      ? { tokensBefore: normalizedTokensBefore }
      : {}),
  };
  if (event.phase === 'started' || event.phase === 'progress') {
    return { ...common, phase: event.phase, startedAt: event.startedAt };
  }
  return {
    ...common,
    phase: event.phase,
    ...(typeof event.startedAt === 'number' ? { startedAt: event.startedAt } : {}),
    ...(typeof event.elapsedMs === 'number' ? { elapsedMs: event.elapsedMs } : {}),
    ...(normalizedTokensAfter !== undefined
      ? { tokensAfter: normalizedTokensAfter }
      : {}),
    ...(event.phase === 'failed' && event.failureReason && FAILURE_REASONS.has(event.failureReason)
      ? { failureReason: event.failureReason }
      : {}),
    ...(event.terminalSource && TERMINAL_SOURCES.has(event.terminalSource)
      ? { terminalSource: event.terminalSource }
      : {}),
  };
}

export function agentActivityAnalyticsEvent(
  event: AgentActivityPayload,
  run: {
    id: string;
    projectId?: string | null;
    conversationId?: string | null;
    agentId?: string | null;
    runtimeType?: string | null;
  },
): {
  eventName:
    | 'agent_context_compaction_started'
    | 'agent_context_compaction_completed'
    | 'agent_context_compaction_failed';
  insertId: string;
  properties: Record<string, unknown>;
} | null {
  if (event.phase === 'progress') return null;
  let eventName: 'agent_context_compaction_started'
    | 'agent_context_compaction_completed'
    | 'agent_context_compaction_failed';
  if (event.phase === 'started') {
    eventName = 'agent_context_compaction_started';
  } else if (event.phase === 'completed') {
    eventName = 'agent_context_compaction_completed';
  } else {
    eventName = 'agent_context_compaction_failed';
  }
  return {
    eventName,
    insertId: `${event.activityId}:${event.phase}`,
    properties: {
      run_id: run.id,
      project_id: run.projectId ?? null,
      conversation_id: run.conversationId ?? null,
      agent_id: run.agentId ?? null,
      runtime_type: run.runtimeType ?? 'unknown',
      page_name: 'chat_panel',
      area: 'chat_panel',
      activity_id: event.activityId,
      trigger: event.trigger ?? 'unknown',
      token_count_source: event.tokenCountSource ?? 'unavailable',
      started_signal_seen: typeof event.startedAt === 'number',
      duration_status: typeof event.elapsedMs === 'number' ? 'measured' : 'unavailable',
      ...(typeof event.elapsedMs === 'number' ? { elapsed_ms: event.elapsedMs } : {}),
      ...(typeof event.tokensBefore === 'number' ? { tokens_before: event.tokensBefore } : {}),
      ...(typeof event.tokensAfter === 'number' ? { tokens_after: event.tokensAfter } : {}),
      ...(typeof event.tokensBefore === 'number' && typeof event.tokensAfter === 'number'
        ? {
            token_delta: event.tokensAfter - event.tokensBefore,
            ...(event.tokensAfter <= event.tokensBefore
              ? {
                  tokens_removed: event.tokensBefore - event.tokensAfter,
                  token_reduction_ratio: event.tokensBefore > 0
                    ? (event.tokensBefore - event.tokensAfter) / event.tokensBefore
                    : 0,
                }
              : {}),
          }
        : {}),
      ...(event.phase === 'failed'
        ? { failure_reason: event.failureReason ?? 'unknown' }
        : {}),
      ...(event.phase === 'completed' || event.phase === 'failed'
        ? { terminal_source: event.terminalSource ?? 'native' }
        : {}),
    },
  };
}

export function createAgentActivityLifecycle() {
  const active = new Map<string, ActiveActivity>();
  const terminal = new Set<string>();

  const accept = (event: AgentActivityPayload): boolean => {
    if (terminal.has(event.activityId)) return false;
    if (event.phase === 'completed' || event.phase === 'failed') {
      terminal.add(event.activityId);
      active.delete(event.activityId);
      return true;
    }
    if (typeof event.startedAt !== 'number') return false;

    const previous = active.get(event.activityId);
    const trigger = event.trigger ?? previous?.trigger;
    const tokenCountSource = event.tokenCountSource ?? previous?.tokenCountSource;
    const tokensBefore = tokenCount(event.tokensBefore ?? previous?.tokensBefore);
    active.set(event.activityId, {
      activityId: event.activityId,
      startedAt: previous?.startedAt ?? event.startedAt,
      ...(trigger ? { trigger } : {}),
      ...(tokenCountSource ? { tokenCountSource } : {}),
      ...(tokensBefore !== undefined ? { tokensBefore } : {}),
    });
    return true;
  };

  const terminalEvents = (now = Date.now()): AgentActivityPayload[] =>
    Array.from(active.values(), (activity) => ({
      type: 'activity',
      activity: 'context_compaction',
      activityId: activity.activityId,
      phase: 'failed',
      ...(activity.trigger ? { trigger: activity.trigger } : {}),
      ...(activity.tokenCountSource ? { tokenCountSource: activity.tokenCountSource } : {}),
      ...(typeof activity.tokensBefore === 'number' ? { tokensBefore: activity.tokensBefore } : {}),
      startedAt: activity.startedAt,
      elapsedMs: Math.max(0, now - activity.startedAt),
      failureReason: 'run_terminated',
      terminalSource: 'run_finalizer',
    }));

  return { accept, terminalEvents };
}

export function summarizeContextCompactionRunAnalytics(
  events: Array<{ event: string; data: unknown }>,
): Record<string, unknown> {
  type ActivitySummary = {
    trigger?: AgentActivityTrigger;
    phase?: AgentActivityPayload['phase'];
    elapsedMs?: number;
    tokenCountSource?: AgentActivityTokenCountSource;
    tokensBefore?: number;
    tokensAfter?: number;
    failureReason?: AgentActivityFailureReason;
    terminalSource?: AgentActivityTerminalSource;
    terminalIndex?: number;
  };
  const activities = new Map<string, ActivitySummary>();
  let postOutputSeen = false;
  let latestCompletedIndex = -1;

  events.forEach((record, index) => {
    if (record.event === 'agent' && isAgentActivityPayload(record.data)) {
      const event = record.data;
      const previous = activities.get(event.activityId) ?? {};
      const terminal = event.phase === 'completed' || event.phase === 'failed';
      activities.set(event.activityId, {
        ...previous,
        phase: event.phase,
        ...(event.trigger ? { trigger: event.trigger } : {}),
        ...(typeof event.elapsedMs === 'number' ? { elapsedMs: event.elapsedMs } : {}),
        ...(event.tokenCountSource ? { tokenCountSource: event.tokenCountSource } : {}),
        ...(typeof event.tokensBefore === 'number' ? { tokensBefore: event.tokensBefore } : {}),
        ...(typeof event.tokensAfter === 'number' ? { tokensAfter: event.tokensAfter } : {}),
        ...(event.failureReason ? { failureReason: event.failureReason } : {}),
        ...(event.terminalSource ? { terminalSource: event.terminalSource } : {}),
        ...(terminal ? { terminalIndex: index } : {}),
      });
      if (event.phase === 'completed') latestCompletedIndex = index;
      return;
    }
    if (latestCompletedIndex >= 0 && index > latestCompletedIndex && isPostCompactionOutput(record)) {
      postOutputSeen = true;
    }
  });

  const summaries = Array.from(activities.values());
  const completed = summaries.filter((item) => item.phase === 'completed');
  const failed = summaries.filter((item) => item.phase === 'failed');
  const incomplete = summaries.filter((item) => item.phase !== 'completed' && item.phase !== 'failed');
  const durations = summaries.flatMap((item) => (
    typeof item.elapsedMs === 'number' ? [Math.max(0, item.elapsedMs)] : []
  ));
  const tokenSummaries = summaries.filter((item) => (
    typeof item.tokensBefore === 'number' && typeof item.tokensAfter === 'number'
  ));
  const last = summaries
    .filter((item) => item.terminalIndex !== undefined)
    .sort((a, b) => (a.terminalIndex ?? -1) - (b.terminalIndex ?? -1))
    .at(-1) ?? summaries.at(-1);
  const totalTokensRemoved = tokenSummaries.reduce((total, item) => (
    typeof item.tokensBefore === 'number'
      && typeof item.tokensAfter === 'number'
      && item.tokensAfter <= item.tokensBefore
      ? total + item.tokensBefore - item.tokensAfter
      : total
  ), 0);

  return {
    context_compaction_count: summaries.length,
    context_compaction_completed_count: completed.length,
    context_compaction_failed_count: failed.length,
    context_compaction_incomplete_count: incomplete.length,
    context_compaction_observability_status: summaries.length === 0
      ? 'none'
      : incomplete.length > 0
        ? 'incomplete'
        : 'complete',
    context_compaction_duration_sample_count: durations.length,
    context_compaction_total_duration_ms: durations.reduce((sum, value) => sum + value, 0),
    context_compaction_max_duration_ms: durations.length > 0 ? Math.max(...durations) : 0,
    context_compaction_token_metrics_count: tokenSummaries.length,
    context_compaction_token_count_source: last?.tokenCountSource ?? 'unavailable',
    context_compaction_native_terminal_count: summaries.filter(
      (item) => (item.phase === 'completed' || item.phase === 'failed')
        && (item.terminalSource ?? 'native') === 'native',
    ).length,
    context_compaction_finalizer_terminal_count: summaries.filter(
      (item) => item.terminalSource === 'run_finalizer',
    ).length,
    ...(completed.length > 0 ? { context_compaction_post_output_seen: postOutputSeen } : {}),
    ...(last?.trigger ? { context_compaction_last_trigger: last.trigger } : {}),
    ...(last?.failureReason
      ? { context_compaction_last_failure_reason: last.failureReason }
      : {}),
    ...(last?.terminalSource
      ? { context_compaction_last_terminal_source: last.terminalSource }
      : {}),
    ...(typeof last?.tokensBefore === 'number'
      ? { context_compaction_last_tokens_before: last.tokensBefore }
      : {}),
    ...(typeof last?.tokensAfter === 'number'
      ? { context_compaction_last_tokens_after: last.tokensAfter }
      : {}),
    ...(tokenSummaries.length > 0
      ? { context_compaction_total_tokens_removed: totalTokensRemoved }
      : {}),
    ...(typeof last?.tokensBefore === 'number'
      && typeof last.tokensAfter === 'number'
      && last.tokensAfter <= last.tokensBefore
      ? {
          context_compaction_last_reduction_ratio: last.tokensBefore > 0
            ? (last.tokensBefore - last.tokensAfter) / last.tokensBefore
            : 0,
        }
      : {}),
  };
}

function isPostCompactionOutput(record: { event: string; data: unknown }): boolean {
  if (record.event !== 'agent' || !record.data || typeof record.data !== 'object') return false;
  const data = record.data as Record<string, unknown>;
  if (data.type === 'text_delta') return typeof data.delta === 'string' && data.delta.trim().length > 0;
  return data.type === 'tool_use' || data.type === 'artifact' || data.type === 'live_artifact';
}
