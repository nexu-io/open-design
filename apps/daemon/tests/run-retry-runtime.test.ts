import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  agentId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
};

type RunEvent = {
  event: string;
  data: Record<string, unknown>;
};

const FAKE_VELA = fileURLToPath(new URL('./fixtures/fake-vela.mjs', import.meta.url));

// The two silent-stall cases below make the inactivity watchdog do two jobs with
// one budget: trip on the first (silent) attempt so the same-run retry fires,
// and NOT trip on that retry before its fresh child clears node cold-start and
// emits its first token. The old 400ms sat too close to cold-start on a loaded
// host, so the retry occasionally tripped its own watchdog and the spec flaked
// (#5721; same watchdog path as #5292). The first attempt stalls for ~60s, so
// any value trips it deterministically — sizing the budget well above any
// realistic subprocess cold-start removes the race. 40 consecutive runs of both
// stall cases were clean at 3000ms; 400ms flaked ~1/8.
const STALL_WATCHDOG_TIMEOUT_MS = '3000';

describe('same-run retry runtime', () => {
  const originalEnv = snapshotEnv();
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
    restoreEnv(originalEnv);
  });

  it('retries a transient first-token failure inside the same run and logs retry events', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-retry-runtime-bin-'));
    const fakeClaude = await writeFlakyClaude(binDir, 'claude-flaky');

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

    const run = await createAndWaitForRun(started.url);
    expect(run.status).toBe('succeeded');
    expect(run.id).toBeTruthy();

    const events = await readRunEvents(run.eventsLogPath);
    expect(events.filter((event) => event.event === 'start')).toHaveLength(2);
    expect(events.filter((event) => event.event === 'end')).toHaveLength(1);

    const retryAttempted = events.filter((event) => event.event === 'run_retry_attempted');
    expect(retryAttempted).toHaveLength(1);
    expect(retryAttempted[0]?.data).toMatchObject({
      run_id: run.id,
      retry_of_run_id: run.id,
      retry_attempt_index: 1,
      retry_max_attempts: 1,
      retry_strategy: 'same_run_transient',
      retry_reason: 'transient_failure',
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_5xx',
      failure_stage: 'first_token_wait',
    });

    const retryFinished = events.filter((event) => event.event === 'run_retry_finished');
    expect(retryFinished).toHaveLength(1);
    expect(retryFinished[0]?.data).toMatchObject({
      run_id: run.id,
      retry_of_run_id: run.id,
      retry_attempt_index: 1,
      retry_result: 'success',
    });
  });

  it('retries a generic OpenCode stream error without an explicit retryability hint', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-retry-stream-error-bin-'));
    const fakeOpenCode = await writeStreamErrorThenSuccessfulOpenCode(
      binDir,
      'opencode-stream-error-then-success',
    );

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: fakeOpenCode } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url, 'opencode');
    expect(run.status).toBe('succeeded');

    const events = await readRunEvents(run.eventsLogPath);
    expect(events.filter((event) => event.event === 'start')).toHaveLength(2);
    expect(events.filter((event) => event.event === 'run_retry_attempted')).toHaveLength(1);
    expect(events.find((event) => event.event === 'run_retry_attempted')?.data).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'stream_error',
      retry_reason: 'transient_failure',
    });
  });

  it('retries an ACP fatal close after persisting its runtime close reason', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-retry-acp-fatal-bin-'));
    const fakeVela = await writeFatalThenSuccessfulVela(binDir, 'vela-fatal-then-success');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url, 'amr');
    expect(run.status).toBe('succeeded');

    const events = await readRunEvents(run.eventsLogPath);
    expect(events.filter((event) => event.event === 'start')).toHaveLength(2);
    expect(events.filter((event) => event.event === 'run_retry_attempted')).toHaveLength(1);
    expect(events.find((event) => event.event === 'run_retry_attempted')?.data).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'fatal_rpc_error',
      retry_reason: 'transient_failure',
    });

    const fatalCloseDiagnostics = events.filter(
      (event) => event.event === 'diagnostic' &&
        event.data.type === 'runtime_close' &&
        event.data.rpc_close_reason === 'fatal_rpc_error',
    );
    expect(fatalCloseDiagnostics).toHaveLength(1);
  });

  it('retries a silent first-token stall caught by the inactivity watchdog', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-retry-stall-bin-'));
    const { bin: fakeClaude, argsLogPath } = await writeStallingClaude(binDir, 'claude-stall');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    // Trip the no-output watchdog on the silent first attempt so the same-run
    // retry fires; sized above cold-start so the retry doesn't trip it too
    // (see STALL_WATCHDOG_TIMEOUT_MS).
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = STALL_WATCHDOG_TIMEOUT_MS;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);
    expect(run.status).toBe('succeeded');
    expect(run.id).toBeTruthy();

    const events = await readRunEvents(run.eventsLogPath);
    // Two spawns (silent stall + recovered retry), one terminal end.
    expect(events.filter((event) => event.event === 'start')).toHaveLength(2);
    expect(events.filter((event) => event.event === 'end')).toHaveLength(1);

    const retryAttempted = events.filter((event) => event.event === 'run_retry_attempted');
    expect(retryAttempted).toHaveLength(1);
    expect(retryAttempted[0]?.data).toMatchObject({
      run_id: run.id,
      retry_of_run_id: run.id,
      retry_attempt_index: 1,
      retry_max_attempts: 1,
      retry_strategy: 'same_run_transient',
      retry_reason: 'transient_failure',
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
    });

    const retryFinished = events.filter((event) => event.event === 'run_retry_finished');
    expect(retryFinished).toHaveLength(1);
    expect(retryFinished[0]?.data).toMatchObject({
      run_id: run.id,
      retry_of_run_id: run.id,
      retry_attempt_index: 1,
      retry_result: 'success',
    });

    const attemptArgs = (await readClaudeAttemptArgs(argsLogPath)).filter(
      (args) => args.includes('--session-id') || args.includes('--resume'),
    );
    expect(attemptArgs).toHaveLength(2);
    for (const args of attemptArgs) {
      expect(args).toContain('--session-id');
      expect(args).not.toContain('--resume');
    }
    const firstAttemptSessionId = sessionIdArg(attemptArgs[0] ?? []);
    const secondAttemptSessionId = sessionIdArg(attemptArgs[1] ?? []);
    expect(firstAttemptSessionId).toBeTruthy();
    expect(secondAttemptSessionId).toBeTruthy();
    expect(secondAttemptSessionId).not.toBe(firstAttemptSessionId);
  });

  it('does not let a stalled attempt’s forced-shutdown timers kill the healthy retry', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-retry-crossgen-bin-'));
    const { bin: fakeClaude } = await writeCrossGenKillClaude(binDir, 'claude-crossgen');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    // Watchdog trips the first (silent) attempt; the escalation grace is short
    // so the stale SIGTERM/SIGKILL land while the retry child is mid-work. Both
    // the escalation window (trip + grace) and the retry lifetime (trip +
    // backoff) are anchored to the trip, so the overlap that makes this a valid
    // regression is independent of the timeout value; the timeout only has to
    // clear the retry's cold-start (see STALL_WATCHDOG_TIMEOUT_MS). Retry backoff
    // is <=500ms and the retry keeps emitting for ~2.1s, so the 800ms grace
    // still lands mid-work.
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = STALL_WATCHDOG_TIMEOUT_MS;
    process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS = '800';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);
    // On buggy main the previous attempt's forced-shutdown timers signal the
    // shared run.child (now the healthy retry) and kill it -> failed.
    expect(run.status).toBe('succeeded');
    expect(run.signal).toBeNull();
  });
});

