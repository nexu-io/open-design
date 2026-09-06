// B11 「引导对话」 — POST /api/runs/:id/steer at the daemon HTTP boundary.
//
// The queue row's third button used to be "send now", which STOPS the running
// turn and re-sends. Steering is the opposite: the turn keeps running and the
// message is written onto the child's still-open stdin, so the model reads it
// without losing the work it has already done.
//
// This spec drives the real thing end to end — a fake `claude` that parks on a
// `stop_reason: 'tool_use'` frame (stdin stays open, exactly the moment
// steering is worth the most), reads the injected JSONL frame off stdin, and
// records what it actually received. Nothing here inspects daemon internals:
// the proof that the message reached the model is a file the CHILD wrote.
//
// Covered:
//   - injection into a live stream-json turn, and the message landing in the
//     conversation so a reload still shows what the user said;
//   - refusal once the turn ended and stdin closed (no silent drop);
//   - refusal on a runtime that never keeps stdin open (fake `codex`);
//   - refusal of an empty message and of an unknown run.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  exitCode: number | null;
};

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);

describe('POST /api/runs/:id/steer', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
  };
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('injects a mid-turn message into a running stream-json turn and keeps it in history', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-b11-steer-bin-'));
    const readyPath = path.join(binDir, 'ready');
    const sinkPath = path.join(binDir, 'steered.txt');
    const bin = await writeSteerableClaude(binDir, 'claude-steerable', readyPath, sinkPath);

    clearTelemetryEnv();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, { CLAUDE_BIN: bin });

    const project = await createProject(started.url);
    const runId = await startRun(started.url, project, 'draft the pricing page');

    // The child parked on a tool_use frame: the turn is live and stdin is open.
    await waitForFile(readyPath, 10_000);

    const steerText = 'actually make the hero copy shorter';
    const steer = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: steerText }),
    });
    expect(steer.status).toBe(200);
    const steerBody = await steer.json() as {
      ok: boolean;
      delivered: boolean;
      messageId: string;
      run: RunStatus;
    };
    expect(steerBody.ok).toBe(true);
    expect(steerBody.delivered).toBe(true);
    expect(typeof steerBody.messageId).toBe('string');
    // The turn must NOT have been stopped to deliver the message.
    expect(TERMINAL.has(steerBody.run.status)).toBe(false);

    // The load-bearing assertion: the CHILD PROCESS wrote this file, so the
    // frame really travelled down stdin rather than being swallowed by the
    // daemon. Without it, "delivered: true" would only prove we called write().
    await waitForFile(sinkPath, 10_000);
    expect((await readFile(sinkPath, 'utf8')).trim()).toBe(steerText);

    const finished = await waitForTerminal(started.url, runId);
    expect(finished.status).toBe('succeeded');

    // Persisted as a user turn: a reload must still show what the user said
    // mid-turn, and the next turn's transcript must carry the instruction.
    const messages = await listMessages(started.url, project);
    const steered = messages.find((message) => message.content === steerText);
    expect(steered).toBeTruthy();
    expect(steered?.role).toBe('user');
    expect(steered?.id).toBe(steerBody.messageId);

    // Chronology is preserved: the steer sits AFTER the assistant turn it
    // steered, which is when the user actually said it.
    const assistantIndex = messages.findIndex((message) => message.role === 'assistant');
    const steeredIndex = messages.findIndex((message) => message.content === steerText);
    expect(assistantIndex).toBeGreaterThanOrEqual(0);
    expect(steeredIndex).toBeGreaterThan(assistantIndex);

    // Once the turn ended cleanly stdin is closed. A second steer must be
    // refused with a readable code instead of writing into a dead pipe.
    const late = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'too late' }),
    });
    expect(late.status).toBe(409);
    const lateBody = await late.json() as { error: { code: string } };
    expect(lateBody.error.code).toBe('RUN_STEERING_CLOSED');

    // …and the refused message must not have been written to history.
    const afterRefusal = await listMessages(started.url, project);
    expect(afterRefusal.some((message) => message.content === 'too late')).toBe(false);
  }, 45_000);

  it('refuses a runtime whose stdin is closed together with the opening prompt', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-b11-steer-codex-'));
    const readyPath = path.join(binDir, 'codex-ready');
    const bin = await writeIdleCodex(binDir, 'codex-idle', readyPath);

    clearTelemetryEnv();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, { CODEX_BIN: bin, CODEX_HOME: binDir });

    const project = await createProject(started.url);
    const runId = await startRun(started.url, project, 'anything', 'codex');
    await waitForFile(readyPath, 10_000);

    const steer = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'steer me' }),
    });
    expect(steer.status).toBe(409);
    const body = await steer.json() as { error: { code: string } };
    // A permanent property of the runtime, not a transient state — the caller
    // is meant to stop advertising the affordance, not retry.
    expect(body.error.code).toBe('RUN_STEERING_UNSUPPORTED');

    // Nothing was written to the conversation for a refused steer.
    const messages = await listMessages(started.url, project);
    expect(messages.some((message) => message.content === 'steer me')).toBe(false);

    await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
  }, 45_000);

  it('rejects an unknown run and an empty message', async () => {
    clearTelemetryEnv();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;

    const missing = await fetch(`${started.url}/api/runs/no-such-run/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(missing.status).toBe(404);

    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-b11-steer-empty-'));
    const readyPath = path.join(binDir, 'ready');
    const sinkPath = path.join(binDir, 'steered.txt');
    const bin = await writeSteerableClaude(binDir, 'claude-steerable', readyPath, sinkPath);
    await putConfig(started.url, { CLAUDE_BIN: bin });
    const project = await createProject(started.url);
    const runId = await startRun(started.url, project, 'draft something');
    await waitForFile(readyPath, 10_000);

    const empty = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });
    expect(empty.status).toBe(400);
    const emptyBody = await empty.json() as { error: { code: string } };
    expect(emptyBody.error.code).toBe('BAD_REQUEST');

    await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
  }, 45_000);
});

function clearTelemetryEnv(): void {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
}

/**
 * A `claude` stand-in that behaves the way steering needs the real one to:
 * it commits a `tool_use` frame (so the daemon leaves stdin open), then keeps
 * reading JSONL frames. The first frame is the daemon's opening prompt; the
 * second is the steer, which it records to `sinkPath` before finishing the
 * turn. `readyPath` is written once the opening prompt has been consumed, so
 * the test never races the spawn.
 */
async function writeSteerableClaude(
  dir: string,
  name: string,
  readyPath: string,
  sinkPath: string,
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
function w(s) { fs.writeSync(1, s); }
if (process.argv.includes('--version')) { w('claude-code 1.0.0-b11-steer\\n'); process.exit(0); }
if (process.argv.includes('--help')) { w('Usage: claude -p [--include-partial-messages] [--add-dir DIR]\\n'); process.exit(0); }

w(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-b11-steer', session_id: 's-b11' }) + '\\n');
// stop_reason 'tool_use' is a mid-turn pause, not a turn boundary: the daemon
// must leave stdin open here. This is the state steering targets.
w(JSON.stringify({
  type: 'assistant',
  parent_tool_use_id: null,
  message: {
    id: 'msg-main',
    content: [{ type: 'tool_use', id: 'tu_work', name: 'Task', input: { prompt: 'work' } }],
    stop_reason: 'tool_use',
  },
}) + '\\n');

let buffer = '';
let framesSeen = 0;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    let frame;
    try { frame = JSON.parse(line); } catch { continue; }
    const text = frame && frame.message && Array.isArray(frame.message.content)
      ? (frame.message.content.find((part) => part && part.type === 'text') || {}).text
      : undefined;
    framesSeen += 1;
    if (framesSeen === 1) {
      // The opening prompt. Announce readiness and keep waiting.
      fs.writeFileSync(${JSON.stringify(readyPath)}, 'ready');
      continue;
    }
    // A steering frame arrived mid-turn.
    fs.writeFileSync(${JSON.stringify(sinkPath)}, String(text == null ? '' : text) + '\\n');
    w(JSON.stringify({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        id: 'msg-final',
        content: [{ type: 'text', text: 'acknowledged: ' + String(text) }],
        stop_reason: 'end_turn',
      },
    }) + '\\n');
    w(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done' }) + '\\n');
    setTimeout(() => process.exit(0), 30);
    return;
  }
});
// Never finish on our own: the test drives the ending through the steer.
setTimeout(() => process.exit(0), 40000);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

/**
 * A `codex` stand-in that stays alive without producing a turn. codex is a
 * `promptInputFormat: 'text'` runtime — the daemon ends its stdin together
 * with the opening prompt — so a live run of it is the honest "unsupported
 * runtime" fixture.
 */
async function writeIdleCodex(dir: string, name: string, readyPath: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { fs.writeSync(1, 'codex-cli 0.0.0-b11\\n'); process.exit(0); }
if (process.argv.includes('--help')) { fs.writeSync(1, 'Usage: codex exec\\n'); process.exit(0); }
if (process.argv.includes('login')) { fs.writeSync(1, 'Logged in\\n'); process.exit(0); }
process.stdin.resume();
process.stdin.on('data', () => {});
fs.writeFileSync(${JSON.stringify(readyPath)}, 'ready');
setTimeout(() => process.exit(0), 40000);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function putConfig(url: string, agentEnv: Record<string, string>): Promise<void> {
  const agentId = agentEnv.CLAUDE_BIN ? 'claude' : 'codex';
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId,
      agentCliEnv: { [agentId]: agentEnv },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(response.status).toBe(200);
}

async function createProject(url: string): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `b11_steer_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'B11 steer the running turn',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function startRun(
  url: string,
  project: { projectId: string; conversationId: string },
  message: string,
  agentId = 'claude',
): Promise<string> {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'b11-steer-test',
      'x-od-analytics-session-id': 'b11-steer-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId: project.projectId,
      conversationId: project.conversationId,
      assistantMessageId: `assistant_b11_${randomUUID()}`,
      clientRequestId: `client_b11_${randomUUID()}`,
      agentId,
      message,
      currentPrompt: message,
    }),
  });
  expect(response.status).toBe(202);
  const body = await response.json() as { runId: string };
  return body.runId;
}

async function waitForFile(target: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${target}`);
}

async function waitForTerminal(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (TERMINAL.has(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}

async function listMessages(
  url: string,
  project: { projectId: string; conversationId: string },
): Promise<{ id: string; role: string; content: string }[]> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(project.projectId)}`
    + `/conversations/${encodeURIComponent(project.conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = await response.json() as
    | { messages: { id: string; role: string; content: string }[] }
    | { id: string; role: string; content: string }[];
  return Array.isArray(body) ? body : body.messages;
}
