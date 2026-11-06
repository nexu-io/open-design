// OD-faithful cursor-agent renderer.
//
// Matches the JSONL shape OD's `json-event-stream.ts:handleCursorEvent`
// parser accepts:
//   {"type":"system","subtype":"init","model":"..."}
//   {"type":"assistant","message":{
//      "content":[{"type":"text","text":"..."}, ...]},
//      "timestamp_ms": ...}
//   {"type":"result","usage":{"inputTokens","outputTokens","cacheReadTokens","cacheWriteTokens"},
//      "duration_ms": ...}
//
// Cursor's parser handles delta-vs-replacement detection itself: when a
// later text block STARTS WITH the prior accumulated text, the parser
// strips the prefix and emits only the delta. So we can either emit a
// single message containing the full text, OR emit progressive chunks
// where each chunk is the cumulative-so-far. We use the single-message
// form — simplest, no risk of state desync.
//
// Like gemini, the cursor-agent parser does NOT recognize tool events.
// Tool calls in the recording are ignored; only the final assistant
// text is rendered.

import { writeFile } from 'node:fs/promises';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderAsCursorAgent(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 2000;
  const meta = events.find(e => e.type === 'meta');

  emit(JSON.stringify({
    type: 'system',
    subtype: 'init',
    model: meta?.model ?? 'cursor-default',
  }) + '\n');

  if (!opts.noDelay) await sleep(Math.min(maxSleep, 200));

  for (const e of events) {
    if (e.type === 'report') {
      emit(JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: e.content }],
        },
        timestamp_ms: Date.now(),
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }

  emit(JSON.stringify({
    type: 'result',
    usage: {
      inputTokens: 0,
      outputTokens: meta?.total_tokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    duration_ms: meta?.duration_ms ?? 0,
  }) + '\n');
}
