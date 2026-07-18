// Regression spec (RED on origin/main): a plain-stream run that emits an
// <artifact> tag early and then streams past the run.events ring buffer
// silently never persists the artifact — the delivered file is lost with no
// error anywhere.
//
// Mechanism: run.events is a bounded in-memory ring buffer
// (createChatRunService maxEvents = 2000, apps/daemon/src/runtimes/runs.ts).
// The plain-stream artifact finalizer (apps/daemon/src/server.ts, the
// `status === 'succeeded' && streamFormat === 'plain'` block) rebuilds the
// agent's stdout via plainStdoutFromRunEvents(run.events) — i.e. it re-scans
// ONLY the last 2000 events. Once the run has streamed >2000 further events,
// the artifact's opening tag has been spliced out of the buffer, the
// `plainStdout.includes('<artifact')` gate is false, and
// persistPlainStreamArtifacts is never called. The agent verifiably DID
// stream the artifact (it is in the on-disk events.jsonl); the in-memory
// verdict is what loses it.
//
// #5350 / PR #5351 fixed this same ring-buffer-truncation class for the
// close-status artifact verdict and the retry safety gate by folding side
// effects into a truncation-proof per-run ledger at emit time — but that
// migration never covered this plain-stream persistence consumer, which
// still scans run.events after the fact.
//
// Harness mirrors run-event-truncation-artifact-verdict.test.ts (#5351):
// drive a real daemon (startServer) over the production HTTP API with a fake
// `deepseek` CLI (streamFormat: 'plain') injected via
// agentCliEnv.deepseek.DEEPSEEK_BIN. The fake prints a complete
// <artifact>...</artifact> block FIRST, then floods >2000 separate stdout
// chunks (one run event per pipe read), then exits 0.
//
// Expected (correct) behavior: the run succeeds AND the artifact lands as a
// project file. On origin/main the first two mechanism assertions pass (the
// ring buffer is full and no longer contains the tag) while the behavioral
// assertion is RED: no artifact file is ever written.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

const PROD_DEFAULT_MAX_EVENTS = 2_000;
const ARTIFACT_IDENTIFIER = 'trunc-repro';
const ARTIFACT_FILE_NAME = `${ARTIFACT_IDENTIFIER}.html`;

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type RunStatus = { id: string; status: string; exitCode: number | null };

