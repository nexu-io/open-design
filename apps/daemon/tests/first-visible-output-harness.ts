// Shared wiring for the `first_visible_output` regression suites.
//
// Both suites drive the REAL daemon (`startServer` + a fake agent CLI on the
// real spawn path) and read the two timing fields off the real PostHog
// `run_finished` payload, because the bug this instrumentation exists for was
// never in a helper — it was in which call site owns the mark. Anything that
// stubs the emission path would prove the wrong thing.
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from 'vitest';

/**
 * Per-test timeout every case in these suites is declared with. Every wait
 * below is a slice of THIS budget, so no step can silently outlive the timeout
 * and no step needs an arbitrary cutoff of its own.
 */
export const TEST_BUDGET_MS = 90_000;
/** Spawn the CLI, stream the turn, reach a terminal run row. */
export const RUN_TERMINAL_WAIT_MS = 30_000;
/**
 * The daemon captures `run_finished` from an async chain that only starts once
 * the run row is terminal; posthog-node then posts it (flushAt: 1). Neither
 * step is synchronous with the status flip, so the sink is polled rather than
 * sampled once.
 */
export const CAPTURE_WAIT_MS = 30_000;
/**
 * Grace after the daemon's analytics flush has been awaited. Past this point a
 * missing event is a missing EVENT, not batching latency.
 */
export const FLUSHED_CAPTURE_WAIT_MS = 5_000;

// Leaves room for daemon boot, project/config setup and teardown inside the
// same budget. A future edit that grows a phase past the timeout fails here,
// at import, instead of as an unexplained timeout in one case.
if (
  RUN_TERMINAL_WAIT_MS + CAPTURE_WAIT_MS + FLUSHED_CAPTURE_WAIT_MS
  >= TEST_BUDGET_MS
) {
  throw new Error(
    'first_visible_output harness: phase waits exceed the per-test budget.',
  );
}

export type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

export type RunStatus = { id: string; status: string };

export type RunTiming = {
  time_to_first_token_ms?: number;
  time_to_first_visible_output_ms?: number;
};

export type CaptureSink = {
  url: string;
  /**
   * Resolve the run's `run_finished` timing, or throw. `flush` must drive the
   * daemon's own analytics shutdown (`startServer(...).shutdown`), which awaits
   * posthog-node's drain — that is what makes delivery deterministic instead of
   * hostage to an arbitrary sleep. The throw is preserved on purpose: a run
   * that never reports is a real regression, not something to wait out.
   */
  waitForRunFinished(runId: string, flush: () => Promise<void>): Promise<RunTiming>;
  close(): Promise<void>;
};

/**
 * `firstVisibleOutputAt` is stamped after `firstTokenAt` by construction: the
 * daemon cannot show bytes before it has the token they are made of. That held
 * only by accident while both marks shared one timestamp, so every case asserts
 * it now that they are stamped independently.
 */
export function expectVisibleOutputNotBeforeFirstToken(timing: RunTiming): void {
  expect(timing.time_to_first_token_ms).toBeTypeOf('number');
  expect(timing.time_to_first_visible_output_ms).toBeTypeOf('number');
  expect(
    timing.time_to_first_visible_output_ms! - timing.time_to_first_token_ms!,
  ).toBeGreaterThanOrEqual(0);
}

