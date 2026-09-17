import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// The failure card promises the user "the original error is under 「view
// details」", then shows only the daemon's generic sentence plus a pile of ids.
//
// Reproduced from a real run (`.od/runs/60d39320-…/events.jsonl`): the agent
// wrote the precise cause to stderr —
//   credentials-local: the value for "version" in …/.credentials.yaml must be a string
// — the daemon captured and persisted that stderr event, and then emitted an
// `error` frame carrying only "DeepSeek Harness profile exited without a
// terminal result." Nothing downstream ever joined the two, so the captured
// cause was unreachable from any UI.
//
// This asserts the STORED assistant message (what a reload reads) carries the
// bounded, redacted stderr tail alongside the generic detail — and that a
// failure with no stderr grows no such field.

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'dsh-profile-credentials-stderr.txt',
);

// The one sentence a human needs out of that 31-line Node crash dump.
const REAL_CAUSE =
  'credentials-local: the value for "version" in /Users/tester/.dsh/.credentials.yaml must be a string';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = { id: string; status: string };

type PersistedEvent = {
  kind?: string;
  label?: string;
  detail?: string;
  code?: string;
  failureCategory?: string;
  failureDetail?: string;
  stderrTail?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  events?: PersistedEvent[];
};

type RunHandles = {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  status: RunStatus;
};

describe('captured stderr on the persisted run-failure event', () => {
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

  it('carries the captured stderr tail onto the stored error event', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-stderr-tail-bin-'));
    const fakeClaude = await writeStderrEchoClaude(binDir, 'claude-stderr-echo');

    started = await startDaemonWithFakeClaude(fakeClaude);

    const { projectId, conversationId } = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, projectId, conversationId);
    expect(run.status.status).toBe('failed');

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      run.assistantMessageId,
    );
    const errorEvent = lastErrorEvent(stored);
    expect(errorEvent, 'a failed run must persist a status:error event').toBeTruthy();

    expect(
      errorEvent?.stderrTail,
      'the stderr the daemon already captured must reach the stored failure event',
    ).toBeTruthy();
    expect(errorEvent?.stderrTail).toContain(REAL_CAUSE);

    // Bounded: the tail is a tail, not the whole stream, and never unbounded text.
    const tail = errorEvent?.stderrTail ?? '';
    expect(Buffer.byteLength(tail, 'utf8')).toBeLessThanOrEqual(4 * 1024 + 64);
    const fixture = await readFile(FIXTURE_PATH, 'utf8');
    expect(tail.length).toBeLessThan(fixture.length);
  });

  it('adds no stderr field to a failure that produced no stderr', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-stderr-tail-silent-bin-'));
    const fakeClaude = await writeSilentFailingClaude(binDir, 'claude-silent-fail');

    started = await startDaemonWithFakeClaude(fakeClaude);

    const { projectId, conversationId } = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, projectId, conversationId);
    expect(run.status.status).toBe('failed');

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      run.assistantMessageId,
    );
    // No blanket section: an empty stream must not grow an empty `stderrTail`
    // on any persisted event, error frame or not.
    for (const event of stored?.events ?? []) {
      expect(event.stderrTail, `event ${event.kind}/${event.label} must have no stderrTail`)
        .toBeUndefined();
    }
  });
});

function lastErrorEvent(stored: StoredMessage | null): PersistedEvent | undefined {
  return [...(stored?.events ?? [])]
    .reverse()
    .find((event) => event.kind === 'status' && event.label === 'error');
}

async function startDaemonWithFakeClaude(bin: string): Promise<StartedServer> {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

  const server = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  await putConfig(server.url, {
    agentId: 'claude',
    agentCliEnv: { claude: { CLAUDE_BIN: bin } },
    telemetry: { metrics: true, content: false, artifactManifest: false },
    privacyDecisionAt: Date.now(),
  });
  return server;
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

// Fake Claude CLI: emits the init frame, replays the recorded agent crash dump
// onto stderr, then dies non-zero — the shape of the real DSH-profile failure.
// The dump is read from the fixture file rather than inlined so the bytes stay
// verbatim (it contains `${…}` sequences a template literal would eat).
async function writeStderrEchoClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-stderr-echo'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages]'); process.exit(0); }
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-stderr-echo' }));
process.stderr.write(fs.readFileSync(${JSON.stringify(FIXTURE_PATH)}, 'utf8'));
setTimeout(() => process.exit(1), 20);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

// Fake Claude CLI that fails with nothing on stderr at all.
async function writeSilentFailingClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-silent-fail'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages]'); process.exit(0); }
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-silent-fail' }));
setTimeout(() => process.exit(1), 20);
`,
    'utf8',
  );
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

async function createConversation(
  url: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `stderr_tail_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Captured stderr smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string; id: string };
  return { projectId, conversationId: projectBody.conversationId };
}

async function sendRunAndWait(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<RunHandles> {
  const assistantMessageId = `assistant_stderr_tail_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'stderr-tail-test',
      'x-od-analytics-session-id': 'stderr-tail-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_stderr_tail_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do the task',
      currentPrompt: 'please do the task',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  const status = await waitForRun(url, body.runId);
  return { projectId, conversationId, assistantMessageId, status };
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

async function fetchAssistantMessage(
  url: string,
  projectId: string,
  conversationId: string,
  assistantMessageId: string,
): Promise<StoredMessage | null> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { messages?: StoredMessage[] };
  return body.messages?.find((message) => message.id === assistantMessageId) ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
