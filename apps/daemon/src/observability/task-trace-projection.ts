import { taskObjectMetadata } from './task-object-summary.js';
import type { RunUsageAnalytics } from '../run-analytics-observability.js';
import { codexTurnUsageFromEvents } from './codex-turn-usage.js';
/** Legacy-compatible summaries of physical Runs without duplicating Run traces. */
export interface TaskRunTraceProjection {
  runId: string;
  input?: unknown;
  output?: unknown;
  metadata: Record<string, unknown>;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function projectTaskTrace(runs: TaskRunTraceProjection[], durationMs: number) {
  const first = runs[0];
  const last = runs.at(-1);
  if (!first || !last) return undefined;
  const terminal = runs.find(run => run.metadata.status === 'failed' || run.metadata.status === 'canceled') ?? last;
  const sum = (field: string, key: string): number | undefined => {
    const values = runs.map(run => record(run.metadata[field])[key]);
    return values.every(value => typeof value === 'number' && Number.isFinite(value))
      ? (values as number[]).reduce((a, b) => a + b, 0) : undefined;
  };
  const tokens = Object.fromEntries(['input', 'inputProvider', 'inputEffective', 'output', 'total', 'thought', 'cacheReadInput', 'cacheCreationInput', 'uncachedInput']
    .flatMap(key => { const value = sum('tokens', key); return value === undefined ? [] : [[key, value]]; }));
  const metadata: Record<string, unknown> = {
    ...terminal.metadata,
    tokens: Object.keys(tokens).length ? tokens : undefined,
    eventsSummary: { toolCalls: sum('eventsSummary', 'toolCalls'), errors: sum('eventsSummary', 'errors'), durationMs },
    usage_scope: 'task_physical_runs', visible_message_run_id: last.runId, user_input_run_id: first.runId,
    run_metadata: runs.map(({ runId, metadata: { promptStack: _prompt, ...metadata } }) => ({ runId, metadata })),
    promptStack: first.metadata.promptStack,
    input_truncated: first.metadata.input_truncated, output_truncated: last.metadata.output_truncated,
  };
  for (const key of ['attachment_manifest', 'artifact_manifest', 'input_text_snapshot_manifest', 'artifacts']) {
    metadata[key] = runs.flatMap(run => Array.isArray(run.metadata[key]) ? run.metadata[key] as unknown[] : []);
  }
  Object.assign(metadata, taskObjectMetadata(runs.map(run => run.metadata)));
  // Physical Run facts remain in run_metadata; they are not Task totals.
  for (const key of ['langfuse_trace_id', 'cost_usd', 'cost_breakdown', 'performance_diagnostics']) delete metadata[key];
  return { input: first.input, output: last.output, metadata };
}

/** Codex stream totals span a resumed session; stage counters must use the current Turn. */
export function taskRunUsage(agentId: string | null | undefined, events: Array<{ event: string; data: unknown }>, provider: RunUsageAnalytics): RunUsageAnalytics {
  if (agentId !== 'codex') return provider;
  const turn = codexTurnUsageFromEvents(events);
  return {
    agent_reported_model: provider.agent_reported_model,
    cache_token_source: 'unavailable', input_accounting_mode: turn ? 'inclusive' : 'unknown',
    token_count_source: turn ? 'provider_usage' : 'unknown',
    ...(turn ? { input_tokens: turn.input, input_tokens_provider: turn.input, input_tokens_effective: turn.input, output_tokens: turn.output, total_tokens: turn.total } : {}),
  };
}
