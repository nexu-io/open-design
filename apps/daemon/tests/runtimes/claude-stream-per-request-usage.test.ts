/**
 * Per-request token usage capture for the `claude-stream-json` family
 * (#3408 / #3547 follow-up B).
 *
 * Before this change the parser read `message.id` only to dedup streamed
 * text/thinking and dropped it, and never read `message.usage` at all — the
 * whole run collapsed into a single run-level `result.usage` record with no
 * request id. These tests pin the new behavior:
 *
 *  1. Every assistant `message` with a `message.usage` emits one
 *     `request_usage` event keyed by `requestId` (the provider `msg_…` id).
 *  2. The per-request token sum reconciles against the run-level
 *     `result.usage` aggregate — the correctness anchor from the issue.
 *  3. The replay mock (`mocks/lib/format-claude.mjs`) emits per-message usage
 *     so the capture path is verifiable without live provider calls.
 */

import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import {
  createRunPerRequestUsageLedger,
  foldEventIntoPerRequestUsageLedger,
  perRequestUsageForRun,
  scanRunEventsForPerRequestUsageAnalytics,
} from '../../src/run-analytics-observability.js';
import { daemonAgentPayloadToPersistedAgentEvent } from '../../src/runtimes/chat-run-messages.js';
import { createChatRunService } from '../../src/runtimes/runs.js';
// Untyped replay-mock helper (plain .mjs, no shipped declarations) — imported
// so the per-request capture path is validated against the real mock output.
// @ts-expect-error: no type declarations for the mocks helper
import { renderAsClaude } from '../../../../mocks/lib/format-claude.mjs';

// Wrap the parser's live SSE events as persisted run.events (`event: 'agent'`,
// `data: <payload>`), the shape the analytics/telemetry scanners consume.
function asRunEvents(events: Event[]) {
  return events.map((data, id) => ({ id, event: 'agent', data }));
}

type Event = Record<string, unknown>;

function collect(): { events: Event[]; sink: (ev: Event) => void } {
  const events: Event[] = [];
  return { events, sink: (ev) => events.push(ev) };
}

function feed(handler: ReturnType<typeof createClaudeStreamHandler>, objs: object[]) {
  for (const obj of objs) handler.feed(JSON.stringify(obj) + '\n');
}

function requestUsages(events: Event[]) {
  return events.filter((e) => e.type === 'request_usage');
}