// Minimal stand-in for PostHog ingestion. posthog-node runs with `flushAt: 1`,
// so each daemon capture arrives as its own `/batch/` POST.
export async function startCaptureSink(): Promise<CaptureSink> {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      // posthog-node gzips its batch payloads.
      const raw = Buffer.concat(chunks);
      let body = '';
      try {
        body = /gzip/iu.test(req.headers['content-encoding'] ?? '')
          ? gunzipSync(raw).toString('utf8')
          : raw.toString('utf8');
      } catch {
        body = '';
      }
      try {
        const parsed = JSON.parse(body) as {
          batch?: Array<{ event?: unknown; properties?: unknown }>;
        };
        for (const record of parsed.batch ?? []) {
          if (typeof record.event !== 'string') continue;
          events.push({
            event: record.event,
            properties: (record.properties ?? {}) as Record<string, unknown>,
          });
        }
      } catch {
        // Non-batch probes (flags, etc.) are not interesting here.
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"status":1}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no capture port');

  const find = (runId: string): RunTiming | null => {
    const match = events.find(
      (record) =>
        record.event === 'run_finished' && record.properties.run_id === runId,
    );
    return match ? (match.properties as RunTiming) : null;
  };
  const poll = async (runId: string, budgetMs: number): Promise<RunTiming | null> => {
    const deadline = Date.now() + budgetMs;
    for (;;) {
      const match = find(runId);
      if (match) return match;
      if (Date.now() >= deadline) return null;
      await delay(100);
    }
  };

  return {
    url: `http://127.0.0.1:${address.port}`,
    async waitForRunFinished(runId, flush): Promise<RunTiming> {
      const captured = await poll(runId, CAPTURE_WAIT_MS);
      if (captured) return captured;
      // Force it rather than waiting longer: the daemon's shutdown awaits
      // `analytics.shutdown()`, which drains posthog-node, so once this
      // resolves the sink holds everything the daemon will ever send.
      await flush();
      const afterFlush = await poll(runId, FLUSHED_CAPTURE_WAIT_MS);
      if (afterFlush) return afterFlush;
      throw new Error(
        `no run_finished captured for ${runId} after the daemon analytics flush; saw ${
          events.map((record) => record.event).join(', ') || '<nothing>'
        }`,
      );
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * A fake `opencode` on the real json-event-stream spawn path. `body` is the
 * script that emits the turn; it runs with `emit()` and `finishTurn()` in
 * scope.
 */
export async function writeFakeOpencode(
  dir: string,
  name: string,
  body: string,
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const SESSION = 'ses_first_visible_output_0001';
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('1.17.7'); process.exit(0); }
if (argv.includes('--help')) { console.log('opencode run [message..]'); process.exit(0); }
if (argv[0] === 'models') { console.log('anthropic/claude-sonnet-4-5'); process.exit(0); }
let stdin = '';
let done = false;
function emit(obj) {
  console.log(JSON.stringify({ ...obj, sessionID: SESSION }));
}
function finishTurn() {
  emit({ type: 'step_finish', part: { type: 'step-finish', tokens: { input: 9, output: 4, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0 } });
  setTimeout(() => process.exit(0), 10);
}
function finish() {
  if (done) return; done = true;
  run();
}
function run() {
  emit({ type: 'step_start', part: { type: 'step-start' } });
${body}
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

export const TELEMETRY_ENV_KEYS = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'OPEN_DESIGN_TELEMETRY_RELAY_URL',
  'POSTHOG_KEY',
  'POSTHOG_HOST',
  'OD_NEXT_STRATEGY_ROLLOUT',
  'OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY',
] as const;

export function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    TELEMETRY_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
}

export function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export function clearTelemetryEnv(): void {
  for (const key of TELEMETRY_ENV_KEYS) delete process.env[key];
}

export async function putConfig(
  url: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
  // Populates the runtime/agent inventory the OD Next admission gate reads.
  await fetch(`${url}/api/agents`);
}

export type Conversation = { projectId: string; conversationId: string };

/** Ordinary chat project: the OD Next strategy has nothing to bind to. */
export async function createChatProject(
  url: string,
  label: string,
): Promise<Conversation> {
  return await createProject(url, label, {
    metadata: { kind: 'prototype' },
  });
}

/**
 * Design project carrying an `automatic_default` strategy binding — the shape
 * the OD Next rollout admits. The binding is asserted rather than assumed, so
 * a project-creation change that silently drops it fails here instead of
 * quietly turning the strategy case into an ordinary run.
 */
export async function createOdNextDesignProject(
  url: string,
  label: string,
): Promise<Conversation> {
  const created = await createProject(url, label, {
    metadata: { kind: 'prototype' },
    conversationMode: 'design',
    automaticStrategyTaskProfile: 'prototype',
  });
  expect(created.strategyBinding).toMatchObject({
    provenance: 'automatic_default',
    taskProfile: 'prototype',
  });
  return created;
}

async function createProject(
  url: string,
  label: string,
  extra: Record<string, unknown>,
): Promise<Conversation & { strategyBinding?: unknown }> {
  const projectId = `fvo_${label.replace(/[^a-z0-9]+/giu, '_')}_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'first visible output smoke',
      skipDiscoveryBrief: true,
      ...extra,
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    conversationId: string;
    project?: { metadata?: { strategyBinding?: unknown } };
  };
  return {
    projectId,
    conversationId: body.conversationId,
    strategyBinding: body.project?.metadata?.strategyBinding,
  };
}

export type StartedRun = { run: RunStatus; created: Record<string, unknown> };

export async function sendRunAndWait(
  url: string,
  conversation: Conversation,
  message: string,
): Promise<StartedRun> {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'first-visible-output-test',
      'x-od-analytics-session-id': 'first-visible-output-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId: conversation.projectId,
      conversationId: conversation.conversationId,
      userMessageId: `user_fvo_${randomUUID()}`,
      assistantMessageId: `assistant_fvo_${randomUUID()}`,
      clientRequestId: `client_fvo_${randomUUID()}`,
      agentId: 'opencode',
      message,
      currentPrompt: message,
    }),
  });
  expect(response.status).toBe(202);
  const created = (await response.json()) as Record<string, unknown>;
  return {
    created,
    run: await waitForRun(url, created.runId as string),
  };
}

export async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const deadline = Date.now() + RUN_TERMINAL_WAIT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (
      run.status === 'failed'
      || run.status === 'succeeded'
      || run.status === 'canceled'
    ) {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

/** The reply as the user's client received it, reassembled by the daemon. */
export async function readAssistantMessage(
  url: string,
  conversation: Conversation,
  assistantMessageId: string,
): Promise<string> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(conversation.projectId)}`
      + `/conversations/${encodeURIComponent(conversation.conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    messages: Array<{ id: string; role: string; content: string }>;
  };
  const message = body.messages.find((entry) => entry.id === assistantMessageId);
  return message?.content ?? '';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
