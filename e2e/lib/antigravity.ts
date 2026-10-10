import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type FakeAgyOptions = {
  mode?: 'auth-required' | 'rate-limited';
};

export async function writeFakeAgyBin(
  root: string,
  options: FakeAgyOptions = {},
): Promise<string> {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'agy');
  await writeFile(bin, renderFakeAgyScript(options), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function renderFakeAgyScript(options: FakeAgyOptions): string {
  const mode = options.mode ?? 'auth-required';
  return `#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);

function readFlag(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function appendLog(file, lines) {
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, lines.join('\\n') + '\\n', 'utf8');
}

if (args.includes('--version')) {
  process.stdout.write('1.3.1-e2e\\n');
  process.exit(0);
}

const logFile = readFlag('--log-file');
appendLog(logFile, ['INFO booting agy headless stream-json']);

// Replays agy 1.3.1's recorded headless stream-json failures (see
// apps/daemon/tests/fixtures/antigravity-stream-json).
process.stdin.resume();
process.stdin.on('end', () => {
  if (mode === 'auth-required') {
    process.stdout.write(JSON.stringify({ event: 'result', result: { conversation_id: '', status: 'ERROR', response: '', error: 'authentication failed or timed out', duration_seconds: 0, num_turns: 0, usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 } } }) + '\\n');
    process.stderr.write("Error: authentication required. Run 'agy' to log in, then retry.\\nerror: authentication failed or timed out\\n");
    process.exit(1);
  }
  const conversation_id = 'e2e-agy-quota';
  process.stdout.write(JSON.stringify({ event: 'init', conversation_id, init: { cwd: process.cwd(), tools: ['run_command'], permission_mode: 'request-review' } }) + '\\n');
  process.stdout.write(JSON.stringify({ event: 'step_update', step_update: { conversation_id, step_index: 0, state: 'DONE', step_type: 'user_input' } }) + '\\n');
  process.stdout.write(JSON.stringify({ event: 'step_update', step_update: { conversation_id, step_index: 1, state: 'DONE', step_type: 'error_message' } }) + '\\n');
  process.stdout.write(JSON.stringify({ event: 'result', result: { conversation_id, status: 'ERROR', response: '', error: 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 148h43m22s.', duration_seconds: 0, num_turns: 1, usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 } } }) + '\\n');
  process.stderr.write('error: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 148h43m22s.\\n');
  process.stderr.write('AGY_ERROR: {"short_error":"RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 148h43m22s.","status":"RESOURCE_EXHAUSTED","error_code":429,"code_kind":"http","retryable":true}\\n');
  process.exit(3);
});
`;
}
