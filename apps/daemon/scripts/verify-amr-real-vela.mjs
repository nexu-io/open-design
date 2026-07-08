#!/usr/bin/env node
/**
 * Ad-hoc end-to-end verifier: drives the real `vela` binary through Open
 * Design's `attachAcpSession`. Not part of the test suite — it makes a real
 * OpenRouter request when VELA_RUNTIME_KEY is a live key.
 *
 * Usage:
 *   VELA_BIN=/path/to/vela \
 *   VELA_RUNTIME_KEY=<openrouter-key> \
 *   VELA_LINK_URL=https://openrouter.ai/api/v1 \
 *   PATH=<dir-with-opencode>:$PATH \
 *   node apps/daemon/scripts/verify-amr-real-vela.mjs
 *
 * Behaviour:
 *   - Runs initialize → session/new → session/set_model (if --model given) →
 *     session/prompt with the prompt from VELA_VERIFY_PROMPT (defaults to a
 *     short hello).
 *   - Logs every Open Design `send(event, payload)` to stdout so you can see
 *     the same text_delta / usage events the chat UI would receive.
 *   - Exits 0 on completedSuccessfully, 1 otherwise.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { attachAcpSession } = await import(
  path.join(HERE, '..', 'dist', 'agent-protocol', 'index.js')
);

const velaBin = process.env.VELA_BIN || 'vela';
const prompt = process.env.VELA_VERIFY_PROMPT || 'Reply with the exact text: AMR-E2E-OK.';
const model = process.env.VELA_VERIFY_MODEL || null;

if (
  (!process.env.VELA_RUNTIME_KEY || !process.env.VELA_LINK_URL) &&
  !process.env.VELA_PROFILE
) {
  console.error(
    'Provide credentials via either:\n' +
      '  - VELA_RUNTIME_KEY + VELA_LINK_URL env vars, or\n' +
      '  - VELA_PROFILE (e.g. "local") with a logged-in ~/.amr/config.json.',
  );
  process.exit(2);
}

const child = spawn(velaBin, ['agent', 'run', '--runtime', 'opencode'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(`[vela.stderr] ${chunk}`);
});
child.on('error', (err) => {
  console.error('[child.error]', err.message);
});
child.on('exit', (code, signal) => {
  console.error(`[child.exit] code=${code} signal=${signal}`);
});
child.on('close', (code, signal) => {
  console.error(`[child.close] code=${code} signal=${signal}`);
});

const overallTimeoutMs = Number(process.env.VELA_VERIFY_TIMEOUT_MS) || 120_000;
const overallTimer = setTimeout(() => {
  console.error(`[verify-amr] overall timeout after ${overallTimeoutMs}ms; SIGTERM child`);
  if (!child.killed) child.kill('SIGTERM');
}, overallTimeoutMs);
overallTimer.unref?.();

const session = attachAcpSession({
  child,
  prompt,
  cwd: process.cwd(),
  model,
  mcpServers: [],
  send: (event, payload) => {
    const stamp = new Date().toISOString();
    if (event === 'agent' && payload?.type === 'text_delta') {
      process.stdout.write(payload.delta);
      return;
    }
    console.log(`\n[${stamp}] ${event} ${JSON.stringify(payload)}`);
  },
});

await new Promise((resolve) => child.on('close', resolve));
process.stdout.write('\n');

if (session.hasFatalError()) {
  console.error('Session reported fatal error.');
  process.exit(1);
}
if (!session.completedSuccessfully()) {
  console.error('Session did not complete successfully.');
  process.exit(1);
}
console.log('verify-amr-real-vela: OK');
