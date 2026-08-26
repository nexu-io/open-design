// Shared wiring for the per-attempt run clock suites (#7300).
//
// Every case here drives the REAL daemon (`startServer` or a spawned `od
// daemon start`) with a fake `claude` on the real spawn path, because the bug
// these suites exist for lives in WHEN the attempt boundary is opened and
// WHERE it is written — not in any helper. Anything that stubs the retry path
// or the message writer would prove the wrong thing.
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from 'vitest';

export type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

export type RunDiagnosticValue = { state: string; value?: number };

export type RunStatus = {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  eventsLogPath: string | null;
  attemptStartedAt?: number | null;
  attemptIndex?: number;
  executionDiagnostics?: {
    timing?: {
      queueDurationMs?: RunDiagnosticValue;
      retryWaitDurationMs?: RunDiagnosticValue;
    };
  };
};

export type ConversationMessage = {
  id: string;
  role: string;
  startedAt?: number;
  endedAt?: number;
  attemptStartedAt?: number | null;
  attemptIndex?: number | null;
};

export type RunEventRecord = {
  id: number;
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
};

/**
 * Attempt 0 must hang long enough for the watchdog to be the thing that fails
 * it, and the watchdog window must comfortably outlast daemon startup work, or
 * the run fails for the wrong reason and the retry never happens.
 */
export const INACTIVITY_TIMEOUT_MS = 1_200;

export const TELEMETRY_ENV_KEYS = [
  'POSTHOG_KEY',
  'POSTHOG_HOST',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'OPEN_DESIGN_TELEMETRY_RELAY_URL',
  'OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS',
] as const;

export function snapshotTelemetryEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    TELEMETRY_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
}

export function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export function silenceTelemetryEnv(): void {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
}

/**
 * A fake `claude` whose FIRST turn announces itself and then goes silent, so
 * the inactivity watchdog fails it as a retryable no-output timeout and the
 * policy schedules one same-run retry. Every later turn behaves normally.
 *
 * `retriedAttemptHoldMs` keeps the retried attempt alive for that long before
 * it produces its reply, which is the window a test needs when it has to act
 * (lift an injected fault, kill the daemon) while attempt 1 is in flight.
 */
export async function writeHangThenSucceedClaude(
  dir: string,
  name: string,
  opts: { retriedAttemptHoldMs?: number } = {},
): Promise<string> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  const holdMs = opts.retriedAttemptHoldMs ?? 0;
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-attempt-clock');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
// Count only real turn invocations. The daemon also spawns this bin for
// side probes (\`claude auth status\`), which are neither --version nor --help;
// counting those can consume attempt 0 before the turn starts, so the turn
// takes the already-retried branch, succeeds immediately, and no retry ever
// happens -- a flaky false green.
if (!process.argv.includes('-p')) {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-attempt-clock-test' }));
  process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-attempt-clock-test' }));
if (attempts === 0) {
  // Announce, then produce nothing. The inactivity watchdog fails this attempt
  // as a retryable no-output timeout, which is what schedules the same-run retry.
  setTimeout(() => process.exit(0), 60000);
} else {
  // The retried attempt behaves normally: real text, a clean turn, exit 0.
  setTimeout(() => {
    console.log(JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-attempt-clock',
        content: [{ type: 'text', text: 'recovered on the retried attempt' }],
        stop_reason: 'end_turn',
      },
    }));
    setTimeout(() => process.exit(0), 20);
  }, ${JSON.stringify(holdMs)});
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

export async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

export async function configureFakeClaude(url: string, fakeClaude: string): Promise<void> {
  await putConfig(url, {
    agentId: 'claude',
    agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
    telemetry: { metrics: true, content: false, artifactManifest: false },
    privacyDecisionAt: Date.now(),
  });
}

export async function readRunEvents(eventsLogPath: string | null): Promise<RunEventRecord[]> {
  expect(typeof eventsLogPath).toBe('string');
  const raw = await readFile(eventsLogPath as string, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunEventRecord);
}

export async function fetchConversationMessages(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<ConversationMessage[]> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = await response.json() as { messages?: ConversationMessage[] } | ConversationMessage[];
  return Array.isArray(body) ? body : body.messages ?? [];
}

export async function fetchRunStatus(url: string, runId: string): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
  expect(response.status).toBe(200);
  return await response.json() as RunStatus;
}

export interface RunPollContext {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
}

export interface StartedRun extends RunPollContext {
  runId: string;
}

/** Create a project and POST the run, without waiting for it to finish. */
export async function startRun(
  url: string,
  opts: { assistantMessageId?: string } = {},
): Promise<StartedRun> {
  const projectId = `attempt_clock_${randomUUID()}`;
  const assistantMessageId = opts.assistantMessageId ?? `assistant_attempt_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Per-attempt clock repro',
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
      'x-od-analytics-device-id': 'attempt-clock-test',
      'x-od-analytics-session-id': 'attempt-clock-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId,
      clientRequestId: `client_attempt_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce the per-attempt run clock',
      currentPrompt: 'reproduce the per-attempt run clock',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  return {
    runId: body.runId,
    projectId,
    conversationId: projectBody.conversationId,
    assistantMessageId,
  };
}

export async function createAndWaitForRun(url: string, opts?: {
  /** Tight enough to land several samples inside a 250-1000ms retry backoff. */
  pollIntervalMs?: number;
  assistantMessageId?: string;
  onPoll?: (run: RunStatus, ctx: RunPollContext) => Promise<void>;
}): Promise<{
  run: RunStatus;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
}> {
  const started = await startRun(
    url,
    opts?.assistantMessageId ? { assistantMessageId: opts.assistantMessageId } : {},
  );
  const ctx: RunPollContext = {
    projectId: started.projectId,
    conversationId: started.conversationId,
    assistantMessageId: started.assistantMessageId,
  };
  const run = await waitForRunTerminal(url, started.runId, ctx, opts);
  return { run, ...ctx };
}

export async function waitForRunTerminal(
  url: string,
  runId: string,
  ctx: RunPollContext,
  opts?: {
    pollIntervalMs?: number;
    onPoll?: (run: RunStatus, ctx: RunPollContext) => Promise<void>;
  },
): Promise<RunStatus> {
  const waitStartedAt = Date.now();
  while (Date.now() - waitStartedAt < 25_000) {
    const run = await fetchRunStatus(url, runId);
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await opts?.onPoll?.(run, ctx);
    await new Promise((resolve) => setTimeout(resolve, opts?.pollIntervalMs ?? 100));
  }
  throw new Error(`run ${runId} did not finish`);
}

export async function findFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!port) throw new Error('failed to allocate a free TCP port');
  return port;
}
