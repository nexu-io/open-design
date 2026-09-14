import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path, { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * Wiring coverage for the ACP stage-watchdog failure, driven through the FULL
 * server run cycle rather than the bridge in isolation.
 *
 * The unit spec next door (`acp-stage-timeout-classification.test.ts`) pins the
 * frame and the classifier. This one pins the three surfaces a user and the
 * chat card actually read — the SSE `error` frame recorded in the run's events
 * log, the run's own `GET /api/runs/:id` classification, and the `status:error`
 * event persisted onto the assistant message that a reloaded conversation
 * renders from — because those are what decided whether the reported user got
 * a Retry button or the generic 「任务执行失败」 card.
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
  failureCategory?: string | null;
  failureDetail?: string | null;
  failureAction?: string | null;
  retryable?: boolean | null;
  eventsLogPath: string;
};

type ErrorFrame = {
  message?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    details?: Record<string, unknown>;
  };
};

type PersistedStatusEvent = {
  kind?: unknown;
  label?: unknown;
  detail?: unknown;
  code?: unknown;
  failureCategory?: unknown;
  failureDetail?: unknown;
  failureAction?: unknown;
  retryable?: unknown;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ACP_CLI = path.join(HERE, 'fixtures', 'fake-acp-handshake-cli.mjs');
const AGENT_ID = 'kimi';
const AGENT_BIN = 'kimi';
/** Short enough to keep the suite fast, long enough to clear the handshake. */
const STAGE_TIMEOUT_MS = 1_200;

describe('ACP stage timeout — server wiring', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir = '';
  let agentHomeDir = '';

  beforeEach(async () => {
    agentHomeDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stage-timeout-home-'));
  });

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await removeTempDir(binDir);
    if (agentHomeDir) await removeTempDir(agentHomeDir);
    binDir = '';
    agentHomeDir = '';
    restoreEnv(originalEnv);
  });

  it('reaches the chat as a named, retryable timeout on every surface', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stage-timeout-bin-'));
    await writeStallingAcpCliShim(binDir, AGENT_BIN);
    isolateAgentDetection(binDir, agentHomeDir);
    clearTelemetryEnv();
    // Only the ACP stage watchdog may end this turn: the chat-level inactivity
    // and first-output watchdogs are disabled so the verdict under test is not
    // shadowed by a different one.
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(STAGE_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '0';
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    const conversation = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversation, 'draft a landing page');

    expect(run.status).toBe('failed');

    // 1. The SSE frame the live client reads. Every ACP `error` frame this run
    //    produced must be named — a client holding only the frame (the daemon's
    //    classification rides the later `end` frame) has nothing else to go on.
    const events = await readRunEvents(run.eventsLogPath);
    const errorFrames = events
      .filter((event) => event.event === 'error')
      .map((event) => event.data as ErrorFrame);
    expect(errorFrames.length).toBeGreaterThan(0);
    for (const frame of errorFrames) {
      expect(frame.error?.details).toMatchObject({ kind: 'acp_stage_timeout', action: 'retry' });
      expect(frame.error?.retryable).toBe(true);
    }

    // 2. The run's own classification — what `statusBody` and the SSE `end`
    //    frame carry, and what the live chat stamps onto the failed message.
    expect(run.failureCategory).toBe('timeout');
    expect(run.failureDetail).toBe('timeout');
    expect(run.failureAction).toBe('retry');
    expect(run.retryable).toBe(true);
    // The watchdog's own sentence survives verbatim: it is what the card shows
    // under 「查看错误详情」 and what the classifier's text path still reads.
    expect(run.error ?? '').toMatch(/ACP session\/prompt timed out after \d+ms/);

    // 3. The stored event a RELOADED conversation renders from. `ChatPane`
    //    resolves the card from `failureDetail` here, never from the stream.
    const persisted = await readPersistedRunErrorEvent(started.url, conversation);
    expect(persisted.failureDetail).toBe('timeout');
    expect(persisted.failureAction).toBe('retry');
    expect(persisted.retryable).toBe(true);
  }, 60_000);
});

/**
 * A CLI that completes the ACP handshake and then never answers
 * `session/prompt` — the shape of the reported run, where a `Write` tool call
 * produced zero bytes until the watchdog gave up.
 */