async function writeCrossGenKillClaude(
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
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-crossgen'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
fs.appendFileSync(argsLogPath, JSON.stringify(process.argv.slice(2)) + '\\n');
if (attempts === 0) {
  // First attempt: silent first-token stall so the inactivity watchdog fires,
  // triggering the same-run retry and arming the forced-shutdown escalation
  // timers. Long fallback so we never self-exit before the watchdog.
  setTimeout(() => process.exit(0), 60000);
} else {
  // Retry attempt: a healthy child that keeps emitting (feeding its own
  // watchdog via raw stdout bytes) well past the previous attempt's
  // SIGTERM/SIGKILL escalation window, then finishes successfully. On buggy
  // main the stale escalation timers signal the shared run.child — i.e. THIS
  // child — and kill it mid-work, failing the run.
  process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-crossgen' }) + '\\n');
  let ticks = 0;
  const hb = setInterval(() => {
    process.stdout.write(' \\n');
    if (++ticks >= 14) {
      clearInterval(hb);
      process.stdout.write(JSON.stringify({
        type: 'assistant',
        message: { id: 'msg-crossgen', content: [{ type: 'text', text: 'Survived the escalation window.' }], stop_reason: 'end_turn' },
      }) + '\\n');
      setTimeout(() => process.exit(0), 20);
    }
  }, 150);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, argsLogPath };
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
    OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS: process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS,
    VELA_RUNTIME_KEY: process.env.VELA_RUNTIME_KEY,
    VELA_LINK_URL: process.env.VELA_LINK_URL,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function writeFlakyClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-retry-runtime');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
if (attempts === 0) {
  process.stderr.write('HTTP 503 Service Unavailable: upstream provider unavailable before first token.\\n');
  setTimeout(() => process.exit(1), 20);
} else {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-retry-test' }));
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-retry-success',
      content: [{ type: 'text', text: 'Recovered after retry.' }],
      stop_reason: 'end_turn'
    }
  }));
  setTimeout(() => process.exit(0), 20);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function writeFatalThenSuccessfulVela(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  await writeFile(bin, `#!/bin/sh
export FAKE_VELA_REQUIRE_SET_MODEL=0
if [ "$1" = "agent" ] && [ "$2" = "run" ]; then
  attempts=0
  if [ -f ${JSON.stringify(counterPath)} ]; then
    attempts=$(tr -dc '0-9' < ${JSON.stringify(counterPath)})
  fi
  echo $((attempts + 1)) > ${JSON.stringify(counterPath)}
  if [ "$attempts" -eq 0 ]; then
    export FAKE_VELA_PROMPT_ERROR='transient fatal RPC close'
  fi
fi
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_VELA)} "$@"
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function writeStreamErrorThenSuccessfulOpenCode(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
const counterPath = ${JSON.stringify(counterPath)};
if (argv.includes('--version')) { console.log('1.17.7'); process.exit(0); }
if (argv.includes('--help')) { console.log('opencode run [message..]'); process.exit(0); }
if (argv[0] === 'models') { console.log('anthropic/claude-sonnet-4-5'); process.exit(0); }
if (argv[0] !== 'run' || !process.cwd().includes('retry_runtime_')) {
  process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
if (attempts === 0) {
  console.log(JSON.stringify({
    type: 'error',
    error: { data: { message: 'synthetic generic stream frame failure' } },
  }));
  setTimeout(() => process.exit(1), 20);
} else {
  const sessionID = 'ses_retry_stream_error_success';
  console.log(JSON.stringify({ type: 'step_start', sessionID, part: { type: 'step-start' } }));
  console.log(JSON.stringify({
    type: 'text',
    sessionID,
    part: { type: 'text', text: 'Recovered after a generic stream error.' },
  }));
  console.log(JSON.stringify({
    type: 'step_finish',
    sessionID,
    part: {
      type: 'step-finish',
      tokens: { input: 8, output: 7, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
    },
  }));
  setTimeout(() => process.exit(0), 20);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function writeStallingClaude(
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
  console.log('claude-code 1.0.0-retry-stall');
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
if (attempts === 0) {
  // First attempt: emit nothing on stdout/stderr and hang well past the
  // inactivity watchdog window so the daemon classifies a silent first-token
  // stall. Exit cleanly when the watchdog SIGTERMs us (default Node behavior),
  // and keep a long fallback timer so we never self-exit before the watchdog.
  setTimeout(() => process.exit(0), 60000);
} else {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-retry-test' }));
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-retry-stall-success',
      content: [{ type: 'text', text: 'Recovered after watchdog retry.' }],
      stop_reason: 'end_turn'
    }
  }));
  setTimeout(() => process.exit(0), 20);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, argsLogPath };
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForRun(url: string, agentId = 'claude'): Promise<RunStatus> {
  const projectId = `retry_runtime_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Retry runtime smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const assistantMessageId = `assistant_retry_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'retry-runtime-test',
      'x-od-analytics-session-id': 'retry-runtime-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId,
      clientRequestId: `client_retry_${randomUUID()}`,
      agentId,
      message: 'please retry a transient runtime failure',
      currentPrompt: 'please retry a transient runtime failure',
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

async function readRunEvents(file: string): Promise<RunEvent[]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
}

async function readClaudeAttemptArgs(file: string): Promise<string[][]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

function sessionIdArg(args: string[]): string | null {
  const index = args.indexOf('--session-id');
  return index >= 0 ? args[index + 1] ?? null : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
