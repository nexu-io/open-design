import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// End-to-end coverage for OpenCode native (capture-style) session resume.
//
// OpenCode mints its own session id and stamps it on every stream event as
// `sessionID` (e.g. `ses_...`). The daemon must:
//   1. capture that id from the stream and persist it (NOT the daemon-minted
//      `newSessionId`, which OpenCode ignores),
//   2. continue it next turn with `opencode run -s <id>` and send ONLY the new
//      turn (no flattened-history resend), and
//   3. when the session store is gone (`Session not found`), clear the stale
//      handle, surface a retryable error, and let the next turn start fresh
//      re-seeded with the full transcript.
//
// On origin/main OpenCode is not `resumesSessionViaCli`, so it always runs
// plain `run` and re-pays the whole transcript — turn-2 here would carry no
// `-s` and would include the prior reply, going red.

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
  resumable?: boolean;
};

type RunInvocation = { argv: string[]; stdin: string; cwd: string };
type RunEvent = { event: string; data: unknown };

const SESSION = 'ses_e2e0000resume0000';
const FIRST_REPLY_SENTINEL = 'FIRST_TURN_REPLY_SENTINEL_0c7d2';

describe('opencode native session resume', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await removeTempDir(binDir);
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('captures the session id on turn 1 and resumes it (without resending history) on turn 2', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-resume-bin-'));
    const { bin, logPath } = await writeCapturingOpencode(binDir, 'opencode-capture');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    const turn1 = await sendRunAndWait(started.url, conversationId, 'first user request');
    expect(turn1.status).toBe('succeeded');

    const turn2 = await sendRunAndWait(started.url, conversationId, 'second user request please');
    expect(turn2.status).toBe('succeeded');

    const runs = await readChatTurnRuns(logPath, conversationId);
    expect(runs).toHaveLength(2);
    const [create, resume] = runs as [RunInvocation, RunInvocation];

    // Turn 1 is a fresh `run` — no `-s`, no leaked id.
    expect(create.argv[0]).toBe('run');
    expect(create.argv).not.toContain('-s');
    expect(create.argv).not.toContain(SESSION);

    // Turn 2 continues the captured session id.
    expect(resume.argv).toContain('-s');
    expect(resume.argv[resume.argv.indexOf('-s') + 1]).toBe(SESSION);

    // The turn-2 prompt must NOT re-send turn-1's assistant reply (history is
    // carried by the resumed session), but must carry the new user message.
    expect(resume.stdin).not.toContain(FIRST_REPLY_SENTINEL);
    expect(resume.stdin).toContain('second user request please');
  });

  it('transparently auto-reseeds within the same turn on `Session not found`', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-fallback-bin-'));
    const { bin, logPath } = await writeMissingSessionOpencode(binDir, 'opencode-fallback');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    const turn1 = await sendRunAndWait(started.url, conversationId, 'first request');
    expect(turn1.status).toBe('succeeded');

    // Turn 2 resumes, but the session store is gone (OpenCode prints "Session
    // not found" and exits 0, exercising the exit-0 resume-failure path). The
    // daemon must NOT surface an error: it clears the dead handle and
    // TRANSPARENTLY re-runs the same turn as a fresh `run` (full transcript),
    // within this one run. The user sees a succeeded turn — no turn 3.
    const turn2 = await sendRunAndWait(started.url, conversationId, 'second request');
    expect(turn2.status).toBe('succeeded');

    const events = await readRunEvents(turn2.eventsLogPath);
    expect(events.filter((e) => e.event === 'error')).toEqual([]);
    expect(hasDiagnostic(events, {
      type: 'agent_resume_auto_reseed',
      reason: 'resume_failed',
      stale_session_cleared: true,
    })).toBe(true);

    // The create, then turn 2's dead resume (`-s`), then the in-turn fresh reseed.
    const runs = await readChatTurnRuns(logPath, conversationId);
    expect(runs).toHaveLength(3);
    const [create, deadResume, fresh] = runs as [
      RunInvocation,
      RunInvocation,
      RunInvocation,
    ];
    expect(create.argv).not.toContain('-s');
    expect(deadResume.argv).toContain('-s');
    expect(fresh.argv).not.toContain('-s');
  });

  it('starts fresh on turn 2 when turn 1 succeeds without a captured session id', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-nohandle-bin-'));
    const { bin, logPath } = await writeNoHandleOpencode(binDir, 'opencode-nohandle');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    expect((await sendRunAndWait(started.url, conversationId, 'first request')).status)
      .toBe('succeeded');
    expect((await sendRunAndWait(started.url, conversationId, 'second request')).status)
      .toBe('succeeded');

    const runs = await readChatTurnRuns(logPath, conversationId);
    expect(runs).toHaveLength(2);
    const [turn1, turn2] = runs as [RunInvocation, RunInvocation];
    expect(turn1.argv).not.toContain('-s');
    expect(turn2.argv[0]).toBe('run');
    expect(turn2.argv).not.toContain('-s');
  });
});

