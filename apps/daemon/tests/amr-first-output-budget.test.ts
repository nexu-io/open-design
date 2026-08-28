import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * What the daemon does — and says — when an AMR turn goes silent while it waits
 * for the model's first token.
 *
 * Two users reported turns that "keep getting stuck", one of them watching a
 * 171-minute wait. The daemon was cutting those turns off after 120 seconds,
 * killing the child, burning a same-run retry, and telling the user "the model
 * or CLI likely hung while generating" — a diagnosis the data contradicts:
 * across 14 days, 968 runs emitted their first output more than ten minutes in
 * and then SUCCEEDED (687 devices, longest 21.8 hours).
 *
 * 《Open Design 报错体验设计方案》 settles both halves:
 *   §1 五条原则 3: 「等待要有回音 … 不到超时不报错」
 *   Operational decision: AMR first output is bounded by the 15-minute Link request ceiling.
 *   §5 场景卡:     「等了 10 分钟没有新的输出，先停下来了 —— 已做的部分都保留着」
 *
 * These specs drive the wiring end-to-end (real `startServer`, real child
 * process, real ACP bridge) rather than the resolver in isolation, because the
 * bug users hit lives in the wiring: the budget, the kill, and the sentence.
 *
 * The fake vela stalls the way production does — it keeps emitting protocol
 * heartbeats forever without ever producing text, thinking, a tool call, or a
 * terminal prompt result. Pre-output heartbeats update diagnostics but do not
 * arm sliding inactivity. ACP transfers ownership after prompt dispatch, so the
 * only active watchdog is the absolute first-output budget under test.
 *
 * The budget itself is injected through `OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS`
 * (the operator escape hatch `resolveChatRunFirstOutputTimeoutMs` already
 * honors). The shipped 15-minute value is asserted where it costs nothing —
 * `tests/runtimes/chat-run-inactivity-timeout.test.ts` — because no test may
 * sleep for fifteen minutes to observe it.
 */

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
  terminalTrigger: string | null;
  failureCategory?: string | null;
  failureDetail?: string | null;
  eventsLogPath: string;
};

type RunEvent = { event: string; data: Record<string, unknown> };

const FAKE_VELA = fileURLToPath(new URL('./fixtures/fake-vela.mjs', import.meta.url));

/**
 * First-output budget for these specs. Long enough that a loaded CI host
 * cannot cross it during subprocess cold-start (which would make the
 * "still alive before the budget" assertion flaky), short enough that the one
 * terminal attempt and its process teardown stay inside the suite timeout.
 */
const FIRST_OUTPUT_BUDGET_MS = 3_000;

/** Sampling point for "the watchdog has not fired yet", comfortably below the budget. */
const BEFORE_BUDGET_SAMPLE_MS = 1_200;

/**
 * The sliding watchdogs are parked far out of reach so a failure in these
 * specs can only have come from the first-output budget.
 */
const OUT_OF_REACH_MS = '120000';

describe('AMR first-output budget — full server cycle', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    binDir = null;
    restoreEnv(originalEnv);
  });

  it(
    'keeps a silent AMR turn alive until its budget elapses, then reports the timeout as a fact instead of blaming the model',
    { timeout: 60_000 },
    async () => {
      binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-first-output-budget-'));
      const fakeVela = await writeAlwaysStallingVela(binDir, 'vela-silent-first-output');
      configureAmrEnv(String(FIRST_OUTPUT_BUDGET_MS));

      started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
      await putConfig(started.url, fakeVela);

      const { runId, headers, startedAt } = await startAmrRun(started.url);

      // 「不到超时不报错」 — silence alone, before the budget, is not a failure.
      // On the shipped 15-minute budget this is what a user's first ten quiet
      // minutes look like; here it is the same wiring on a compressed clock.
      await sleep(Math.max(0, startedAt + BEFORE_BUDGET_SAMPLE_MS - Date.now()));
      const midFlight = await readRun(started.url, runId, headers);
      expect(
        ['failed', 'succeeded', 'canceled'],
        `run went terminal after only ${Date.now() - startedAt}ms: ${midFlight.error ?? ''}`,
      ).not.toContain(midFlight.status);

      const run = await waitForRun(started.url, runId, headers);

      // The budget still bounds the wait — this is a timeout, not a hang.
      expect(run.status).toBe('failed');
      expect(run.terminalTrigger).toBe('first_output_deadline');
      expect(run.error).toContain('without emitting a first output');
      expect(run.error).toContain(`for ${FIRST_OUTPUT_BUDGET_MS / 1000}s`);

      // The headline regression: the daemon must not diagnose the model or the
      // CLI. It observed silence; the cause is unknown and, per the data,
      // usually is not a hang at all.
      expect(run.error).not.toMatch(/likely hung/i);
      expect(run.error).not.toMatch(/\bhung\b/i);
      expect(run.error).not.toMatch(/\blikely\b/i);

      // The classification the localized user-facing copy is keyed on must
      // survive the rewording — the chat card renders 「等了 N 分钟没有新的输出…」
      // off `failure_detail`, not off this English sentence.
      const events = await readRunEvents(run.eventsLogPath);
      expect(events.find((event) => event.event === 'run_retry_finished')?.data)
        .toMatchObject({
          failure_category: 'timeout',
          failure_detail: 'inactivity_timeout',
          failure_stage: 'first_token_wait',
        });
    },
  );

  it(
    'lets the caller-owned first-output deadline win when it equals the ACP stage timeout',
    { timeout: 60_000 },
    async () => {
      binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-equal-watchdog-'));
      const fakeVela = await writeAlwaysStallingVela(binDir, 'vela-equal-watchdog');
      configureAmrEnv(
        String(FIRST_OUTPUT_BUDGET_MS),
        String(FIRST_OUTPUT_BUDGET_MS),
        String(FIRST_OUTPUT_BUDGET_MS),
      );

      started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
      await putConfig(started.url, fakeVela);
      const { runId, headers } = await startAmrRun(started.url);
      const run = await waitForRun(started.url, runId, headers);

      expect(run.status).toBe('failed');
      expect(run.terminalTrigger).toBe('first_output_deadline');
      expect(run.error).toContain('without emitting a first output');
    },
  );

  it(
    'transitions from first-output ownership to inactivity after visible ACP text',
    { timeout: 60_000 },
    async () => {
      binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-post-output-stall-'));
      const fakeVela = await writeTextThenStallingVela(binDir, 'vela-post-output-stall');
      configureAmrEnv(String(FIRST_OUTPUT_BUDGET_MS), OUT_OF_REACH_MS, '1000');

      started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
      await putConfig(started.url, fakeVela);
      const { runId, headers } = await startAmrRun(started.url);
      const run = await waitForRun(started.url, runId, headers);

      expect(run.status).toBe('failed');
      expect(run.terminalTrigger).toBe('inactivity_watchdog');
      expect(run.error).toContain('without emitting any new output');
      const events = await readRunEvents(run.eventsLogPath);
      expect(events.filter((event) => event.event === 'start')).toHaveLength(1);
      expect(events.filter((event) => event.event === 'run_retry_attempted')).toHaveLength(0);
    },
  );
});