describe('plain-stream artifact persistence vs run.events ring-buffer truncation (HTTP)', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
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

  it('persists an artifact the agent streamed early, even after >2000 later stdout events truncate the ring buffer', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plain-trunc-bin-'));
    // 2x maxEvents with a full event-loop turn per chunk (setTimeout) so the
    // daemon reads each chunk as its own pipe 'data' event => one run event
    // per chunk, truncating the early artifact tag out of the ring buffer.
    const fakeDeepseek = await writeArtifactThenFloodDeepseek(
      binDir,
      'deepseek-trunc',
      PROD_DEFAULT_MAX_EVENTS * 2,
    );

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'deepseek',
      agentCliEnv: { deepseek: { DEEPSEEK_BIN: fakeDeepseek } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { run, projectId } = await createAndWaitForRun(started.url);

    // Sanity: the run itself completed cleanly — the loss is silent, not a
    // side effect of a failed run.
    expect(run.status).toBe('succeeded');
    expect(run.exitCode).toBe(0);

    // Mechanism assertion 1: the run streamed far more than maxEvents — the
    // in-memory ring buffer is full, i.e. truncation really happened.
    const eventsBody = await fetchRunEventsSseBody(started.url, run.id);
    const eventCount = (eventsBody.match(/^event:/gm) ?? []).length;
    expect(eventCount).toBeGreaterThanOrEqual(PROD_DEFAULT_MAX_EVENTS);

    // Mechanism assertion 2: the artifact tag the agent verifiably printed
    // FIRST is no longer anywhere in the ring buffer the finalizer scans.
    expect(eventsBody.includes('<artifact')).toBe(false);

    // Behavioral assertion (RED on origin/main): the artifact the agent
    // delivered must still land as a project file. The finalizer must not
    // depend on the tag surviving the 2000-event ring buffer.
    const filesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/files`,
    );
    expect(filesResponse.status).toBe(200);
    const filesBody = await filesResponse.json() as unknown;
    const files = Array.isArray(filesBody)
      ? filesBody
      : ((filesBody as { files?: unknown[] }).files ?? []);
    const names = files.map((file) =>
      typeof (file as { name?: unknown }).name === 'string'
        ? (file as { name: string }).name
        : String(file),
    );
    expect(
      names,
      `expected project files to include ${ARTIFACT_FILE_NAME} — the agent ` +
        `streamed a complete <artifact> block early in the run, but it fell out ` +
        `of the 2000-event run.events ring buffer before the plain-stream ` +
        `finalizer re-scanned it, so the artifact was silently never persisted`,
    ).toContain(ARTIFACT_FILE_NAME);
  });

  // Control: identical run WITHOUT the flood — the artifact tag stays inside
  // the ring buffer and persistence works. This passes on origin/main and
  // isolates the >2000-event truncation as the only variable that flips the
  // behavioral assertion above red.
  it('control: persists the same artifact when the run stays under the ring-buffer cap', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plain-trunc-bin-'));
    const fakeDeepseek = await writeArtifactThenFloodDeepseek(
      binDir,
      'deepseek-control',
      0,
    );

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'deepseek',
      agentCliEnv: { deepseek: { DEEPSEEK_BIN: fakeDeepseek } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { run, projectId } = await createAndWaitForRun(started.url);
    expect(run.status).toBe('succeeded');

    const filesResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/files`,
    );
    expect(filesResponse.status).toBe(200);
    const filesBody = await filesResponse.json() as unknown;
    const files = Array.isArray(filesBody)
      ? filesBody
      : ((filesBody as { files?: unknown[] }).files ?? []);
    const names = files.map((file) =>
      typeof (file as { name?: unknown }).name === 'string'
        ? (file as { name: string }).name
        : String(file),
    );
    expect(names).toContain(ARTIFACT_FILE_NAME);
  });
});

async function writeArtifactThenFloodDeepseek(
  dir: string,
  name: string,
  flood: number,
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('deepseek 4.0.0-trunc'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: deepseek exec [--auto] <prompt>'); process.exit(0); }
// Synchronous writes so every chunk is delivered before the process exits.
const W = (s) => fs.writeSync(1, s);
// The artifact comes FIRST — a complete, well-formed block.
W('<artifact identifier="${ARTIFACT_IDENTIFIER}" title="Trunc Repro" type="text/html">\\n');
W('<!doctype html><html><body>ring-buffer truncation repro</body></html>\\n');
W('</artifact>\\n');
// Flood: each chunk is flushed and the loop yields a full event-loop turn
// (setTimeout, not setImmediate) so the daemon wakes and reads each chunk as
// a separate pipe 'data' event => one run event per chunk.
(async () => {
  for (let i = 0; i < ${flood}; i++) {
    W('flood-' + i + ' ');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  process.exit(0);
})();
`, 'utf8');
  await chmod(bin, 0o755);
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

async function createAndWaitForRun(url: string): Promise<{ run: RunStatus; projectId: string }> {
  const projectId = `plain_trunc_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Plain-stream truncation repro',
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
      'x-od-analytics-device-id': 'plain-trunc-test',
      'x-od-analytics-session-id': 'plain-trunc-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_plain_trunc_${randomUUID()}`,
      clientRequestId: `client_plain_trunc_${randomUUID()}`,
      agentId: 'deepseek',
      message: 'reproduce plain-stream artifact truncation',
      currentPrompt: 'reproduce plain-stream artifact truncation',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return { run, projectId };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}

// GET /api/runs/:id/events is an SSE replay of run.events — i.e. of the
// capped in-memory ring buffer itself. For a terminal run the response ends
// after the replay, so a plain text read captures exactly what the
// finalizer's plainStdoutFromRunEvents(run.events) could see.
async function fetchRunEventsSseBody(url: string, runId: string): Promise<string> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`);
  expect(response.status).toBe(200);
  return response.text();
}