async function writeStallingAcpCliShim(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    [
      '#!/bin/sh',
      'export FAKE_ACP_CLI_VERSION="1.0.0"',
      'export FAKE_ACP_PROMPT_STALL=1',
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_ACP_CLI)} "$@"`,
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

/**
 * Makes the fixture CLI the only agent CLI detection can find, so the run does
 * not drag the host's real agent binaries through a `--version` probe. Same
 * rationale as `acp-handshake-failure-wiring.test.ts`.
 */
function isolateAgentDetection(dir: string, homeDir: string): void {
  process.env.OD_AGENT_HOME = homeDir;
  process.env.PATH = [dir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
}

async function readRunEvents(eventsLogPath: string): Promise<Array<{ event: string; data: unknown }>> {
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
    .map((line) => JSON.parse(line) as { event: string; data: unknown });
}

/**
 * The stored `status: 'error'` event, read through the same route the web
 * client calls on mount. Polls because the finalizer enriches this event with
 * the run's classification a beat after the run turns terminal.
 */
async function readPersistedRunErrorEvent(
  url: string,
  encoded: string,
): Promise<PersistedStatusEvent> {
  const { projectId, conversationId, headers } = decodeFixtureIdentity(encoded);
  const startedAt = Date.now();
  let last: PersistedStatusEvent | null = null;
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(
      `${url}/api/projects/${encodeURIComponent(projectId)}`
        + `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { headers },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      messages?: Array<{ role: string; events?: PersistedStatusEvent[] }>;
    };
    for (const message of (body.messages ?? []).slice().reverse()) {
      if (message.role !== 'assistant') continue;
      const events = message.events ?? [];
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event?.kind === 'status' && event.label === 'error') {
          last = event;
          if (typeof event.failureDetail === 'string') return event;
          break;
        }
      }
    }
    await delay(50);
  }
  if (last) return last;
  throw new Error('conversation never persisted a status:error event');
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    OD_AGENT_HOME: process.env.OD_AGENT_HOME,
    OD_ACP_STAGE_TIMEOUT_MS: process.env.OD_ACP_STAGE_TIMEOUT_MS,
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
    OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS: process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS,
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
    body: JSON.stringify({
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
      ...patch,
    }),
  });
  expect(response.status).toBe(200);
}

function decodeFixtureIdentity(encoded: string): {
  projectId: string;
  conversationId: string;
  headers: Record<string, string>;
} {
  const [projectId, conversationId, workspaceId, workspaceMemberId] = encoded.split('::');
  if (!projectId || !conversationId || !workspaceId || !workspaceMemberId) {
    throw new Error(`invalid ACP stage-timeout fixture identity: ${encoded}`);
  }
  return {
    projectId,
    conversationId,
    headers: {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-type': 'personal',
      'x-od-workspace-member-id': workspaceMemberId,
      'x-od-workspace-role': 'owner',
    },
  };
}

async function createConversation(url: string): Promise<string> {
  const projectId = `acp_stage_timeout_${randomUUID().replace(/-/g, '')}`;
  const workspaceId = `acp_stage_timeout_personal_${projectId}`;
  const workspaceMemberId = `acp_stage_timeout_owner_${projectId}`;
  const workspaceHeaders = {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': workspaceMemberId,
    'x-od-workspace-role': 'owner',
  };
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...workspaceHeaders },
    body: JSON.stringify({
      id: projectId,
      name: 'ACP stage timeout smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string };
  return [projectId, projectBody.conversationId, workspaceId, workspaceMemberId].join('::');
}

async function sendRunAndWait(
  url: string,
  encoded: string,
  message: string,
): Promise<RunStatus> {
  const { projectId, conversationId, headers: workspaceHeaders } =
    decodeFixtureIdentity(encoded);
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'acp-stage-timeout-test',
      'x-od-analytics-session-id': 'acp-stage-timeout-session',
      'x-od-analytics-client-type': 'web',
      ...workspaceHeaders,
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_acp_stage_${randomUUID()}`,
      clientRequestId: `client_acp_stage_${randomUUID()}`,
      agentId: AGENT_ID,
      message,
      currentPrompt: message,
    }),
  });
  const body = (await runResponse.json()) as { runId?: string };
  expect(runResponse.status, JSON.stringify(body)).toBe(202);
  expect(body.runId).toBeTypeOf('string');
  return await waitForRun(url, body.runId!, workspaceHeaders);
}

async function waitForRun(
  url: string,
  runId: string,
  headers: Record<string, string>,
): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 40_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`, { headers });
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
