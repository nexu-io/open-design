// @ts-nocheck
/** @module cli/core/run-events
 * SSE-to-NDJSON bridge for agent-run event streams, shared by the project
 * (`od run --follow`) and plugin (`od plugin run`) domains.
 * Foundation kernel: imports no sibling subdirectory.
 */

// Stream the SSE events at /api/runs/:id/events as ND-JSON on stdout.
// Each line is one event: { event, data } so a code agent can parse it
// without needing an SSE library.
/**
 * Follows `/api/runs/:id/events` and re-emits each SSE block as one NDJSON
 * line (`{ event, data }`) on stdout until the stream ends or an `end` event
 * arrives. Exits the process with code 1 when the daemon refuses the stream.
 */
export async function streamRunEvents(base, runId) {
  const resp = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/events`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!resp.ok || !resp.body) {
    console.error(`run watch failed: ${resp.status}`);
    process.exit(1);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine  = lines.find((l) => l.startsWith('data: '));
      const event = eventLine ? eventLine.slice('event: '.length) : 'message';
      const dataRaw = dataLine ? dataLine.slice('data: '.length) : '';
      let parsed;
      try { parsed = JSON.parse(dataRaw); } catch { parsed = dataRaw; }
      process.stdout.write(JSON.stringify({ event, data: parsed }) + '\n');
      if (event === 'end') {
        return;
      }
    }
  }
}
