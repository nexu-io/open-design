// OD-faithful codex renderer. Emits the shape OD's
// `json-event-stream.ts:handleCodexEvent` parser accepts.
// Codex parser only knows command_execution (Bash) + agent_message —
// non-Bash tools are translated to a shell-equivalent command.

import { writeFile } from 'node:fs/promises';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function commandFor(name, input) {
  if (!input || typeof input !== 'object') return `# ${name}`;
  const o = input;
  switch (name) {
    case 'Bash':
      return typeof o.command === 'string' ? o.command : '# Bash';
    case 'Read': {
      const fp = typeof o.file_path === 'string' ? o.file_path : '';
      const o2 = typeof o.offset === 'number' ? ` # offset=${o.offset}` : '';
      const lim = typeof o.limit === 'number' ? ` limit=${o.limit}` : '';
      return `cat "${fp}"${o2}${lim}`;
    }
    case 'Grep': {
      const pat = typeof o.pattern === 'string' ? o.pattern : '';
      const path = typeof o.path === 'string' ? o.path : '.';
      return `grep -n "${pat.replace(/"/g, '\\"')}" "${path}"`;
    }
    case 'Glob': {
      const pat = typeof o.pattern === 'string' ? o.pattern : '';
      return `find . -path "${pat}" -print`;
    }
    case 'Edit':
    case 'Write':
      return `# ${name} ${typeof o.file_path === 'string' ? o.file_path : ''}`;
    default:
      return `# ${name} ${JSON.stringify(o).slice(0, 200)}`;
  }
}

export async function renderAsCodex(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 3000;
  const meta = events.find(e => e.type === 'meta');

  const results = new Map();
  for (const e of events) if (e.type === 'tool_result') results.set(e.obs_id, e);

  emit(JSON.stringify({ type: 'thread.started' }) + '\n');
  emit(JSON.stringify({ type: 'turn.started' }) + '\n');

  let lastT = 0;
  let agentMessageCount = 0;
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
      const command = commandFor(e.name, e.input);
      emit(JSON.stringify({
        type: 'item.started',
        item: { type: 'command_execution', id: e.obs_id, command },
      }) + '\n');
      emit(JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'command_execution',
          id: e.obs_id,
          command,
          aggregated_output: result?.output ?? '',
          exit_code: result?.status === 'error' ? 1 : 0,
          status: result?.status === 'error' ? 'failed' : 'completed',
        },
      }) + '\n');
    } else if (e.type === 'report') {
      agentMessageCount += 1;
      emit(JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', id: `mock-msg-${agentMessageCount}`, text: e.content },
      }) + '\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }

  emit(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 0, output_tokens: meta?.total_tokens ?? 0, cached_input_tokens: 0 },
  }) + '\n');
}
