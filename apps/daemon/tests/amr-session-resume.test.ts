import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// End-to-end coverage for AMR (vela) ACP session resume through the FULL server
// close handler — not just `attachAcpSession` in isolation.
//
// AMR is `resumesSessionViaAcpLoad`: turn 1 issues `session/new` and the daemon
// captures vela's durable `openCodeSessionId`; the next turn in the same
// conversation issues `session/load <handle>` to resume the upstream OpenCode
// session instead of re-paying the whole transcript cache-cold.
//
// The headline guard is the dead-handle fallback. When the resumed upstream
// session is gone, vela returns a structured `resume_failed` JSON-RPC error,
// which the ACP bridge turns into a FATAL. The daemon must STILL recognize it as
// a resume failure, clear the stale handle, surface a retryable error, and let
// the NEXT turn start a fresh `session/new` (re-seeded with the full transcript)
// — one cold turn, never a conversation wedged retrying a dead `session/load`.
//
// Regression note: turn-2's error code is `AGENT_EXECUTION_FAILED` whether or
// not the handle is cleared, so the load-bearing assertions are turn-3 (must
// SUCCEED via a fresh session) and the session-bind sequence
// (['new','load','new'], not ['new','load','load']). Before the close-handler
// ordering fix — where `hasFatalError()` short-circuited BEFORE the
// resume-failure reseed block — the dead handle was never cleared, so turn-3
// resumed it again, going ['new','load','load'] and failing.

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
type RunEvent = { event: string; data: unknown };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_VELA = path.join(HERE, 'fixtures', 'fake-vela.mjs');

describe('AMR (vela) ACP session resume — full server cycle', () => {
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

  it('captures the durable handle on turn 1 and resumes it via session/load on turn 2', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-resume-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    const bin = await writeVelaWrapper(binDir, 'vela-resume', { logPath });

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    const turn1 = await sendRunAndWait(started.url, conversationId, 'first request');
    expect(turn1.status).toBe('succeeded');

    const turn2 = await sendRunAndWait(started.url, conversationId, 'second request');
    expect(turn2.status).toBe('succeeded');

    // Turn 1 binds a fresh session; turn 2 resumes the captured durable handle.
    expect(await readInvocations(logPath)).toEqual(['new', 'load']);
  });

  it('transparently auto-reseeds within the same turn when the resumed session is gone', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-deadresume-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    // The resumed session is gone: any session/load turn fails with the
    // structured resume_failed; a fresh session/new turn still succeeds.
    const bin = await writeVelaWrapper(binDir, 'vela-deadresume', { logPath, resumeFailed: true });

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Turn 1 creates + persists the durable handle.
    const turn1 = await sendRunAndWait(started.url, conversationId, 'first request');
    expect(turn1.status).toBe('succeeded');

    // Turn 2 resumes (session/load), but the upstream session is gone → vela
    // returns resume_failed. The daemon must NOT surface an error: it clears the
    // dead handle and TRANSPARENTLY re-runs the same turn with a fresh session
    // (session/new) + full transcript, all within this one run. The user sees a
    // succeeded turn, never a "could not be resumed" message.
    const turn2 = await sendRunAndWait(started.url, conversationId, 'second request');
    expect(turn2.status).toBe('succeeded');
    expect(turn2.error ?? '').not.toMatch(/could not be resumed/i);

    // The bind sequence proves the in-turn reseed: turn 1 = new, turn 2 =
    // load (dead) → new (transparent reseed). Pre-feature this surfaced a failed
    // turn-2 and deferred the fresh session to a turn 3 the user had to trigger.
    expect(await readInvocations(logPath)).toEqual(['new', 'load', 'new']);
  });

  it('does not flash a client-visible error event during the transparent reseed', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-reseed-noerror-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    const bin = await writeVelaWrapper(binDir, 'vela-deadresume-noerror', { logPath, resumeFailed: true });

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    expect((await sendRunAndWait(started.url, conversationId, 'first request')).status)
      .toBe('succeeded');

    // Turn 2 resumes a now-dead session: vela returns resume_failed and the ACP
    // bridge calls fail() -> send('error') for the failed session/load BEFORE the
    // close handler clears the stale handle and re-runs the turn fresh. That
    // recovery is meant to be INVISIBLE, so the run's event log must carry no
    // client-visible `error` event — only the internal suppression diagnostic.
    const turn2 = await sendRunAndWait(started.url, conversationId, 'second request');
    expect(turn2.status).toBe('succeeded');

    const events = await readRunEvents(turn2.eventsLogPath);
    // Red before the fix: an `error` event flashes here even though turn 2
    // ultimately succeeds via the reseed, tripping any client that treats an SSE
    // `error` as terminal.
    expect(events.filter((e) => e.event === 'error')).toEqual([]);
    // The failure is held back as a non-user-visible diagnostic instead.
    expect(
      hasDiagnostic(events, { type: 'agent_resume_failed_suppressed' }),
    ).toBe(true);
    expect(hasDiagnostic(events, {
      type: 'agent_resume_auto_reseed',
      reason: 'resume_failed',
      stale_session_cleared: true,
    })).toBe(true);
    // The transparent reseed still happened: new → load (dead) → new.
    expect(await readInvocations(logPath)).toEqual(['new', 'load', 'new']);
  });

  it('opens a fresh session next turn when turn 1 yields no durable handle', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-nohandle-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    // vela never reports openCodeSessionId → the daemon captures null and must
    // clear the row, so the next turn cannot attempt a session/load.
    const bin = await writeVelaWrapper(binDir, 'vela-nohandle', { logPath, omitHandle: true });

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    expect((await sendRunAndWait(started.url, conversationId, 'first request')).status)
      .toBe('succeeded');
    expect((await sendRunAndWait(started.url, conversationId, 'second request')).status)
      .toBe('succeeded');

    // No handle was ever stored, so BOTH turns open a fresh session — never a
    // session/load against a non-existent upstream session.
    expect(await readInvocations(logPath)).toEqual(['new', 'new']);
  });

  it('persists the concrete resolved model for a default turn (equivalent explicit follow-up resumes)', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-defaultmodel-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    const bin = await writeVelaWrapper(binDir, 'vela-defaultmodel', { logPath });

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Turn 1 runs with the implicit default model, which resolves to the live
    // catalog's first entry (deepseek-v4-flash, the fake preset's head on a cold
    // cache). The guard must persist that CONCRETE id, not the raw `default`/null
    // request token.
    expect((await sendRunAndWait(started.url, conversationId, 'first request')).status)
      .toBe('succeeded');
    // Turn 2 names the SAME concrete model explicitly. Because turn 1 stored the
    // concrete id, the identity still matches and the session resumes. (Pre-fix
    // turn 1 stored null/`default`, so this read as model_changed and forced a
    // needless cold reseed.)
    expect((await sendRunAndWait(started.url, conversationId, 'second request', 'deepseek-v4-flash')).status)
      .toBe('succeeded');

    expect(await readInvocations(logPath)).toEqual(['new', 'load']);
  });

  it('reseeds a fresh session (no resume) when the model changes between turns', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-modelchange-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    const bin = await writeVelaWrapper(binDir, 'vela-modelchange', { logPath });

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Turn 1 binds a session under one model and captures the durable handle.
    expect((await sendRunAndWait(started.url, conversationId, 'first request', 'deepseek-v3.2')).status)
      .toBe('succeeded');
    // Turn 2 switches model: the resume-identity guard must invalidate (the
    // upstream session was seeded under the old model) and open a FRESH session
    // rather than session/load the mismatched one.
    expect((await sendRunAndWait(started.url, conversationId, 'second request', 'gemini-2.5-flash')).status)
      .toBe('succeeded');

    expect(await readInvocations(logPath)).toEqual(['new', 'new']);
  });
});

