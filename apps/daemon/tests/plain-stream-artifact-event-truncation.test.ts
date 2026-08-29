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

  // Regression guard for the accumulator cap (raised by review on #5850): the
  // truncation-proof stdout accumulator is head-biased (keeps the first CAP
  // bytes). If an <artifact> first appears AFTER a >CAP prose/log prefix, it is
  // NOT in the capped buffer — but it may still be in the last 2000 run.events.
  // A naive "always prefer the accumulator" finalizer would newly drop it (a
  // regression in the very path this PR fixes). The finalizer must fall back to
  // run.events when the accumulator was capped and lacks the tag. Here the big
  // prefix is written as a few large chunks, so the event count stays tiny and
  // the artifact tag survives in the ring — the fallback must find it.
  it('persists an artifact that first appears after a >8 MiB prefix (accumulator cap must fall back to the ring)', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plain-cap-bin-'));
    const fakeDeepseek = await writeBigPrefixThenArtifactDeepseek(binDir, 'deepseek-cap');

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

    // Mechanism: the prefix pushed the head-biased accumulator past its cap, but
    // the artifact tag still lives in the small ring (few large chunks), so the
    // finalizer's fallback path is what must persist the file.
    const eventsBody = await fetchRunEventsSseBody(started.url, run.id);
    expect(eventsBody.includes('<artifact')).toBe(true);

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
      `expected project files to include ${ARTIFACT_FILE_NAME} — the artifact ` +
        `first appeared after a >8 MiB prefix, so it is absent from the capped ` +
        `accumulator; the finalizer must fall back to run.events (where the tag ` +
        `still lives) rather than trusting the capped buffer's absence of it`,
    ).toContain(ARTIFACT_FILE_NAME);
  });

  // Regression guard #2 for the accumulator cap (raised by review on #5850): two
  // artifacts split across the cap boundary — `A -> >8 MiB prose -> B`. The
  // head-biased accumulator holds A (so it DOES contain `<artifact`), but B is
  // past the cap and only survives in the tail-biased run.events. A finalizer
  // that trusts the accumulator whenever it contains any tag would persist only
  // A and silently drop B. Both must land: when capped, the finalizer unions the
  // head and tail artifact sets.
  it('persists BOTH artifacts when they straddle the cap boundary (A -> >8 MiB -> B)', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plain-split-bin-'));
    const fakeDeepseek = await writeArtifactBigPrefixArtifactDeepseek(binDir, 'deepseek-split');

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
    expect(names, 'the early artifact A (in the capped head) must persist').toContain('split-a.html');
    expect(
      names,
      'the late artifact B (past the cap, only in the tail ring) must ALSO persist — ' +
        'the finalizer must union head and tail artifact sets, not stop at A',
    ).toContain('split-b.html');
  });

  // Regression guard #3 for the accumulator merge (raised by review on #5850):
  // two DISTINCT artifacts that happen to share the same identifier AND the same
  // body, straddling the cap boundary, must BOTH persist. A value-level dedup
  // (identifier+content) would collapse them to one; the stream-offset stitch
  // treats them as two separate occurrences and keeps both.
  it('keeps both artifacts when a distinct pair shares the same identifier and body across the cap boundary', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plain-dup-bin-'));
    const fakeDeepseek = await writeSameBodyArtifactsAcrossCapDeepseek(binDir, 'deepseek-dup');

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
    const dupFiles = names.filter((name) => /^dup.*\.html$/.test(name));
    expect(
      dupFiles.length,
      `both same-identifier same-body artifacts must persist as distinct files ` +
        `(got ${JSON.stringify(dupFiles)}) — a value-level dedup would keep only one`,
    ).toBe(2);
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

// Writes >8 MiB of prose FIRST (in a few large chunks, so the daemon reads it
// as a handful of run events — the ring buffer is NOT truncated), THEN a
// complete artifact block, then exits. This overruns the head-biased stdout
// accumulator's cap while leaving the artifact tag inside run.events.
async function writeBigPrefixThenArtifactDeepseek(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  // 9 chunks of 1 MiB = 9 MiB prose prefix, comfortably above the 8 MiB cap.
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('deepseek 4.0.0-cap'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: deepseek exec [--auto] <prompt>'); process.exit(0); }
const W = (s) => fs.writeSync(1, s);
const CHUNK = 'x'.repeat(1024 * 1024);
for (let i = 0; i < 9; i++) W('prefix-' + i + '-' + CHUNK + '\\n');
// The artifact appears only AFTER the >8 MiB prefix.
W('<artifact identifier="${ARTIFACT_IDENTIFIER}" title="Cap Repro" type="text/html">\\n');
W('<!doctype html><html><body>accumulator cap fallback repro</body></html>\\n');
W('</artifact>\\n');
process.exit(0);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

// Writes artifact A, THEN a >8 MiB prose block (few large chunks so the ring is
// not truncated), THEN artifact B, then exits. A lands in the capped head
// accumulator; B is past the cap and survives only in the tail-biased ring —
// the finalizer must union both.
async function writeArtifactBigPrefixArtifactDeepseek(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('deepseek 4.0.0-split'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: deepseek exec [--auto] <prompt>'); process.exit(0); }
const W = (s) => fs.writeSync(1, s);
W('<artifact identifier="split-a" title="Split A" type="text/html">\\n');
W('<!doctype html><html><body>artifact A before the cap</body></html>\\n');
W('</artifact>\\n');
const CHUNK = 'x'.repeat(1024 * 1024);
for (let i = 0; i < 9; i++) W('prefix-' + i + '-' + CHUNK + '\\n');
W('<artifact identifier="split-b" title="Split B" type="text/html">\\n');
W('<!doctype html><html><body>artifact B after the cap</body></html>\\n');
W('</artifact>\\n');
process.exit(0);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

// Writes two artifacts with the SAME identifier and IDENTICAL body, separated
// by a >8 MiB prose block (few large chunks so the ring is not truncated). One
// lands in the capped head, one past it; both survive in the tail ring. They
// are genuinely distinct deliverables and both must persist.
async function writeSameBodyArtifactsAcrossCapDeepseek(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('deepseek 4.0.0-dup'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: deepseek exec [--auto] <prompt>'); process.exit(0); }
const W = (s) => fs.writeSync(1, s);
const BLOCK =
  '<artifact identifier="dup" title="Dup" type="text/html">\\n' +
  '<!doctype html><html><body>identical body</body></html>\\n' +
  '</artifact>\\n';
W(BLOCK);
const CHUNK = 'x'.repeat(1024 * 1024);
for (let i = 0; i < 9; i++) W('prefix-' + i + '-' + CHUNK + '\\n');
W(BLOCK);
process.exit(0);
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
