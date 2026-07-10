import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Phase B red spec for resume-on-failure (continue an interrupted run instead
// of discarding it). A run that produced output AND then hit a *resumable*
// transient failure (upstream drop / inactivity) must NOT be a dead end:
//   1. its status must report `resumable: true` so the chat can offer a
//      Continue/Resume affordance, and
//   2. the daemon must persist the CLI session so the next turn in the same
//      conversation resumes it (`--resume <sessionId>`) instead of opening a
//      fresh one.
// On origin/main neither holds: `resumable` is absent, and the session is only
// persisted on success — so both assertions go red there and green on the
// branch.

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
  nativeSessionRecovery?: {
    agentId: string | null;
    state: string;
    handle: {
      present: boolean;
      kind: string;
      display: string | null;
      sha256: string | null;
      redacted: boolean;
    };
  };
};

describe('resume-on-failure runtime', () => {
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

  it('marks a resumable failure with output as resumable and resumes the session next turn', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-resume-on-failure-bin-'));
    const { bin: fakeClaude, argsLogPath } = await writeResumableClaude(
      binDir,
      'claude-resumable',
    );

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Turn 1: emits a text block (so the side-effect gate suppresses a
    // from-scratch retry) and then fails with an upstream 503.
    const failed = await sendRunAndWait(started.url, conversationId);
    expect(failed.status).toBe('failed');
    expect(failed.resumable).toBe(true);
    expect(failed.nativeSessionRecovery).toMatchObject({
      agentId: 'claude',
      state: 'captured_not_resumed',
      handle: {
        present: true,
        kind: 'opaque-id',
        display: null,
        redacted: true,
      },
    });
    expect(failed.nativeSessionRecovery?.handle.sha256).toMatch(/^[a-f0-9]{64}$/);

    // Turn 2: a follow-up in the SAME conversation must resume the persisted
    // session rather than starting fresh.
    const recovered = await sendRunAndWait(started.url, conversationId);
    expect(recovered.status).toBe('succeeded');

    const attempts = (await readArgs(argsLogPath)).filter(
      (args) => args.includes('--session-id') || args.includes('--resume'),
    );
    expect(attempts).toHaveLength(2);

    const firstSessionId = flagValue(attempts[0] ?? [], '--session-id');
    expect(firstSessionId).toBeTruthy();
    expect(attempts[0]).not.toContain('--resume');
    expect(JSON.stringify(failed.nativeSessionRecovery)).not.toContain(firstSessionId);

    const resumedSessionId = flagValue(attempts[1] ?? [], '--resume');
    expect(resumedSessionId).toBe(firstSessionId);
  });

  it('treats a no-output upstream drop as a from-scratch restart, not resumable', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-resume-noout-bin-'));
    const { bin: fakeClaude, argsLogPath } = await writeNoOutputUpstreamClaude(
      binDir,
      'claude-noout',
    );

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // A turn that produces NO committed output before the upstream drop
    // auto-retries from scratch (transient + no side effects) and, once the
    // retry budget is spent, fails terminally. There is no session content to
    // continue, so the run must NOT be flagged resumable — it stays a
    // from-scratch restart surface.
    const failed = await sendRunAndWait(started.url, conversationId);
    expect(failed.status).toBe('failed');
    expect(failed.resumable).not.toBe(true);

    // It exercised the auto-retry path (initial + one same-run retry) and no
    // attempt resumed a session.
    const sessionStarts = (await readArgs(argsLogPath)).filter(
      (args) => args.includes('--session-id') || args.includes('--resume'),
    );
    expect(sessionStarts.length).toBeGreaterThanOrEqual(2);
    for (const args of sessionStarts) {
      expect(args).not.toContain('--resume');
    }
  });

  it('does not flag a text-only drop with no committed block as resumable', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-resume-textonly-bin-'));
    const { bin: fakeClaude } = await writeTextOnlyUpstreamClaude(binDir, 'claude-textonly');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Streamed text (so the side-effect gate suppresses the blind retry) but NO
    // committed tool_use / artifact block. A few tokens reaching the UI is not a
    // resume boundary — there may be nothing committed to continue — so the run
    // must NOT be resumable even though it produced "output".
    const failed = await sendRunAndWait(started.url, conversationId);
    expect(failed.status).toBe('failed');
    expect(failed.resumable).not.toBe(true);
  });
});

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

