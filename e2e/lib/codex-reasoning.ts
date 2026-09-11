import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A real executable fixture: discovery and execution cross production HTTP APIs. */
export async function createReasoningCodex(root: string) {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'codex.cjs');
  const log = join(root, 'argv.jsonl');
  const options = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'deep-v2'];
  const models = [
    { slug: 'gpt-5.6-sol', display_name: 'Sol', default_reasoning_level: 'low', supported_reasoning_levels: options },
    { slug: 'gpt-6-astra', display_name: 'Astra', default_reasoning_level: 'medium', supported_reasoning_levels: options },
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', default_reasoning_level: 'medium', supported_reasoning_levels: options.slice(0, 4) },
  ];
  await writeFile(bin, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('codex-cli 0.153.4'); process.exit(0); }
if (args[0] === 'debug' && args[1] === 'models') {
  console.log(${JSON.stringify(JSON.stringify({ models }))}); process.exit(0);
}
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (args.includes('--help')) { console.log('exec --json --model'); process.exit(0); }
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'reasoning-fixture' }));
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }));
});
`, { mode: 0o755 });
  return { bin, log, models, env: { CODEX_BIN: bin, CODEX_HOME: root } };
}
