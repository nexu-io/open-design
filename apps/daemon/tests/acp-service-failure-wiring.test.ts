import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Wiring coverage for the model-service failure classes on the ACP/JSON-RPC
// path, driven through the FULL server run cycle rather than the pure helper.
//
// The gap this pins down: `attachAcpSession`'s `fail()`
// (`agent-protocol/acp/session.ts`) hard-codes `AGENT_EXECUTION_FAILED` on
// every failure payload it emits, and — unlike the json-event-stream and Claude
// paths in `server.ts`, which both run `classifyAgentServiceFailure` over the
// failure text — never upgrades that code from what the agent actually said.
// So on all nine `streamFormat: 'acp-json-rpc'` runtimes (amr, vibe, devin,
// hermes, kilo, kimi, kiro, trae-cli, reasonix), a provider outage, a throttle,
// and a signed-out CLI all arrive at the client under the same opaque code.
//
// A pure test over the classifier proves nothing about that, because the
// classifier was never the broken part: it already recognises every one of
// these strings. What was missing was the call. So these tests assert on the
// two surfaces a user and the telemetry pipeline actually observe — the `error`
// SSE frame recorded in the run's events log, and `run.error` / `run.errorCode`
// on `GET /api/runs/:id`.
//
// The daemon's job here is to NAME the class, not to word it: `run.error` stays
// the agent's own line verbatim (it is what the details block shows and what
// `run-failure-classification.ts` reads), and the sentence the user reads is
// resolved from the code by the web's i18n.

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
};

/** The structured half of an SSE `error` frame — what the web localizes from. */
type ErrorFrame = {
  message?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    details?: Record<string, unknown>;
  };
};

type RunEvent = { event: string; data: unknown };

/** The persisted half of the same failure — what a reload reads instead of SSE. */
type PersistedStatusEvent = {
  kind?: unknown;
  label?: unknown;
  detail?: unknown;
  code?: unknown;
  failureCategory?: unknown;
  failureDetail?: unknown;
};

