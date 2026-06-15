// OD-faithful kimi renderer.
//
// Matches the JSONL shape OD's `json-event-stream.ts:handleKimiEvent`
// parser accepts:
//   {"role":"assistant","content":"..."}                  → text_delta
//   {"role":"assistant","tool_calls":[...]}               → tool_use
//   {"role":"tool","tool_call_id":"...","content":"..."} → tool_result
//   {"role":"meta","type":"session.resume_hint",...}      → ignored

import { writeFile } from 'node:fs/promises';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderAsKimi(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 2000;
  const meta = events.find(e => e.type === 'meta');
  const results = new Map();
  for (const e of events) if (e.type === 'tool_result') results.set(e.obs_id, e);

  if (!opts.noDelay) await sleep(Math.min(maxSleep, 200));

  for (const e of events) {
    if (e.type === 'tool_call') {
      const result = results.get(e.obs_id);
      emit(JSON.stringify({
        role: 'assistant',
        tool_calls: [
          {
            type: 'function',
            id: e.obs_id,
            function: {
              name: e.name,
              arguments: JSON.stringify(e.input ?? null),
            },
          },
        ],
      }) + '\n');
      emit(JSON.stringify({
        role: 'tool',
        tool_call_id: e.obs_id,
        content: result?.output ?? '',
      }) + '\n');
      continue;
    }
    if (e.type === 'report') {
      emit(JSON.stringify({
        role: 'assistant',
        content: e.content,
      }) + '\n');
      emit(JSON.stringify({
        role: 'meta',
        type: 'session.resume_hint',
        session_id: meta?.session_id ?? `mock-${Date.now()}`,
        content: 'To resume this session: kimi -r mock-session',
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }
}
