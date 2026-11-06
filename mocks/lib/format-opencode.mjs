// OD-faithful opencode renderer. Emits the JSONL shape OD's
// `json-event-stream.ts:handleOpenCodeEvent` parser accepts.

import { writeFile } from 'node:fs/promises';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderAsOpencode(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 3000;
  const sessionId = opts.sessionId ?? `mock-${Date.now()}`;
  const meta = events.find(e => e.type === 'meta');

  const results = new Map();
  for (const e of events) if (e.type === 'tool_result') results.set(e.obs_id, e);

  emit(JSON.stringify({ type: 'step_start' }) + '\n');

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
      const isErr = result?.status === 'error';
      emit(JSON.stringify({
        type: 'tool_use',
        sessionID: sessionId,
        part: {
          tool: e.name,
          callID: e.obs_id,
          state: {
            input: e.input ?? null,
            status: isErr ? 'failed' : 'completed',
            output: result?.output ?? '',
          },
        },
      }) + '\n');
    } else if (e.type === 'report') {
      emit(JSON.stringify({
        type: 'text',
        part: { text: e.content },
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }

  emit(JSON.stringify({
    type: 'step_finish',
    part: {
      tokens: { input: 0, output: meta?.total_tokens ?? 0, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
    },
  }) + '\n');
}
