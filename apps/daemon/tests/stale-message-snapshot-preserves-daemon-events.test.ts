import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// #6396 regression: the daemon is the single writer of a daemon-backed
// assistant message's run events / content / last-run-event-id / run status.
// The web client still saves whole-message snapshots through
// PUT /messages/:mid, and a STALE snapshot (captured in memory before a
// reconnect / project-switch, then PUT after the daemon appended more events)
// used to overwrite `events_json` and wipe early events — including the
// `status:model` event the UI renders the Model module from.
//
// This drives a real run to completion so the daemon persists the early event,
// then replays a stale snapshot through the real PUT route and asserts the
// early event + content survived.

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
  text?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  content?: string;
  runId?: string;
  runStatus?: string;
  lastRunEventId?: string | null;
  events?: PersistedEvent[];
  feedback?: { rating?: number };
};

type RunHandles = {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  status: RunStatus;
};

describe('stale web message snapshot does not wipe daemon-owned run events', () => {
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

  it('retains an early daemon-persisted event after a stale web snapshot PUT', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-stale-put-msg-bin-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-stale-put');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const { assistantMessageId, status } = await sendRunAndWait(
      started.url,
      projectId,
      conversationId,
    );
    expect(status.status).toBe('succeeded');

    // The daemon persisted the early status event + text before we replay the
    // stale snapshot.
    const before = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(before).not.toBeNull();
    expect(
      before?.events?.some((event) => event.kind === 'status' && event.label === 'initializing'),
    ).toBe(true);
    expect(before?.content).toBe('Hello from the model.');

    // Simulate TWO stale web snapshots, both captured before the daemon
    // appended any run events AND before `/api/runs` assigned a run id — so the
    // payload omits `runId` entirely (a genuinely pre-run snapshot). PUT both
    // after the daemon persisted them. events/content/runStatus are all the
    // pre-run values; feedback is a genuine client-owned metadata write that
    // must still land.
    const staleSnapshot = (runId: string | undefined) => ({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      ...(runId ? { runId } : {}),
      runStatus: 'running',
      events: [],
      lastRunEventId: null,
      feedback: {
        rating: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    const putUrl = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(assistantMessageId)}`;
    const firstPut = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(staleSnapshot(undefined)),
    });
    expect(firstPut.status).toBe(200);
    // A second stale PUT (no runId, empty events) must not be able to drop the
    // message back out of the protected path now that `run_id` was preserved.
    const secondPut = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(staleSnapshot(undefined)),
    });
    expect(secondPut.status).toBe(200);

    // The daemon-owned run events/content AND the daemon-ownership marker
    // (runId) must survive both stale PUTs.
    const after = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      assistantMessageId,
    );
    expect(after?.runId).toBe(before?.runId);
    expect(after?.content).toBe('Hello from the model.');
    expect(
      after?.events?.some((event) => event.kind === 'status' && event.label === 'initializing'),
      'early daemon-persisted event should survive stale web snapshot PUTs',
    ).toBe(true);
    expect(after?.runStatus).toBe('succeeded');
    // Client-owned metadata writes still land on daemon-backed messages.
    expect(after?.feedback?.rating).toBe(1);
  });

  it('lets a mock-agent flow persist events/runStatus when the daemon never wrote any', async () => {
    // e2e Playwright suites mock the run SSE end-to-end, so the daemon never
    // persists events for the assistant message — the web client is the only
    // writer. The no-regression guard must NOT block that: a web write that
    // grows the stored event list (from empty to non-empty) must flow through,
    // including the terminal runStatus. Regression for the UI P0
    // app-restoration suite after the #6396 guard.
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `mock_flow_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    // Web creates the daemon-backed-looking row (runId from the mocked run
    // response) with no events yet.
    const created = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: '',
        runId: 'mock-run',
        runStatus: 'running',
        events: [],
      }),
    });
    expect(created.status).toBe(200);

    // Web streams the artifact via mocked SSE and persists the final snapshot.
    const persisted = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'assistant',
        content: 'artifact payload',
        runId: 'mock-run',
        runStatus: 'succeeded',
        events: [
          { kind: 'status', label: 'starting', detail: 'mock-agent' },
          { kind: 'text', text: 'artifact payload' },
        ],
      }),
    });
    expect(persisted.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.runStatus).toBe('succeeded');
    expect(stored?.content).toBe('artifact payload');
    expect(stored?.events).toEqual([
      { kind: 'status', label: 'starting', detail: 'mock-agent' },
      { kind: 'text', text: 'artifact payload' },
    ]);
  });

  it('still lets the client write non-daemon-backed messages', async () => {
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `user_stale_put_${randomUUID()}`;
    const url = `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`;

    const created = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: messageId, role: 'user', content: 'original' }),
    });
    expect(created.status).toBe(200);

    const updated = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: messageId,
        role: 'user',
        content: 'updated',
        events: [{ kind: 'text', text: 'client event' }],
      }),
    });
    expect(updated.status).toBe(200);

    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      messageId,
    );
    expect(stored?.content).toBe('updated');
    expect(stored?.events).toEqual([{ kind: 'text', text: 'client event' }]);
  });
});

// Fake Claude CLI: emits the init frame (persisted as the early status event),
// one text block (persisted as a text event + content), then completes cleanly.
async function writeCleanClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-stale-put'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
W({ type: 'system', subtype: 'init', model: 'stale-put-test-model' });
W({ type: 'assistant', message: { id: 'm-stale-put', content: [{ type: 'text', text: 'Hello from the model.' }], stop_reason: 'end_turn' } });
setTimeout(() => process.exit(0), 20);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
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
  const projectId = `stale_put_msg_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Stale snapshot message smoke',
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
  const assistantMessageId = `assistant_stale_put_msg_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'stale-put-msg-test',
      'x-od-analytics-session-id': 'stale-put-msg-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_stale_put_msg_${randomUUID()}`,
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
