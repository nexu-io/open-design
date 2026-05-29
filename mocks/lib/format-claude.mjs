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
        },
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }

  emit(JSON.stringify({
    type: 'result',
    subtype: 'success',
    usage: {
      input_tokens: 0,
      output_tokens: meta?.total_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    total_cost_usd: 0,
    duration_ms: meta?.duration_ms ?? 0,
    stop_reason: 'end_turn',
  }) + '\n');
}
