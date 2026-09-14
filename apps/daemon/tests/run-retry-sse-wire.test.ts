/**
 * `run_retry_attempted` must reach a subscribed SSE client, not just events.jsonl.
 *
 * The chat's "retrying" row (`apps/web/src/components/chat/Reconnect.tsx` with
 * `reason="agent-retry"`) is driven entirely by this frame arriving in the
 * browser. Nothing else can tell the UI that the first attempt died: the
 * `error` frame of a retried attempt is deliberately cached and never
 * surfaced, so if this frame stops being fanned out the row silently never
 * appears again and the user is back to staring at "in progress" for the whole
 * second attempt.
 *
 * That delivery is not obvious from the daemon side, and it has already been
 * doubted once in review: the event is written by the ANALYTICS emitter, and
 * `ChatSseEvent` did not list it. It works because `runtimes/runs.ts`'s `emit`
 * is BOTH the event-log writer and the SSE fan-out — one function, no filter
 * by event name. `run-retry-runtime.test.ts` covers the same retries but reads
 * `run.eventsLogPath` off disk, so it cannot see a regression that drops the
 * frame from the wire while still writing the file.
 *
 * So this spec asserts the wire specifically, over real HTTP, and additionally
 * pins the stronger property the fan-out actually has: the wire and the log
 * carry the SAME events. That is what makes it safe for the UI to rely on any
 * emitted record, and it fails loudly if someone adds a name-based filter.
 */
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

const TELEMETRY_ENV = [
  'POSTHOG_KEY', 'POSTHOG_HOST', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL', 'OPEN_DESIGN_TELEMETRY_RELAY_URL',
] as const;

/** Fails once before first token with a retryable 503, then succeeds. */
async function writeFlakyClaude(dir: string): Promise<string> {
  const bin = path.join(dir, 'claude-flaky');
  const counterPath = path.join(dir, 'attempts');
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-sse-wire'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
if (!process.argv.includes('--session-id') && !process.argv.includes('--resume')) {
  process.stdout.write('{"entries":[]}'); process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
if (attempts === 0) {
  process.stderr.write('HTTP 503 Service Unavailable: upstream provider unavailable before first token.\\n');
  setTimeout(() => process.exit(1), 20);
} else {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sse-wire' }));
  console.log(JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Recovered after retry.' }], stop_reason: 'end_turn' } }));
  setTimeout(() => process.exit(0), 20);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

/** Parse an SSE body into `{ id, event, data }` records. */
function parseSseBody(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  const out: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const frame of body.split('\n\n')) {
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const raw = /^data: (.*)$/m.exec(frame)?.[1];
    if (!event || raw === undefined) continue;
    out.push({ event, data: JSON.parse(raw) as Record<string, unknown> });
  }
  return out;
}

describe('run_retry_attempted reaches SSE subscribers', () => {
  const saved = Object.fromEntries(TELEMETRY_ENV.map((k) => [k, process.env[k]]));
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) await new Promise<void>((r) => started?.server.close(() => r()));
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('puts the frame on the wire, and the wire carries the same events as the log', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-sse-wire-bin-'));
    const bin = await writeFlakyClaude(binDir);
    for (const k of TELEMETRY_ENV) delete process.env[k];

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    const { url } = started;

    await fetch(`${url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: bin } },
        telemetry: { metrics: true, content: false, artifactManifest: false },
        privacyDecisionAt: Date.now(),
      }),
    });

    const projectId = `sse_wire_${randomUUID()}`;
    const projectResponse = await fetch(`${url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId, name: 'SSE wire', metadata: { kind: 'prototype' }, skipDiscoveryBrief: true,
      }),
    });
    expect(projectResponse.status).toBe(200);
    const { conversationId } = await projectResponse.json() as { conversationId: string };

    const runResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-analytics-device-id': 'sse-wire-test',
        'x-od-analytics-session-id': 'sse-wire-session',
        'x-od-analytics-client-type': 'web',
      },
      body: JSON.stringify({
        projectId,
        conversationId,
        assistantMessageId: `assistant_${randomUUID()}`,
        clientRequestId: `client_${randomUUID()}`,
        agentId: 'claude',
        message: 'exercise the retry wire',
        currentPrompt: 'exercise the retry wire',
      }),
    });
    expect(runResponse.status).toBe(202);
    const { runId } = await runResponse.json() as { runId: string };

    // Subscribe the way the browser does. The response ends when the run goes
    // terminal, so reading it to completion yields the whole stream.
    const stream = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`);
    expect(stream.status).toBe(200);
    const wire = parseSseBody(await stream.text());

    const retryFrames = wire.filter((e) => e.event === 'run_retry_attempted');
    expect(retryFrames).toHaveLength(1);
    // The two fields the chat reads. `retry_max_attempts` is 1 today
    // (DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS); the UI suppresses the "N/M"
    // counter while it stays 1, so this asserts presence and type, not the
    // literal budget — that number is Q-11's to change.
    expect(retryFrames[0]!.data.retry_attempt_index).toBe(1);
    expect(typeof retryFrames[0]!.data.retry_max_attempts).toBe('number');
    expect(retryFrames[0]!.data.run_id).toBe(runId);

    // The retry has to be visible BEFORE the run ends, otherwise the row could
    // only ever be drawn after the fact.
    const retryIndex = wire.findIndex((e) => e.event === 'run_retry_attempted');
    const endIndex = wire.findIndex((e) => e.event === 'end');
    expect(retryIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(retryIndex);

    // Same events, same order, on the wire and in the log. This is the property
    // the UI leans on: `emit` fans out every record it writes, with no filter
    // by event name.
    const status = await (await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`)).json() as {
      status: string; eventsLogPath: string;
    };
    expect(status.status).toBe('succeeded');
    const disk = (await readFile(status.eventsLogPath, 'utf8'))
      .trim().split('\n').map((line) => (JSON.parse(line) as { event: string }).event);
    expect(wire.map((e) => e.event)).toEqual(disk);
  }, 120_000);
});
