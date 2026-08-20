// Regression: a same-run retry must not inherit the previous attempt's
// `turnCompletedCleanly` verdict.
//
// The flag is run-scoped: applyClaudeStreamJsonRunBookkeeping sets
// run.turnCompletedCleanly = true on a clean `turn_end`, and the close handler
// feeds it to classifyChatRunCloseStatus. tearDownAttemptForRetry clears the
// other per-attempt run fields before re-spawning; if it fails to clear this
// one, a crashed retry attempt is classified 'succeeded' off the prior
// attempt's flag.
//
// Timeline exercised here:
//   Attempt 1: Claude emits a clean-but-EMPTY turn (stop_reason 'end_turn',
//     no content) → run.turnCompletedCleanly = true — then HANGS. The
//     inactivity watchdog fails the attempt (retryable no-output timeout) →
//     same-run retry.
//   Attempt 2: the CLI crashes (exit 1, no clean turn, no output).
//
// Expected: the run finishes 'failed'. Before the fix: 'succeeded', exitCode 1.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  signal: string | null;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
};

describe('same-run retry stale turnCompletedCleanly (review red spec)', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
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

  it('a crashed retry attempt is not classified succeeded by the previous attempt’s clean turn', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-stale-turn-flag-bin-'));
    const fakeClaude = await writeEmptyTurnThenCrashClaude(binDir, 'claude-staleflag');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    // Trip the no-output watchdog after the empty clean turn. The window must
    // comfortably outlast the time it takes the daemon to parse attempt 1's
    // `turn_end` and set run.turnCompletedCleanly — otherwise (e.g. a cold
    // module import) the watchdog can fire first, the flag never gets set, and
    // the run fails for the wrong reason (a false green that hides a regression).
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '3000';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);

    // Attempt 1 finished a clean-but-empty turn (retryable no-output timeout);
    // attempt 2 crashed with exit code 1 and produced nothing. The run must
    // NOT report success off the stale attempt-1 turn_end flag.
    // Guard the guard: if the scripted timeline did not actually run twice
    // (e.g. a pre-turn probe burned a counter tick), the run would fail for
    // an unrelated reason and this spec would pass without ever touching the
    // stale-flag path.
    const attemptsPath = path.join(binDir!, 'claude-staleflag-attempts');
    expect(Number(await readFile(attemptsPath, 'utf8'))).toBe(2);
    expect(run.status).toBe('failed');
    expect(run.exitCode).toBe(1);
  }, 60_000);
});

async function writeEmptyTurnThenCrashClaude(dir: string, name: string): Promise<string> {
  // The fake CLI is a Node script plus a platform-appropriate launcher. On
  // win32 an extensionless shebang file is NOT executable: executableFilePath()
  // (runtimes/executables.ts) rejects any CLAUDE_BIN whose extension isn't in
  // PATHEXT, the override resolves to null, and the daemon silently falls back
  // to the real `claude` on PATH — the run then never terminates and the test
  // times out instead of exercising the retry path.
  const script = path.join(dir, `${name}.js`);
  const counterPath = path.join(dir, `${name}-attempts`);
  await writeFile(script, `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-stale-flag');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
// The daemon runs an auth probe (claude auth status) and a capability
// probe (claude -p --help) before the turn. Neither is an attempt: if
// they burn a counter tick, the real attempt 1 takes the crash branch, the
// run fails as a plain non-retryable exit_nonzero, no retry ever spawns and
// the stale-flag path is never exercised (a false green).
if (process.argv[2] === 'auth') {
  console.log('Logged in as test@example.com');
  process.exit(0);
}
const isTurn = process.argv.includes('-p') && !process.argv.includes('--help');
if (!isTurn) { process.exit(0); }
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
if (attempts === 0) {
  // Clean but EMPTY turn: stop_reason end_turn with no content blocks.
  // claude-stream synthesizes turn_end -> run.turnCompletedCleanly = true.
  // Then hang: the inactivity watchdog must be what fails this attempt
  // (a retryable first-token timeout -> same-run retry).
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-stale-flag-test' }));
  console.log(JSON.stringify({
    type: 'assistant',
    message: { id: 'msg-empty-turn', content: [], stop_reason: 'end_turn' }
  }));
  setTimeout(() => process.exit(0), 60000);
} else {
  // Retry attempt: crash mid-run — no clean turn, no output, exit 1.
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-stale-flag-test' }));
  setTimeout(() => process.exit(1), 20);
}
`, 'utf8');
  // Launch the script through the platform's carrier, invoking THIS process's
  // node (not a `node` that may not be on the spawn PATH). Convention follows
  // codex-model-capability-preflight.test.ts.
  const bin = path.join(dir, process.platform === 'win32' ? `${name}.cmd` : name);
  if (process.platform === 'win32') {
    const crlf = String.fromCharCode(13, 10);
    const payload = [
      '@echo off',
      `"${process.execPath}" "${script}" %*`,
      'exit /b %ERRORLEVEL%',
      '',
    ].join(crlf);
    await writeFile(bin, payload, 'utf8');
  } else {
    await writeFile(
      bin,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
      'utf8',
    );
    await chmod(bin, 0o755);
  }
  return bin;
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
  const projectId = `stale_flag_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Stale turn flag repro',
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
      'x-od-analytics-device-id': 'stale-flag-test',
      'x-od-analytics-session-id': 'stale-flag-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_stale_${randomUUID()}`,
      clientRequestId: `client_stale_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce stale turn-completed flag across retry attempts',
      currentPrompt: 'reproduce stale turn-completed flag across retry attempts',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) {
      console.log('[repro] terminal run', JSON.stringify(run));
      try {
        const fsp = await import('node:fs/promises');
        const log = await fsp.readFile(run.eventsLogPath, 'utf8');
        const lines = log.split(String.fromCharCode(10)).filter((l) => /retry|turn_end|status|error/.test(l));
        console.log('[repro] events', lines.slice(-40).join(String.fromCharCode(10)));
      } catch (err) {
        console.log('[repro] events unreadable', String(err));
      }
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
