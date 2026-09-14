import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/*
 * One logical OD Next turn spans several physical Runs, and the daemon gives
 * each of them its own assistant row (the continuation's row id is minted as
 * `odnext_assistant_<hash>`). The web client renders those rows as ONE turn, so
 * while the successor streams it keeps appending into the message object it
 * already had on screen — the PREDECESSOR's row — and then persists that folded
 * copy through `PUT /api/projects/:id/conversations/:cid/messages/:mid`.
 *
 * When that PUT names the successor Run, `mergeMessageWriteForDaemonBacked`
 * already refuses it. When it names the row's OWN Run — which is what the
 * client sends after a conversation refresh has handed the server's `runId` and
 * terminal `runStatus` back to a message the stream is still writing into — the
 * guard sees an ordinary "grew a bit" write and lets the whole successor stream
 * land. The successor's answer is then stored twice: once inside the
 * predecessor's row and once in its own, and a freshly opened project renders
 * the conclusion two times.
 *
 * Observed in the packaged 0.21.1-beta.7 database, conversation
 * 59edcc92-3f83-4c7f-880f-8eccf905785a: message 5ba87c0e (clarification Run
 * fefe72f4) carries 1010 events with TWO `done_key`s — its own
 * `ea4b836c2a18b4e8` at index 1 and the production Run's `d35b50f40e3a9ba7` at
 * index 239 — and its `content` ends with the production row's full body.
 * A second, older instance sits in the same database from 2026-08-28.
 *
 * The invariant this pins: a daemon-backed assistant row holds the stream of
 * exactly ONE physical Run. A client write may never introduce a sibling Run's
 * stream into it, whatever `runId` the payload claims.
 */

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = { id: string; status: string };

type PersistedEvent = {
  kind?: string;
  key?: string;
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
  events?: PersistedEvent[];
  startedAt?: number;
  endedAt?: number;
};

/*
 * Event shapes copied from the packaged beta database (the production Run's own
 * row, `odnext_assistant_26e1ba4b367f97c2d2aa9ac0aedafb35`). `thinking_tokens`
 * only ever comes from the web translation — the daemon deliberately does not
 * persist it — which is how the stored copy was identified as a client write.
 */
const SUCCESSOR_TAIL_EVENTS: PersistedEvent[] = [
  { kind: 'status', label: 'initializing', detail: 'claude-opus-5[1m]' },
  { kind: 'status', label: 'requesting' },
  { kind: 'status', label: 'thinking' },
  { kind: 'thinking_tokens', tokens: 4210, at: 1788514048035 } as PersistedEvent,
  { kind: 'thinking', text: "I'll start executing the plan, setting up the todo list first." },
  {
    kind: 'text',
    text: '\n\n已交付 `opendesign-enterprise-proposal.html`（16 页，59.8 KB，单文件自包含）。',
  },
  {
    kind: 'usage',
    inputTokens: 44,
    outputTokens: 62140,
    costUsd: 4.176115,
    durationMs: 1464652,
  } as PersistedEvent,
];

const SUCCESSOR_BODY = '\n\n已交付 `opendesign-enterprise-proposal.html`（16 页，59.8 KB，单文件自包含）。';