// Fake Claude CLI: first invocation commits a tool_use block (a real resume
// boundary) then dies with an upstream 503 (resumable); every later invocation
// succeeds. Records argv per invocation so the test can assert
// --session-id / --resume.
async function writeResumableClaude(
  dir: string,
  name: string,
): Promise<{ bin: string; argsLogPath: string }> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  const argsLogPath = path.join(dir, `${name}-args.jsonl`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
const argsLogPath = ${JSON.stringify(argsLogPath)};
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-resume-on-failure');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
fs.appendFileSync(argsLogPath, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-resume-test' }));
if (attempts === 0) {
  // Commit a tool_use block (a real resume boundary) before the upstream drop.
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-resume-0',
      content: [{ type: 'tool_use', id: 'toolu_resume0', name: 'Bash', input: { command: 'echo working' } }],
      stop_reason: 'tool_use'
    }
  }));
  process.stderr.write('Upstream request failed: HTTP 503 stream disconnected before completion.\\n');
  setTimeout(() => process.exit(1), 20);
} else {
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-resume-' + attempts,
      content: [{ type: 'text', text: 'Recovered after resume.' }],
      stop_reason: 'end_turn'
    }
  }));
  setTimeout(() => process.exit(0), 20);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, argsLogPath };
}

// Fake Claude CLI that always fails with an upstream drop and emits NO
// assistant output (only the init frame), so the daemon sees a transient
// first-token failure with no side effects on every attempt.
async function writeNoOutputUpstreamClaude(
  dir: string,
  name: string,
): Promise<{ bin: string; argsLogPath: string }> {
  const bin = path.join(dir, name);
  const argsLogPath = path.join(dir, `${name}-args.jsonl`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const argsLogPath = ${JSON.stringify(argsLogPath)};
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-resume-noout');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
fs.appendFileSync(argsLogPath, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-resume-test' }));
process.stderr.write('Upstream request failed: HTTP 503 before first token.\\n');
setTimeout(() => process.exit(1), 20);
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, argsLogPath };
}

// Fake Claude CLI that streams a TEXT block (sets userVisibleOutputSeen) but
// commits no tool_use / artifact block, then fails with an upstream drop.
async function writeTextOnlyUpstreamClaude(
  dir: string,
  name: string,
): Promise<{ bin: string }> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-resume-textonly'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages]'); process.exit(0); }
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-resume-test' }));
console.log(JSON.stringify({
  type: 'assistant',
  message: { id: 'msg-textonly', content: [{ type: 'text', text: 'Half an answer before the drop.' }], stop_reason: null }
}));
process.stderr.write('Upstream request failed: HTTP 503 stream disconnected before completion.\\n');
setTimeout(() => process.exit(1), 20);
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin };
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
  const projectId = `resume_on_failure_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Resume on failure smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as {
    conversationId: string;
    id: string;
  };
  // Carry the projectId alongside the conversationId via a closure-free encoding.
  return `${projectId}::${projectBody.conversationId}`;
}

async function sendRunAndWait(url: string, encoded: string): Promise<RunStatus> {
  const [projectId, conversationId] = encoded.split('::');
  const assistantMessageId = `assistant_resume_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'resume-on-failure-test',
      'x-od-analytics-session-id': 'resume-on-failure-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_resume_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do the task',
      currentPrompt: 'please do the task',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  return await waitForRun(url, body.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function readArgs(file: string): Promise<string[][]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

function flagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}
