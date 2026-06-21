// OD-faithful gemini renderer.
//
// Matches the JSONL shape OD's `json-event-stream.ts:handleGeminiEvent`
// parser accepts:
//   {"type":"init","model":"..."}                         → status:initializing
//   {"type":"message","role":"assistant","content":"..."}  → text_delta
//   {"type":"tool_use","tool_name":"...","tool_id":"..."}  → tool_use
//   {"type":"tool_result","tool_id":"...","output":"..."}  → tool_result
//   {"type":"result","stats":{...}}                       → usage

import { writeFile } from 'node:fs/promises';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderAsGemini(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 2000;
  const meta = events.find(e => e.type === 'meta');
  const results = new Map();
  for (const e of events) if (e.type === 'tool_result') results.set(e.obs_id, e);

  emit(JSON.stringify({
    type: 'init',
    model: meta?.model ?? 'gemini-2.5-pro',
  }) + '\n');

  // Stream the report text as one assistant message. Optionally we could
  // chunk by token-count for a more "live streaming" feel — but OD's
  // gemini parser accepts multi-chunk too (each emits as text_delta).
  if (!opts.noDelay) await sleep(Math.min(maxSleep, 200));
  for (const e of events) {
    if (e.type === 'tool_call') {
      const result = results.get(e.obs_id);
      emit(JSON.stringify({
        type: 'tool_use',
        tool_name: e.name,
        tool_id: e.obs_id,
        parameters: e.input ?? null,
      }) + '\n');
      emit(JSON.stringify({
        type: 'tool_result',
        tool_id: e.obs_id,
        status: result?.status === 'error' ? 'error' : 'success',
        output: result?.output ?? '',
      }) + '\n');
    } else if (e.type === 'report') {
      emit(JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: e.content,
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }

  // Final stats wrapper.
  emit(JSON.stringify({
    type: 'result',
    stats: {
      input_tokens: 0,
      output_tokens: meta?.total_tokens ?? 0,
      cached: 0,
      duration_ms: meta?.duration_ms ?? 0,
    },
  }) + '\n');
}