// Fake opencode CLI: stamps a FIXED session id on a create turn and echoes it
// on a resume turn. Logs `{argv, stdin}` per invocation.
async function writeCapturingOpencode(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    fakeOpencodeSource({
      logPath,
      body: `
  const isResume = argv.includes('-s');
  const text = isResume ? 'Resumed reply.' : ${JSON.stringify(FIRST_REPLY_SENTINEL)};
  console.log(JSON.stringify({ type: 'step_start', sessionID: SESSION, part: { type: 'step-start' } }));
  console.log(JSON.stringify({ type: 'text', sessionID: SESSION, part: { type: 'text', text } }));
  console.log(JSON.stringify({ type: 'step_finish', sessionID: SESSION, part: { type: 'step-finish', tokens: { input: 11, output: 7, reasoning: 0, cache: { read: 5, write: 2 } }, cost: 0 } }));
  setTimeout(() => process.exit(0), 10);`,
    }),
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

// Fake opencode CLI: succeeds on a create turn (persisting the session), but a
// resume turn (`-s`) prints "Session not found" to stderr and exits 0 — the
// real OpenCode behavior for a missing session.
async function writeMissingSessionOpencode(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    fakeOpencodeSource({
      logPath,
      body: `
  if (argv.includes('-s')) {
    process.stderr.write('Error: Session not found\\n');
    setTimeout(() => process.exit(0), 10);
    return;
  }
  console.log(JSON.stringify({ type: 'step_start', sessionID: SESSION, part: { type: 'step-start' } }));
  console.log(JSON.stringify({ type: 'text', sessionID: SESSION, part: { type: 'text', text: 'Created reply.' } }));
  console.log(JSON.stringify({ type: 'step_finish', sessionID: SESSION, part: { type: 'step-finish', tokens: { input: 8, output: 2, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0 } }));
  setTimeout(() => process.exit(0), 10);`,
    }),
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

// Fake opencode CLI: succeeds but never stamps `sessionID` on stream events.
// Without a durable handle, the daemon must leave the next turn on fresh `run`.
async function writeNoHandleOpencode(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    fakeOpencodeSource({
      logPath,
      body: `
  console.log(JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }));
  console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: 'Reply without session id.' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', tokens: { input: 8, output: 2, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0 } }));
  setTimeout(() => process.exit(0), 10);`,
    }),
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

function fakeOpencodeSource(opts: { logPath: string; body: string }): string {
  return `#!/usr/bin/env node
const fs = require('node:fs');
const logPath = ${JSON.stringify(opts.logPath)};
const SESSION = ${JSON.stringify(SESSION)};
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('1.17.7'); process.exit(0); }
if (argv.includes('--help')) { console.log('opencode run [message..]'); process.exit(0); }
if (argv[0] === 'models') { console.log('anthropic/claude-sonnet-4-5'); process.exit(0); }
let stdin = '';
let done = false;
function finish() {
  if (done) return; done = true;
  try { fs.appendFileSync(logPath, JSON.stringify({ argv, stdin, cwd: process.cwd() }) + '\\n'); } catch {}
  run();
}
function run() {${opts.body}
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`;
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearTelemetryEnv(): void {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createConversation(url: string): Promise<string> {
  const projectId = `opencode_resume_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'OpenCode resume smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as {
    conversationId: string;
    id: string;
  };
  return `${projectId}::${projectBody.conversationId}`;
}

async function sendRunAndWait(
  url: string,
  encoded: string,
  message: string,
): Promise<RunStatus> {
  const [projectId, conversationId] = encoded.split('::');
  const assistantMessageId = `assistant_opencode_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'opencode-resume-test',
      'x-od-analytics-session-id': 'opencode-resume-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_opencode_${randomUUID()}`,
      agentId: 'opencode',
      message,
      currentPrompt: message,
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  return await waitForRun(url, body.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

// Chat-turn `run` invocations for this conversation, in call order. OpenCode is
// also used as the daemon's background memory-llm and for `models` probes;
// those run from the repo root, so filter by the chat turn's cwd (the project
// working dir, which contains the project id). OpenCode receives its cwd via
// the spawn `cwd`, not an argv flag.
async function readChatTurnRuns(
  logPath: string,
  encoded: string,
): Promise<RunInvocation[]> {
  const projectId = encoded.split('::')[0] ?? encoded;
  let raw = '';
  try {
    raw = await readFile(logPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunInvocation)
    .filter(
      (rec) =>
        rec.argv[0] === 'run' &&
        typeof rec.cwd === 'string' &&
        rec.cwd.includes(projectId),
    );
}

async function readRunEvents(eventsLogPath: string): Promise<RunEvent[]> {
  let raw = '';
  try {
    raw = await readFile(eventsLogPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
}

function hasDiagnostic(events: RunEvent[], expected: Record<string, unknown>): boolean {
  return events.some((event) => {
    if (event.event !== 'diagnostic' || !event.data || typeof event.data !== 'object') {
      return false;
    }
    return Object.entries(expected).every(
      ([key, value]) => (event.data as Record<string, unknown>)[key] === value,
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