type PersistedMessage = {
  id: string;
  role: string;
  events?: PersistedStatusEvent[];
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ACP_CLI = path.join(HERE, 'fixtures', 'fake-acp-handshake-cli.mjs');

/**
 * A non-AMR ACP runtime on purpose. AMR's own account-failure branch runs
 * earlier in the `send` bridge and would mask whether the generic ACP path
 * classifies at all; the other eight runtimes have no such branch, and this is
 * the shape they all share.
 */
const AGENT_ID = 'kimi';
const AGENT_BIN = 'kimi';

/**
 * The line a user read on packaged `0.21.2-beta.1`, verbatim — an AMR/vela run
 * whose provider replied "overloaded". The `(event=session.error, session=…)`
 * tail is vela's own; the `json-rpc id N: ` prefix is the daemon's
 * `rpcErrorMessage`. Reported from inside `session/prompt`, so it reaches the
 * daemon post-session — the half of the ACP path the handshake guidance is
 * explicitly not about.
 */
const UPSTREAM_OVERLOADED =
  'opencode event stream: {"id":"evt_079e7523a001q84xvEDieo4RPa",'
  + '"properties":{"error":{"data":{"message":"\\"[code=upstream_error] Our servers are '
  + 'currently overloaded. Please try again later.\\""},"name":"UnknownError"},'
  + '"sessionID":"ses_f86193cfdffevgdF9Hpf8QQcGF"},"type":"session.error"}'
  + ' (event=session.error, session=ses_f86193cfdffevgdF9Hpf8QQcGF)';

/** What a signed-out ACP CLI answers `session/new` with — found on a real Kimi CLI. */
const AUTH_REQUIRED = 'Authentication required';

describe('ACP model-service failure classes — server wiring', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let agentHomeDir = '';

  beforeEach(async () => {
    agentHomeDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-service-home-'));
  });

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await removeTempDir(binDir);
    binDir = null;
    if (agentHomeDir) await removeTempDir(agentHomeDir);
    agentHomeDir = '';
    restoreEnv(originalEnv);
  });

  // The headline case. `UPSTREAM_UNAVAILABLE` is the one code the web has an
  // upstream-outage card for; without it this run reaches the client as
  // `AGENT_EXECUTION_FAILED`, whose card has a null messageKey — which hands the
  // description slot back to the raw string, so the user reads vela's whole JSON
  // envelope with the one sentence that explains the failure quoted inside it.
  it('names a mid-turn provider overload as an upstream outage', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-service-upstream-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, {
      logPath,
      cliVersion: '0.38.0',
      promptErrorMessage: UPSTREAM_OVERLOADED,
      promptErrorRetryable: true,
    });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');

    // 1. The class the web can draw a card for.
    expect(run.errorCode).toBe('UPSTREAM_UNAVAILABLE');

    // 2. The raw line is untouched. It is the input to
    //    `run-failure-classification.ts` AND the text shown under
    //    「查看错误详情」, so rewriting it would degrade telemetry and the
    //    details block at once. Classification changed; the record did not.
    const runError = run.error ?? '';
    expect(runError).toContain('Our servers are currently overloaded');
    expect(runError).toContain('json-rpc id ');

    // 3. Same code on the SSE frame the live client renders from, with the
    //    agent's own message and its own retryability preserved.
    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(String(frame.error?.message ?? '')).toContain(
        'Our servers are currently overloaded',
      );
      // The CLI said `data.retryable = true`; the daemon does not overwrite a
      // retryability the agent reported.
      expect(frame.error?.retryable).toBe(true);
    }

    // 4. …and it survives a reload, which is when users actually come back to
    //    act on the failure. `ChatPane` rebuilds the card from the stored
    //    event, never from a replayed stream.
    const persisted = await readPersistedRunErrorEvent(started.url, conversationId);
    expect(persisted.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(String(persisted.detail ?? '')).toContain(
      'Our servers are currently overloaded',
    );
    // The analysis axis already reached this verdict on its own. Pinning it
    // here is the whole point: the code now agrees with the bucket instead of
    // prescribing a different fix from the dashboard.
    expect(persisted.failureCategory).toBe('upstream_unavailable');
  });

  // Same bridge, a different class, and the one that decides which of two
  // completely different remedies the user is sent after. A handshake rejection
  // that names authentication is claimed by auth, not by the CLI-refusal
  // verdict — `AGENT_CLI_SESSION_REFUSED` would tell a signed-out user to
  // change a CLI that works.
  it('names a signed-out CLI as an auth failure, not a generic execution failure', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-service-auth-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, {
      logPath,
      cliVersion: '0.38.0',
      errorMessage: AUTH_REQUIRED,
    });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');
    expect(run.errorCode).toBe('AGENT_AUTH_REQUIRED');
    expect(run.error ?? '').toBe('json-rpc id 2: Authentication required');

    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).toBe('AGENT_AUTH_REQUIRED');
      // Not the CLI-version verdict, which prescribes the wrong fix here.
      expect(frame.error?.details?.action).not.toBe('update_cli');
    }
  });

  // The invariant that keeps this from becoming a second, competing classifier:
  // a bare `Internal error` names no cause, so `withAcpHandshakeFailureGuidance`
  // still owns it and the service classifier must not overwrite the code it
  // stamped. The two are mutually exclusive by construction
  // (`isAcpCliSessionRefusalText` reports false for any text the run classifier
  // can already name), and this proves the composition preserves that.
  it('leaves an unexplained handshake refusal to the CLI-version verdict', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-service-refusal-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, { logPath, cliVersion: '0.38.0' });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');
    expect(run.errorCode).toBe('AGENT_CLI_SESSION_REFUSED');
    expect(run.error ?? '').toBe('json-rpc id 2: Internal error');
  });
});