/**
 * A vela that completes the ACP handshake and then goes silent forever while
 * still speaking the protocol — the production stall shape. `writeVelaWrapper`
 * in the resume specs bakes knobs into the wrapper's own env for the same
 * reason: the daemon's `agentCliEnv` allowlist only lets `VELA_BIN` through.
 */
async function writeTextThenStallingVela(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    [
      '#!/bin/sh',
      'export FAKE_VELA_REQUIRE_SET_MODEL=0',
      'if [ "$1" = "agent" ] && [ "$2" = "run" ]; then',
      '  export FAKE_VELA_STALL_AFTER_PROMPT=1',
      '  export FAKE_VELA_TEXT_BEFORE_STALL=1',
      '  export FAKE_VELA_STALL_HEARTBEAT_MS=0',
      'fi',
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_VELA)} "$@"`,
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

async function writeAlwaysStallingVela(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    [
      '#!/bin/sh',
      'export FAKE_VELA_REQUIRE_SET_MODEL=0',
      'if [ "$1" = "agent" ] && [ "$2" = "run" ]; then',
      '  export FAKE_VELA_STALL_AFTER_PROMPT=1',
      'fi',
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_VELA)} "$@"`,
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

function configureAmrEnv(
  firstOutputTimeoutMs: string,
  acpStageTimeoutMs = OUT_OF_REACH_MS,
  inactivityTimeoutMs = OUT_OF_REACH_MS,
): void {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
  process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
  process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = firstOutputTimeoutMs;
  process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = inactivityTimeoutMs;
  process.env.OD_ACP_STAGE_TIMEOUT_MS = acpStageTimeoutMs;
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
    OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS: process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS,
    OD_ACP_STAGE_TIMEOUT_MS: process.env.OD_ACP_STAGE_TIMEOUT_MS,
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

async function putConfig(url: string, velaBin: string): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: velaBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(response.status).toBe(200);
}

async function startAmrRun(url: string): Promise<{
  runId: string;
  headers: Record<string, string>;
  startedAt: number;
}> {
  const projectId = `amr_first_output_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'AMR first-output budget smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  // AMR Cloud never bills the generic account wallet: the first Personal
  // Workspace list read adopts this otherwise-headerless project, and the run
  // then carries that persisted Workspace identity.
  const personalWorkspaceId = `amr_first_output_personal_${projectId}`;
  const headers = {
    'x-od-workspace-id': personalWorkspaceId,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': 'amr-first-output-owner',
    'x-od-workspace-role': 'owner',
  };
  const adoptionResponse = await fetch(
    `${url}/api/workspaces/${encodeURIComponent(personalWorkspaceId)}/projects?view=all`,
    { headers },
  );
  expect(adoptionResponse.status).toBe(200);

  const prompt = 'a turn whose first token takes a very long time';
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'amr-first-output-test',
      'x-od-analytics-session-id': 'amr-first-output-session',
      'x-od-analytics-client-type': 'web',
      ...headers,
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_amr_${randomUUID()}`,
      clientRequestId: `client_amr_${randomUUID()}`,
      agentId: 'amr',
      message: prompt,
      currentPrompt: prompt,
    }),
  });
  const body = (await runResponse.json()) as { runId?: string };
  expect(runResponse.status, JSON.stringify(body)).toBe(202);
  expect(body.runId).toBeTypeOf('string');
  return { runId: body.runId!, headers, startedAt: Date.now() };
}

async function readRun(
  url: string,
  runId: string,
  headers: Record<string, string>,
): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`, { headers });
  expect(response.status).toBe(200);
  return (await response.json()) as RunStatus;
}

async function waitForRun(
  url: string,
  runId: string,
  headers: Record<string, string>,
): Promise<RunStatus> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const run = await readRun(url, runId, headers);
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await sleep(100);
  }
  throw new Error(`run ${runId} did not finish`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
