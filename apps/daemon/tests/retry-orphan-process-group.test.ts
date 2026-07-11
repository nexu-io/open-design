import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Red spec: a same-run retry must not orphan the failed attempt's descendant
// processes.
//
// The daemon spawns agent CLIs detached (process-group leader) and captures
// run.processGroupId precisely so teardown can signal the WHOLE group — the
// cancel path does this (runs.ts signalChildProcess: process.kill(-pgid)).
// But tearDownAttemptForRetry (server.ts) only calls run.child.kill('SIGTERM')
// on the direct child. Any grandchild the CLI spawned (MCP servers, tool
// subprocesses, internal runners) survives, reparented to PID 1, and keeps
// running forever. Every watchdog-triggered same-run retry leaks exactly one
// such orphan; a 20-run live loop against a real daemon leaked 20/20.
// The forced-shutdown escalation timers cannot save this: the old child's
// close handler clears them (clearForcedChildShutdown), and even when they
// fire, signalChildProcess bails on the childHasExited(child) guard because
// the direct child is already dead — so the group signal is never sent.

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  exitCode: number | null;
  signal: string | null;
};

describe('same-run retry orphaned process group', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let leakedPids: number[] = [];

  afterEach(async () => {
    // Never leave test orphans behind, pass or fail.
    for (const pid of leakedPids) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    leakedPids = [];
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('kills the failed attempt’s descendants when the same-run retry tears it down', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-retry-orphan-bin-'));
    const { bin: fakeClaude, grandchildPidPath } = await writeOrphaningClaude(binDir, 'claude-orphan');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    // Trip the no-output inactivity watchdog quickly so the first (silent)
    // attempt fails at first_token_wait and the same-run retry fires. Kept
    // comfortably above node cold-start so the retry attempt's own watchdog
    // does not also trip before it emits its first token.
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '1200';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);
    // The retry itself recovers the run — that part works.
    expect(run.status).toBe('succeeded');

    // The failed attempt spawned one descendant inside its process group.
    const grandchildPid = Number((await readFile(grandchildPidPath, 'utf8')).trim());
    expect(Number.isInteger(grandchildPid)).toBe(true);
    leakedPids.push(grandchildPid);

    // Teardown of the failed attempt must take its whole process group with
    // it (the cancel path already does: process.kill(-pgid)). Poll so a
    // correct implementation passes as soon as the group signal lands; on
    // buggy main the grandchild is still alive (reparented to PID 1) long
    // after the run finished.
    const dead = await waitForProcessExit(grandchildPid, 3_000);
    expect(
      dead,
      `grandchild ${grandchildPid} of the torn-down retry attempt is still alive ` +
        `${3_000}ms after the run finished — same-run retry teardown leaked its process group`,
    ).toBe(true);
  });
});

async function writeOrphaningClaude(
  dir: string,
  name: string,
): Promise<{ bin: string; grandchildPidPath: string }> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  const grandchildPidPath = path.join(dir, `${name}-grandchild-pid`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const counterPath = ${JSON.stringify(counterPath)};
const grandchildPidPath = ${JSON.stringify(grandchildPidPath)};
if (process.argv.includes('--version')) { fs.writeSync(1, 'claude-code 1.0.0-orphan\\n'); process.exit(0); }
if (process.argv.includes('--help')) { fs.writeSync(1, 'Usage: claude -p\\n'); process.exit(0); }
// Auxiliary daemon invocations (memory extraction / title generation) must
// not consume the chat-attempt counter.
if (!process.argv.includes('--session-id') && !process.argv.includes('--resume')) {
  fs.writeSync(1, '{"entries":[]}');
  process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
if (attempts === 0) {
  // First attempt: spawn a long-lived descendant in OUR process group (we are
  // the group leader because the daemon spawns agents detached), record its
  // PID, then silent-stall so the inactivity watchdog fails this attempt as a
  // retryable first-token stall. The watchdog's SIGTERM kills us (default
  // node behavior); a correct teardown also signals our process group and
  // takes the descendant with us.
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  fs.writeFileSync(grandchildPidPath, String(grandchild.pid));
  setTimeout(() => process.exit(0), 120000);
} else {
  fs.writeSync(1, JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-orphan-test' }) + '\\n');
  fs.writeSync(1, JSON.stringify({
    type: 'assistant',
    message: { id: 'msg-orphan-recovered', content: [{ type: 'text', text: 'Recovered after retry.' }], stop_reason: 'end_turn' },
  }) + '\\n');
  setTimeout(() => process.exit(0), 20);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, grandchildPidPath };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!processAlive(pid)) return true;
    await delay(100);
  }
  return !processAlive(pid);
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForRun(url: string): Promise<RunStatus> {
  const projectId = `retry_orphan_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Retry orphan process group probe',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'retry-orphan-test',
      'x-od-analytics-session-id': 'retry-orphan-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_orphan_${randomUUID()}`,
      clientRequestId: `client_orphan_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do not orphan my descendants',
      currentPrompt: 'please do not orphan my descendants',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  return await waitForRun(url, body.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