// A tiny executable shim that forwards to fake-vela.mjs under the current node,
// so VELA_BIN resolves to a real executable regardless of the fixture's mode.
// The daemon's `agentCliEnv` is allowlisted (only VELA_BIN survives for AMR), so
// behavior knobs are baked into the wrapper's OWN env here instead of passed
// through config — the wrapper exports them before exec'ing fake-vela.
async function writeVelaWrapper(
  dir: string,
  name: string,
  opts: { logPath: string; resumeFailed?: boolean; omitHandle?: boolean },
): Promise<string> {
  const bin = path.join(dir, name);
  const lines = [
    '#!/bin/sh',
    `export FAKE_VELA_INVOCATION_LOG=${JSON.stringify(opts.logPath)}`,
    // Isolate the resume cycle from the set_model gate; the strict-set_model
    // contract is covered by amr-acp-integration.test.ts.
    'export FAKE_VELA_REQUIRE_SET_MODEL=0',
  ];
  if (opts.resumeFailed) lines.push('export FAKE_VELA_RESUME_FAILED=1');
  if (opts.omitHandle) lines.push('export FAKE_VELA_OMIT_OPENCODE_SESSION_ID=1');
  lines.push(`exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_VELA)} "$@"`, '');
  await writeFile(bin, lines.join('\n'), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function readInvocations(logPath: string): Promise<string[]> {
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
    .map((line) => (JSON.parse(line) as { method: string }).method);
}

async function readRunEvents(
  eventsLogPath: string,
): Promise<RunEvent[]> {
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
  const projectId = `amr_resume_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'AMR resume smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string; id: string };
  return `${projectId}::${projectBody.conversationId}`;
}

async function sendRunAndWait(
  url: string,
  encoded: string,
  message: string,
  model?: string,
): Promise<RunStatus> {
  const [projectId, conversationId] = encoded.split('::');
  const assistantMessageId = `assistant_amr_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'amr-resume-test',
      'x-od-analytics-session-id': 'amr-resume-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_amr_${randomUUID()}`,
      agentId: 'amr',
      message,
      currentPrompt: message,
      ...(model ? { model } : {}),
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  return await waitForRun(url, body.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
