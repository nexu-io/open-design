#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const statePath = process.env.OD_DSH_GENERATION_STATE;
if (!statePath) throw new Error('Fixture state required');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const emit = (frame: object) => process.stdout.write(`${JSON.stringify({ v: 1, ...frame })}\n`);
const identity = {
  runtime: 'open-design', protocol_version: 1, plugin_version: 'fixture',
  capabilities: { session_resume: true, session_cancel: true, structured_events: true },
};
if (process.argv.includes('--version')) {
  process.stdout.write('0.1.1-rc.2\n');
  process.exit(0);
}
if (process.argv.includes('--probe')) {
  emit({ ...identity, type: 'probe', compatibility_generation: 'stale-detection' });
  process.exit(0);
}
if (process.argv.includes('--models')) {
  emit({ type: 'models', runtime: 'open-design', models: [] });
  process.exit(0);
}
emit({ ...identity, type: 'ready', compatibility_generation: state.generation });
const input = createInterface({ input: process.stdin });
let sessionId = '';
input.on('line', (line) => {
  const command = JSON.parse(line);
  if (command.type === 'cancel') {
    emit({ type: 'result', request_id: command.request_id, session_id: sessionId, status: 'cancelled', resume_rejected: false });
    process.exit(0);
  }
  appendFileSync(`${statePath}.commands`, `${line}\n`);
  sessionId = command.resume_session_id ?? `fixture-${randomUUID()}`;
  if (command.resume_session_id && state.reject) {
    emit({ type: 'result', request_id: command.request_id, session_id: sessionId, status: 'failed', resume_rejected: true,
      error: { code: 'DSH_SESSION_NOT_FOUND', message: 'private target detail' } });
    process.exit(0);
  }
  emit({ type: 'session', request_id: command.request_id, session_id: sessionId, resumed: Boolean(command.resume_session_id) });
  if (state.wait) return;
  emit({ type: 'text', request_id: command.request_id, content: 'Fixture response.' });
  emit({ type: 'result', request_id: command.request_id, session_id: sessionId, status: 'completed', resume_rejected: false });
  process.exit(0);
});
