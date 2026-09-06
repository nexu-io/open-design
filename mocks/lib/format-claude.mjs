// OD-faithful claude-stream-json renderer. Matches OD's
// `claude-stream.ts:createClaudeStreamHandler` parser.
//
// Each tool call lives in its own assistant message wrapper (the
// "finalized blocks" path — simpler than stream_event deltas, identical
// semantics).

import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderAsClaude(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 3000;
  const meta = events.find(e => e.type === 'meta');
  const sessionId = opts.sessionId ?? randomUUID();

  emit(JSON.stringify({
    type: 'system',
    subtype: 'init',
    model: meta?.model ?? null,
    session_id: sessionId,
  }) + '\n');

  const results = new Map();
  for (const e of events) if (e.type === 'tool_result') results.set(e.obs_id, e);

  // Per-request usage distribution. Each assistant message carries its own
  // `message.usage` (input/output/cache tokens) so the daemon's per-request
  // capture path can be validated by replay without burning provider budget.
  // The run-level `result.usage` below is the sum of these per-message usages,
  // so the per-request reconciliation invariant (sum === result) holds.
  const assistantCount = events.filter(
    e => e.type === 'tool_call' || e.type === 'report',
  ).length;
  const totalOutput = meta?.total_tokens ?? 0;
  const agg = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let assistantIndex = 0;
  // Deterministic per-message usage that sums cleanly back to the totals: the
  // run output is split evenly across messages (last one absorbs the
  // remainder), and each message reports a small fixed input/cache footprint.
  const perMessageUsage = () => {
    const remaining = assistantCount - assistantIndex;
    const output = remaining > 0 ? Math.floor((totalOutput - agg.output_tokens) / remaining) : 0;
    assistantIndex += 1;
    const usage = {
      input_tokens: 12,
      output_tokens: output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 3,
    };
    agg.input_tokens += usage.input_tokens;
    agg.output_tokens += usage.output_tokens;
    agg.cache_creation_input_tokens += usage.cache_creation_input_tokens;
    agg.cache_read_input_tokens += usage.cache_read_input_tokens;
    return usage;
  };

  let lastT = 0;
  for (const e of events) {
    if (e.type === 'meta' || e.type === 'stdout' || e.type === 'tool_result') continue;
    const t = typeof e.t_ms === 'number' ? e.t_ms : undefined;
    if (!opts.noDelay && t !== undefined) {
      const delta = Math.min(maxSleep, Math.max(0, t - lastT));
      if (delta > 0) await sleep(delta);
      lastT = t;
    }
    if (e.type === 'tool_call') {
      const result = results.get(e.obs_id);
      const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      emit(JSON.stringify({
        type: 'assistant',
        message: {
          id: messageId,
          role: 'assistant',
          content: [{
            type: 'tool_use', id: e.obs_id, name: e.name, input: e.input ?? {},
          }],
          stop_reason: 'tool_use',
          usage: perMessageUsage(),
        },
      }) + '\n');
      emit(JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: e.obs_id,
            content: result?.output ?? '',
            is_error: result?.status === 'error',
          }],
        },
      }) + '\n');
    } else if (e.type === 'report') {
      const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      emit(JSON.stringify({
        type: 'assistant',
        message: {
          id: messageId,
          role: 'assistant',
          content: [{ type: 'text', text: e.content }],
          stop_reason: 'end_turn',
          usage: perMessageUsage(),
        },
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }

  emit(JSON.stringify({
    type: 'result',
    subtype: 'success',
    // Sum of the per-message `message.usage` emitted above, so the daemon's
    // per-request sum reconciles against this run-level aggregate.
    usage: {
      input_tokens: agg.input_tokens,
      output_tokens: agg.output_tokens,
      cache_creation_input_tokens: agg.cache_creation_input_tokens,
      cache_read_input_tokens: agg.cache_read_input_tokens,
    },
    total_cost_usd: 0,
    duration_ms: meta?.duration_ms ?? 0,
    stop_reason: 'end_turn',
  }) + '\n');
}