describe('claude-stream per-request usage capture', () => {
  it('emits one request_usage per assistant message keyed by message.id', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feed(handler, [
      {
        type: 'assistant',
        message: {
          id: 'msg_req_1',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: {} }],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 5,
            cache_read_input_tokens: 7,
          },
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg_req_2',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 10 },
        },
      },
    ]);

    const usages = requestUsages(events);
    expect(usages).toHaveLength(2);
    expect(usages[0]).toMatchObject({
      type: 'request_usage',
      requestId: 'msg_req_1',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 5,
        cache_read_input_tokens: 7,
      },
    });
    expect(usages[1]).toMatchObject({
      type: 'request_usage',
      requestId: 'msg_req_2',
      usage: { input_tokens: 50, output_tokens: 10 },
    });
  });

  it('does not emit request_usage when message.usage is absent', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);
    feed(handler, [
      {
        type: 'assistant',
        message: {
          id: 'msg_no_usage',
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          stop_reason: 'end_turn',
        },
      },
    ]);
    expect(requestUsages(events)).toHaveLength(0);
  });

  it('reconciles per-request token sum against the run-level result.usage', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feed(handler, [
      {
        type: 'assistant',
        message: {
          id: 'msg_a',
          content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 30, output_tokens: 4, cache_read_input_tokens: 1 },
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg_b',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 6, cache_read_input_tokens: 2 },
        },
      },
      {
        type: 'result',
        subtype: 'success',
        usage: {
          input_tokens: 42,
          output_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 3,
        },
      },
    ]);

    const usages = requestUsages(events);
    const sum = (k: string) =>
      usages.reduce((acc, e) => acc + (((e.usage as Record<string, number>)[k]) ?? 0), 0);

    const runLevel = events.find((e) => e.type === 'usage')!.usage as Record<string, number>;
    expect(sum('input_tokens')).toBe(runLevel.input_tokens);
    expect(sum('output_tokens')).toBe(runLevel.output_tokens);
    expect(sum('cache_read_input_tokens')).toBe(runLevel.cache_read_input_tokens);
  });

  it('reconciles per-request usage end-to-end through the replay mock', async () => {
    const out: string[] = [];
    await renderAsClaude(
      [
        { type: 'meta', model: 'claude', total_tokens: 100, duration_ms: 0 },
        { type: 'tool_call', obs_id: 'o1', name: 'Read', input: {} },
        { type: 'tool_result', obs_id: 'o1', output: 'x', status: 'ok' },
        { type: 'tool_call', obs_id: 'o2', name: 'Write', input: {} },
        { type: 'tool_result', obs_id: 'o2', output: 'y', status: 'ok' },
        { type: 'report', content: 'all done' },
      ],
      { emit: (s: string) => out.push(s), noDelay: true, sessionId: 'sess' },
    );

    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);
    handler.feed(out.join(''));

    const usages = requestUsages(events);
    // 2 tool_call messages + 1 report message = 3 assistant messages.
    expect(usages).toHaveLength(3);
    for (const u of usages) {
      expect(typeof u.requestId).toBe('string');
      expect((u.requestId as string).startsWith('msg_')).toBe(true);
    }

    const sum = (k: string) =>
      usages.reduce((acc, e) => acc + (((e.usage as Record<string, number>)[k]) ?? 0), 0);
    const runLevel = events.find((e) => e.type === 'usage')!.usage as Record<string, number>;
    expect(sum('input_tokens')).toBe(runLevel.input_tokens);
    expect(sum('output_tokens')).toBe(runLevel.output_tokens);
    expect(sum('output_tokens')).toBe(100);
    expect(sum('cache_read_input_tokens')).toBe(runLevel.cache_read_input_tokens);
  });

  it('rolls per-request records into run telemetry keyed by request_id, reconciling with result.usage', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);
    feed(handler, [
      {
        type: 'assistant',
        message: {
          id: 'msg_a',
          content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 30, output_tokens: 4, cache_read_input_tokens: 1 },
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg_b',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 6, cache_read_input_tokens: 2 },
        },
      },
      {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 42, output_tokens: 10, cache_read_input_tokens: 3 },
      },
    ]);

    // The analytics scanner that feeds PostHog `run_finished` per-request
    // coverage properties — one record per model request, keyed by request_id,
    // sum reconciling with the run-level aggregate.
    const analytics = scanRunEventsForPerRequestUsageAnalytics(asRunEvents(events));
    expect(analytics.request_count).toBe(2);
    expect(analytics.records.map((r) => r.request_id)).toEqual(['msg_a', 'msg_b']);
    expect(analytics.input_tokens_sum).toBe(42);
    expect(analytics.output_tokens_sum).toBe(10);
    expect(analytics.reconciles_aggregate).toBe(true);
  });

  it('flags non-reconciling per-request sums', () => {
    const events: Event[] = [
      { type: 'request_usage', requestId: 'msg_a', usage: { input_tokens: 5, output_tokens: 2 } },
      { type: 'usage', usage: { input_tokens: 99, output_tokens: 2 } },
    ];
    const analytics = scanRunEventsForPerRequestUsageAnalytics(asRunEvents(events));
    expect(analytics.reconciles_aggregate).toBe(false);
  });

  it('does NOT certify reconciliation when only cache tokens drift', () => {
    // input/output sums match the aggregate exactly, but the per-request cache
    // creation/read sums do not — the flag must be false, not a partial pass.
    const events: Event[] = [
      {
        type: 'request_usage',
        requestId: 'msg_a',
        usage: {
          input_tokens: 30,
          output_tokens: 4,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 1,
        },
      },
      {
        type: 'request_usage',
        requestId: 'msg_b',
        usage: {
          input_tokens: 12,
          output_tokens: 6,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 2,
        },
      },
      {
        type: 'usage',
        usage: {
          input_tokens: 42, // == 30 + 12 ✓
          output_tokens: 10, // == 4 + 6 ✓
          cache_creation_input_tokens: 99, // != 5 + 0 ✗
          cache_read_input_tokens: 3, // == 1 + 2 ✓
        },
      },
    ];
    const analytics = scanRunEventsForPerRequestUsageAnalytics(asRunEvents(events));
    expect(analytics.input_tokens_sum).toBe(42);
    expect(analytics.output_tokens_sum).toBe(10);
    expect(analytics.reconciles_aggregate).toBe(false);
  });

  it('persists request_usage into durable PersistedAgentEvent through daemonAgentPayloadToPersistedAgentEvent', () => {
    const liveEvent = {
      type: 'request_usage',
      requestId: 'msg_test_123',
      usage: {
        input_tokens: 15,
        output_tokens: 8,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 4,
      },
    };
    const persisted = daemonAgentPayloadToPersistedAgentEvent(liveEvent);
    expect(persisted).toEqual({
      kind: 'request_usage',
      requestId: 'msg_test_123',
      inputTokens: 15,
      outputTokens: 8,
      cacheCreationInputTokens: 2,
      cacheReadInputTokens: 4,
    });
  });

  it('preserves early per-request usage and reconciles aggregate when run.events is truncated past 2,000 events', () => {
    // Simulate createChatRunService with onEventEmitted folding into run.perRequestUsageLedger
    const run = {
      id: 'run-long-truncation',
      events: [] as Array<{ id: number; event: string; data: unknown }>,
      perRequestUsageLedger: createRunPerRequestUsageLedger(),
    };

    const emit = (event: string, data: unknown) => {
      const record = { id: run.events.length + 1, event, data };
      foldEventIntoPerRequestUsageLedger(run.perRequestUsageLedger, record);
      run.events.push(record);
      // Ring-buffer truncation capped at 2,000 events
      if (run.events.length > 2_000) {
        run.events.splice(0, run.events.length - 2_000);
      }
    };

    // 1. Early request_usage emitted near start of run
    emit('agent', {
      type: 'request_usage',
      requestId: 'msg_early_1',
      usage: {
        input_tokens: 120,
        output_tokens: 45,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 15,
      },
    });

    // 2. More than 2,000 subsequent events (e.g. streaming output, stdout, tool deltas)
    for (let i = 0; i < 2_050; i++) {
      emit('stdout', { chunk: `line ${i}\n` });
    }

    // 3. Final aggregate usage emitted at end of run
    emit('agent', {
      type: 'usage',
      usage: {
        input_tokens: 120,
        output_tokens: 45,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 15,
      },
    });

    // Verify run.events was truncated and no longer has the early request_usage event
    expect(run.events.length).toBe(2_000);
    const hasRequestUsageInEvents = run.events.some(
      (e) => (e.data as { type?: string })?.type === 'request_usage',
    );
    expect(hasRequestUsageInEvents).toBe(false);

    // Verify perRequestUsageForRun reads the ledger and preserves the full record & reconciliation
    const analytics = perRequestUsageForRun(run);
    expect(analytics.request_count).toBe(1);
    expect(analytics.records).toEqual([
      {
        request_id: 'msg_early_1',
        input_tokens: 120,
        output_tokens: 45,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 15,
      },
    ]);
    expect(analytics.input_tokens_sum).toBe(120);
    expect(analytics.output_tokens_sum).toBe(45);
    expect(analytics.cache_creation_input_tokens_sum).toBe(10);
    expect(analytics.cache_read_input_tokens_sum).toBe(15);
    expect(analytics.reconciles_aggregate).toBe(true);
  });
});