async function writeAcpCliShim(
  dir: string,
  name: string,
  opts: {
    logPath: string;
    cliVersion: string;
    retryable?: boolean;
    errorMessage?: string;
    promptErrorMessage?: string;
    promptErrorRetryable?: boolean;
  },
): Promise<string> {
  const bin = path.join(dir, name);
  const lines = [
    '#!/bin/sh',
    `export FAKE_ACP_INVOCATION_LOG=${JSON.stringify(opts.logPath)}`,
    `export FAKE_ACP_CLI_VERSION=${JSON.stringify(opts.cliVersion)}`,
  ];
  if (opts.errorMessage) {
    lines.push(
      `export FAKE_ACP_SESSION_NEW_ERROR_MESSAGE=${JSON.stringify(opts.errorMessage)}`,
    );
  }
  if (opts.retryable) lines.push('export FAKE_ACP_SESSION_NEW_ERROR_RETRYABLE=1');
  if (opts.promptErrorMessage) {
    lines.push(
      `export FAKE_ACP_PROMPT_ERROR_MESSAGE=${JSON.stringify(opts.promptErrorMessage)}`,
    );
  }
  if (opts.promptErrorRetryable) lines.push('export FAKE_ACP_PROMPT_ERROR_RETRYABLE=1');
  lines.push(
    `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_ACP_CLI)} "$@"`,
    '',
  );
  await writeFile(bin, lines.join('\n'), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

/** Warms the daemon-lifetime `--version` probe cache. */
async function detectAgents(url: string): Promise<void> {
  const response = await fetch(`${url}/api/agents`);
  expect(response.status).toBe(200);
  await response.json();
}

/**
 * Makes the fixture CLI the ONLY agent CLI detection can find — see the same
 * helper in `acp-handshake-failure-wiring.test.ts` for why an unscoped
 * `GET /api/agents` turns into a dozen real CLI spawns on a developer machine.
 */
function isolateAgentDetection(dir: string, homeDir: string): void {
  process.env.OD_AGENT_HOME = homeDir;
  process.env.PATH = [dir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
}

/**
 * The stored `status: 'error'` event a reloaded conversation renders from.
 * Polls briefly because finalize-time enrichment lands just after the run turns
 * terminal; it does not tolerate a missing event.
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
    const body = (await response.json()) as { messages?: PersistedMessage[] };
    for (const message of (body.messages ?? []).slice().reverse()) {
      if (message.role !== 'assistant') continue;
      const events = message.events ?? [];
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event?.kind === 'status' && event.label === 'error') {
          last = event;
          if (typeof event.code === 'string' && typeof event.failureCategory === 'string') {
            return event;
          }
        }
      }
    }
    await delay(50);
  }
  if (last) return last;
  throw new Error('conversation never persisted a status:error event');
}

function decodeFixtureIdentity(encoded: string): {
  projectId: string;
  conversationId: string;
  headers: Record<string, string>;
} {
  const [projectId, conversationId, workspaceId, workspaceMemberId] = encoded.split('::');
  if (!projectId || !conversationId || !workspaceId || !workspaceMemberId) {
    throw new Error(`invalid ACP service fixture identity: ${encoded}`);
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

function snapshotEnv(): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    OD_AGENT_HOME: process.env.OD_AGENT_HOME,
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

async function createConversation(url: string): Promise<string> {
  const projectId = `acp_service_${randomUUID().replace(/-/g, '')}`;
  const workspaceId = `acp_service_personal_${projectId}`;
  const workspaceMemberId = `acp_service_owner_${projectId}`;
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
      name: 'ACP service failure smoke',
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
      'x-od-analytics-device-id': 'acp-service-test',
      'x-od-analytics-session-id': 'acp-service-session',
      'x-od-analytics-client-type': 'web',
      ...workspaceHeaders,
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_acp_${randomUUID()}`,
      clientRequestId: `client_acp_${randomUUID()}`,
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
  while (Date.now() - startedAt < 15_000) {
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