describe('a task successor Run must not be folded into its predecessor row', () => {
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

  it('refuses a client write that carries a sibling Run’s stream, even when it names the row’s own Run', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-task-successor-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-task-successor');
    clearTelemetryEnv();

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);

    // Predecessor Run + its daemon-owned row (the clarification stage).
    const predecessorMessageId = `predecessor_${randomUUID()}`;
    await sendRunAndWait(started.url, projectId, conversationId, predecessorMessageId);
    // Successor Run + the row the daemon mints for an automatic continuation.
    const successorMessageId = `odnext_assistant_${randomUUID().replace(/-/g, '').slice(0, 32)}`;
    await sendRunAndWait(started.url, projectId, conversationId, successorMessageId);

    const predecessor = await fetchMessage(
      started.url, projectId, conversationId, predecessorMessageId,
    );
    const successor = await fetchMessage(
      started.url, projectId, conversationId, successorMessageId,
    );
    expect(predecessor?.runStatus).toBe('succeeded');
    expect(successor?.runStatus).toBe('succeeded');

    const predecessorDoneKey = doneKeysOf(predecessor);
    const successorDoneKey = doneKeysOf(successor);
    expect(predecessorDoneKey, 'each Run stamps exactly one done_key').toHaveLength(1);
    expect(successorDoneKey).toHaveLength(1);
    expect(successorDoneKey[0]).not.toBe(predecessorDoneKey[0]);
    const successorKey = successorDoneKey[0] as string;

    // The folded snapshot the client sends: the predecessor row's own stream
    // followed by the successor Run's whole stream (its `start` frame, its
    // `done_key`, its body, its terminal `usage`) — and it names the row's OWN
    // Run and the terminal status the row already carries, which is what the
    // client holds after a conversation refresh.
    const foldedEvents: PersistedEvent[] = [
      ...(predecessor?.events ?? []),
      { kind: 'status', label: 'starting', detail: 'claude' },
      { kind: 'done_key', key: successorKey },
      ...SUCCESSOR_TAIL_EVENTS,
    ];
    const foldedContent = `${predecessor?.content ?? ''}${SUCCESSOR_BODY}`;

    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(predecessorMessageId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: predecessorMessageId,
          role: 'assistant',
          runId: predecessor?.runId,
          runStatus: predecessor?.runStatus,
          content: foldedContent,
          events: foldedEvents,
          endedAt: Date.now(),
        }),
      },
    );
    expect(response.status).toBe(200);

    const after = await fetchMessage(
      started.url, projectId, conversationId, predecessorMessageId,
    );
    expect(
      doneKeysOf(after),
      'the predecessor row must still hold only its own Run’s done_key',
    ).toEqual(predecessorDoneKey);
    expect(
      after?.content?.endsWith(SUCCESSOR_BODY),
      'the successor Run’s body must not be appended to the predecessor row',
    ).toBe(false);
    expect(after?.content).toBe(predecessor?.content);
    expect(after?.events?.length).toBe(predecessor?.events?.length);

    // The successor's own row is untouched — it is the one place that answer lives.
    const successorAfter = await fetchMessage(
      started.url, projectId, conversationId, successorMessageId,
    );
    expect(doneKeysOf(successorAfter)).toEqual(successorDoneKey);
  }, 60_000);

  it('still lets a client grow a daemon-backed row with its own Run’s client-only events', async () => {
    // Control. `thinking_tokens` is produced by the web translation only, so a
    // normal turn legitimately grows the stored list after the daemon is done.
    // The fix must not turn that into a refused write.
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-own-run-growth-'));
    const fakeClaude = await writeCleanClaude(binDir, 'claude-own-run-growth');
    clearTelemetryEnv();

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const messageId = `own_run_${randomUUID()}`;
    await sendRunAndWait(started.url, projectId, conversationId, messageId);

    const before = await fetchMessage(started.url, projectId, conversationId, messageId);
    const ownDoneKey = doneKeysOf(before);
    expect(ownDoneKey).toHaveLength(1);

    const grown: PersistedEvent[] = [
      ...(before?.events ?? []),
      { kind: 'thinking_tokens', tokens: 1234, at: Date.now() } as PersistedEvent,
    ];
    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: messageId,
          role: 'assistant',
          runId: before?.runId,
          runStatus: before?.runStatus,
          content: before?.content,
          events: grown,
        }),
      },
    );
    expect(response.status).toBe(200);

    const after = await fetchMessage(started.url, projectId, conversationId, messageId);
    expect(after?.events?.length).toBe(grown.length);
    expect(after?.events?.some((event) => event.kind === 'thinking_tokens')).toBe(true);
    expect(doneKeysOf(after)).toEqual(ownDoneKey);
  }, 60_000);
});

function doneKeysOf(message: StoredMessage | null): string[] {
  return (message?.events ?? [])
    .filter((event) => event.kind === 'done_key' && typeof event.key === 'string')
    .map((event) => event.key as string);
}

async function writeCleanClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-task-successor'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
W({ type: 'system', subtype: 'init', model: 'task-successor-test-model' });
W({ type: 'assistant', message: { id: 'm-task-successor', content: [{ type: 'text', text: 'Hello from the model.' }], stop_reason: 'end_turn' } });
setTimeout(() => process.exit(0), 20);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

function clearTelemetryEnv(): void {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
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
  const projectId = `task_successor_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Task successor absorption',
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
  assistantMessageId: string,
): Promise<string> {
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'task-successor-test',
      'x-od-analytics-session-id': 'task-successor-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_task_successor_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do the task',
      currentPrompt: 'please do the task',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  await waitForRun(url, body.runId);
  return body.runId;
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}

async function fetchMessage(
  url: string,
  projectId: string,
  conversationId: string,
  messageId: string,
): Promise<StoredMessage | null> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { messages?: StoredMessage[] };
  return body.messages?.find((message) => message.id === messageId) ?? null;
}
