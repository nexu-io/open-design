// Regression: an SSE reattach whose cursor predates the in-memory event ring
// buffer must be gapless.
//
// run.events is capped at createChatRunService maxEvents (2000). When a client
// reconnects with Last-Event-ID / ?after=<n> older than the oldest surviving
// event, stream() used to replay only the surviving tail — silently skipping
// every event the ring buffer had already evicted, with no gap signal. Those
// events are still in the on-disk events.jsonl, so the reattach now backfills
// the missing prefix from disk.
//
// This drives a real run past 2000 events over the daemon HTTP API, then
// reattaches with a stale cursor and asserts the replay starts exactly at
// cursor+1 with no missing ids. Before the fix, the first replayed id jumps
// far past the cursor and hundreds of events vanish.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type RunStatus = { id: string; status: string; eventsLogPath: string };

const FLOOD = 2_500; // comfortably past the 2000-event ring buffer

describe('SSE reattach gap backfill', () => {
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

  it('reattaching with a cursor older than the ring buffer replays a gapless stream', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-reattach-bin-'));
    const fakeClaude = await writeFloodClaude(binDir, 'claude-flood', FLOOD);

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
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);
    const totalOnDisk = (await readFile(run.eventsLogPath, 'utf8'))
      .trim().split('\n').filter(Boolean).length;
    expect(totalOnDisk).toBeGreaterThan(2_000); // precondition: the buffer truncated

    // Reattach: "give me everything after event 5".
    const cursor = 5;
    const res = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(run.id)}/events?after=${cursor}`,
      { headers: { 'Last-Event-ID': String(cursor) } },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    const ids = [...body.matchAll(/^id:\s*(\d+)/gm)].map((m) => Number(m[1]));

    // INVARIANT: the replay resumes exactly at cursor+1 and skips nothing.
    expect(ids[0]).toBe(cursor + 1);
    expect(ids).toContain(cursor + 1);
    // No gap anywhere in the replayed prefix down to the buffer boundary.
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1] + 1);
    }
  });
});

async function writeFloodClaude(dir: string, name: string, flood: number): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-flood'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--add-dir DIR]'); process.exit(0); }
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
W({ type: 'system', subtype: 'init', model: 'flood-test' });
for (let i = 0; i < ${flood}; i++) {
  W({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 't' + i + ' ' } } });
}
W({ type: 'assistant', message: { id: 'm', content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' } });
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

async function createAndWaitForRun(url: string): Promise<RunStatus> {
  const projectId = `reattach_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Reattach gap repro',
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
      'x-od-analytics-device-id': 'reattach-test',
      'x-od-analytics-session-id': 'reattach-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_reattach_${randomUUID()}`,
      clientRequestId: `client_reattach_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce reattach gap',
      currentPrompt: 'reproduce reattach gap',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const runStatus = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(runStatus.status)) return runStatus;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
