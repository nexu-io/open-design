// Plain (raw stdout) renderer. OD's `plain` streamFormat (deepseek /
// qwen / grok / grok-build) treats stdout as the final assistant
// response. We emit ONLY the report content.

import { writeFile } from 'node:fs/promises';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderAsPlain(events, opts = {}) {
  const emit = opts.emit ?? (s => process.stdout.write(s));
  const maxSleep = opts.maxSleepMs ?? 2000;

  if (opts.includeToolTrace) {
    const tools = events.filter(e => e.type === 'tool_call');
    if (tools.length > 0) {
      emit(`<!-- tools used (${tools.length}):\n`);
      for (const tc of tools) {
        const summary = (() => {
          if (!tc.input || typeof tc.input !== 'object') return '';
          const o = tc.input;
          if (typeof o.file_path === 'string') return o.file_path;
          if (typeof o.command === 'string') return o.command;
          if (typeof o.pattern === 'string') return `${o.pattern} in ${o.path ?? '.'}`;
          return JSON.stringify(o).slice(0, 80);
        })();
        emit(`  ${tc.name} ${summary}\n`);
      }
      emit(`-->\n`);
    }
  }

  for (const e of events) {
    if (e.type === 'report') {
      if (!opts.noDelay) await sleep(Math.min(maxSleep, 200));
      emit(e.content);
      if (!e.content.endsWith('\n')) emit('\n');
      if (opts.reportFile) await writeFile(opts.reportFile, e.content).catch(() => {});
    }
  }
}
