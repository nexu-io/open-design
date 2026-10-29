import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';
import { piAuthGuidance } from '../../src/runtimes/auth.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type RunStatus = { status: string; error?: string | null; errorCode?: string | null; exitCode?: number | null; signal?: string | null };
const originalShutdownMs = process.env.PI_GRACEFUL_SHUTDOWN_MS;
const originalStrategyRollout = process.env.OD_NEXT_STRATEGY_ROLLOUT;
let started: StartedServer | null = null;
let binDir: string | null = null;

afterEach(async () => {
  await Promise.resolve(started?.shutdown?.());
  if (started?.server.listening) {
    await new Promise<void>(resolve => started!.server.close(() => resolve()));
  }
  started = null;
  if (binDir) await rm(binDir, { recursive: true, force: true });
  binDir = null;
  if (originalShutdownMs === undefined) delete process.env.PI_GRACEFUL_SHUTDOWN_MS;
  else process.env.PI_GRACEFUL_SHUTDOWN_MS = originalShutdownMs;
  if (originalStrategyRollout === undefined) delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
  else process.env.OD_NEXT_STRATEGY_ROLLOUT = originalStrategyRollout;
});

describe('Pi RPC public Run close', () => {
  it.each([
    { mode: 'success', expected: 'succeeded' },
    { mode: 'sigterm-exit', expected: 'succeeded' },
    { mode: 'nonzero', expected: 'failed' },
    { mode: 'error', expected: 'failed' },
    { mode: 'auth-rejected', expected: 'failed' },
    { mode: 'prompt-rejected', expected: 'failed' },
    { mode: 'cancel', expected: 'canceled' },
  ])('keeps $mode as $expected when the Pi process remains alive after EOF', async ({ mode, expected }) => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-pi-rpc-close-'));
    const bin = path.join(binDir, 'pi-close-fixture');
    const promptAccepted = path.join(binDir, 'prompt-accepted');
    await writeFile(bin, `#!${process.execPath}
const readline = require('node:readline');
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('1.1.0'); process.exit(0); }
if (process.argv.includes('--list-models')) { console.log('provider model context max-out thinking images\\nopenai fixture-model 128K 16K yes yes'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: pi --mode rpc'); process.exit(0); }
const W = value => fs.writeSync(1, JSON.stringify(value) + '\\n');
const mode = ${JSON.stringify(mode)};
// Pi 1.1.0 traps SIGTERM and exits 143, so there is no signal on 'close'.
if (mode === 'sigterm-exit') process.on('SIGTERM', () => process.exit(143));
// Native RPC runtimes can stay alive after stdin EOF. Completion, rather
// than the fallback signal, must determine the successful turn's verdict.
setInterval(() => {}, 1000);
readline.createInterface({ input: process.stdin }).on('line', line => {
  const command = JSON.parse(line);
  if (command.type === 'get_state') { W({ type: 'response', id: command.id, success: true, data: {} }); return; }
  if (command.type === 'abort') { W({ type: 'agent_end' }); process.exit(0); }
  if (command.type !== 'prompt') return;
  fs.writeFileSync(${JSON.stringify(promptAccepted)}, 'accepted');
  if (mode === 'auth-rejected' || mode === 'prompt-rejected') {
    const error = mode === 'auth-rejected'
      ? 'No API key found for the selected model. Use /login to log into a provider via OAuth or API key. synthetic-sensitive-detail'
      : 'network timeout';
    W({ type: 'response', id: command.id, success: false, error });
    return;
  }
  W({ type: 'response', id: command.id, success: true });
  W({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Pi fixture output.\\n' } });
  if (mode === 'cancel') return;
  if (mode === 'error') W({ type: 'message_update', assistantMessageEvent: { type: 'error', reason: 'Native Pi fixture failure' } });
  W({ type: 'agent_end' });
  // Exercise a natural failure during the grace period, after the turn ends.
  if (mode === 'nonzero') setTimeout(() => process.exit(143), 80);
});
`, 'utf8');
    await chmod(bin, 0o755);
    // Natural failure must arrive during the production grace period. The
    // test-only fast shutdown belongs to the cases that exercise host teardown.
    if (mode === 'nonzero') delete process.env.PI_GRACEFUL_SHUTDOWN_MS;
    else process.env.PI_GRACEFUL_SHUTDOWN_MS = '10';
    // Exercise Pi's Run transport without starting background strategy discovery.
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    const config = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'pi', agentCliEnv: { pi: { PI_BIN: bin } },
        telemetry: { metrics: false, content: false, artifactManifest: false }, privacyDecisionAt: Date.now(),
      }),
    });
    expect(config.status).toBe(200);
    const projectId = `pi-close-${randomUUID()}`;
    const project = await fetch(`${started.url}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Pi close fixture', metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }),
    });
    expect(project.status).toBe(200);
    const created = await fetch(`${started.url}/api/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, agentId: 'pi', message: 'Exercise Pi RPC close.' }),
    });
    expect(created.status).toBe(202);
    const { runId } = await created.json() as { runId: string };
    if (mode === 'cancel') {
      await waitForStatus(started.url, runId, run => run.status === 'running');
      const deadline = Date.now() + 10_000;
      while (true) {
        try { await access(promptAccepted); break; } catch {
          if (Date.now() >= deadline) throw new Error('Pi did not accept the prompt before cancellation');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      const canceled = await fetch(`${started.url}/api/runs/${runId}/cancel`, { method: 'POST' });
      expect(canceled.status).toBe(200);
    }
    const run = await waitForStatus(started.url, runId, run => ['succeeded', 'failed', 'canceled'].includes(run.status));
    expect(run.status, run.error ?? '').toBe(expected);
    if (mode === 'success') {
      expect(run.signal).toBe('SIGTERM');
      expect(run.error ?? null).toBeNull();
    } else if (mode === 'sigterm-exit') {
      expect(run.exitCode).toBe(143);
      expect(run.signal ?? null).toBeNull();
      expect(run.error ?? null).toBeNull();
    } else if (mode === 'nonzero') {
      expect(run.exitCode).toBe(143);
      expect(run.signal ?? null).toBeNull();
    } else if (mode === 'error') {
      expect(run.error).toContain('Native Pi fixture failure');
    } else if (mode === 'auth-rejected' || mode === 'prompt-rejected') {
      const expectedCode = mode === 'auth-rejected' ? 'AGENT_AUTH_REQUIRED' : 'AGENT_EXECUTION_FAILED';
      const expectedMessage = mode === 'auth-rejected' ? piAuthGuidance() : 'prompt rejected: network timeout';
      expect(run.errorCode).toBe(expectedCode);
      // Terminal status can precede the journal flush. Public replay waits for
      // completion instead of opening a partially written event log.
      const replay = await fetch(`${started.url}/api/runs/${runId}/events`);
      expect(replay.status).toBe(200);
      const frames = (await replay.text()).trim().split('\n\n');
      expect(frames.some(frame => frame.split('\n').includes('event: end'))).toBe(true);
      const errors = frames.filter(frame => frame.split('\n').includes('event: error'))
        .map(frame => ({ data: JSON.parse(frame.split('\n').find(line => line.startsWith('data: '))!.slice(6)) }));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.data).toMatchObject({
        message: expectedMessage,
        error: { code: expectedCode, message: expectedMessage, retryable: mode === 'auth-rejected' },
      });
      expect(JSON.stringify(errors)).not.toContain('synthetic-sensitive-detail');
    }
  });
});

async function waitForStatus(url: string, runId: string, done: (run: RunStatus) => boolean): Promise<RunStatus> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/api/runs/${runId}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (done(run)) return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Pi public Run did not reach the expected state');
}
