import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Full-server end-to-end coverage for manual API-mode context compaction
// (#5991): a real daemon with the real `startChatRun` drives a fake `agy`
// on PATH, so the summary round exercises the production chain — chat runs
// that create the antigravity agent session, the compact POST, the summary
// round through the antigravity runtime def, text extraction, checkpoint
// persistence, and the GET read surface — without touching Google.

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
};

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function writeFakeAgy(dir: string, logPath: string): Promise<void> {
  const script = path.join(HERE, 'fixtures', 'fake-agy.mjs');
  const bin = path.join(dir, 'agy');
  const lines = [
    '#!/bin/sh',
    `export FAKE_AGY_INVOCATION_LOG=${JSON.stringify(logPath)}`,
    `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"`,
    '',
  ];
  await writeFile(bin, lines.join('\n'), 'utf8');
  await chmod(bin, 0o755);
}

async function readPromptLog(logPath: string): Promise<string[]> {
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
    .map((line) => (JSON.parse(line) as { prompt: string }).prompt);
}

function parseSseText(text: string): Array<{ event: string; data: any }> {
  const frames = text.split('\n\n').filter(Boolean);
  return frames.map((frame) => {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    return { event, data: data ? JSON.parse(data) : undefined };
  });
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createConversation(url: string): Promise<{
  projectId: string;
  conversationId: string;
  headers: Record<string, string>;
}> {
  const projectId = `compact_e2e_${randomUUID()}`;
  const workspaceId = `compact_e2e_personal_${projectId}`;
  const workspaceMemberId = `compact_e2e_owner_${projectId}`;
  const headers = {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': workspaceMemberId,
    'x-od-workspace-role': 'owner',
  };
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      id: projectId,
      name: 'Compact e2e smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string; id: string };
  return { projectId, conversationId: projectBody.conversationId, headers };
}

async function sendRunAndWait(
  url: string,
  identity: { projectId: string; conversationId: string; headers: Record<string, string> },
  message: string,
): Promise<RunStatus> {
  const userMessageId = `user_compact_${randomUUID()}`;
  // Web writes the user row first, then references it from the run create
  // body; the compact span renders the transcript from both row kinds.
  const userPut = await fetch(
    `${url}/api/projects/${identity.projectId}/conversations/${identity.conversationId}/messages/${userMessageId}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...identity.headers },
      body: JSON.stringify({ id: userMessageId, role: 'user', content: message }),
    },
  );
  expect(userPut.status).toBe(200);
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'compact-e2e-test',
      'x-od-analytics-session-id': 'compact-e2e-session',
      'x-od-analytics-client-type': 'web',
      ...identity.headers,
    },
    body: JSON.stringify({
      projectId: identity.projectId,
      conversationId: identity.conversationId,
      assistantMessageId: `assistant_compact_${randomUUID()}`,
      userMessageId,
      clientRequestId: `client_compact_${randomUUID()}`,
      agentId: 'antigravity',
      message,
      currentPrompt: message,
    }),
  });
  const body = (await runResponse.json()) as {
    runId?: string;
    error?: { code?: string; message?: string };
  };
  expect(runResponse.status, JSON.stringify(body)).toBe(202);
  expect(body.runId).toBeTypeOf('string');
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId!)}`, {
      headers: identity.headers,
    });
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}

describe('manual API-mode compaction — full server + fake agy (#5991)', () => {
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;
  let started: StartedServer | null = null;
  let tempDir: string | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    binDir = null;
    if (tempDir) await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    tempDir = null;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  });

  it('summarizes the transcript through agy and persists a durable checkpoint', { timeout: 60_000 }, async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-compact-e2e-'));
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-compact-e2e-bin-'));
    const logPath = path.join(tempDir, 'agy-prompts.jsonl');
    await writeFakeAgy(binDir, logPath);
    // Isolate agy resolution + any agent home writes (~/.gemini) from the
    // developer machine.
    process.env.PATH = `${binDir}:${originalPath ?? ''}`;
    process.env.HOME = tempDir;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'antigravity',
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const identity = await createConversation(started.url);
    const turn1 = await sendRunAndWait(started.url, identity, 'build the page');
    expect(turn1.status).toBe('succeeded');
    const turn2 = await sendRunAndWait(started.url, identity, 'make it dark');
    expect(turn2.status).toBe('succeeded');

    // The summary round must not leak an assistant message into the chat.
    const messagesBefore = await fetch(
      `${started.url}/api/projects/${identity.projectId}/conversations/${identity.conversationId}/messages`,
      { headers: identity.headers },
    );
    expect(messagesBefore.status).toBe(200);
    const before = (await messagesBefore.json()) as { messages: unknown[] };
    expect(before.messages.length).toBeGreaterThan(0);

    const compactResponse = await fetch(
      `${started.url}/api/projects/${identity.projectId}/conversations/${identity.conversationId}/compact`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...identity.headers,
        },
        body: '{}',
      },
    );
    expect(compactResponse.status).toBe(200);
    const frames = parseSseText(await compactResponse.text());
    expect(frames.map((f) => f.event)).toEqual(['progress', 'compaction']);
    const compaction = frames[frames.length - 1]!.data.compaction as {
      conversationId: string;
      cutAtMessageId: string;
      summaryText: string;
      ledger: unknown[];
    };
    expect(compaction.conversationId).toBe(identity.conversationId);
    expect(compaction.cutAtMessageId).toBeTypeOf('string');
    expect(compaction.summaryText).toContain('Everything is done.');
    expect(compaction.ledger).toEqual([]);

    // GET read surface returns the same durable checkpoint.
    const getResponse = await fetch(
      `${started.url}/api/projects/${identity.projectId}/conversations/${identity.conversationId}/compaction`,
      { headers: identity.headers },
    );
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as {
      compaction: { summaryText: string };
    };
    expect(getBody.compaction.summaryText).toContain('Everything is done.');

    // The summary round really went through the agent runtime: the fake agy
    // saw a prompt containing the full transcript plus the summary prompt
    // scaffolding, and it must NOT appear as a new chat message afterwards.
    const prompts = await readPromptLog(logPath);
    const summaryPrompt = prompts[prompts.length - 1]!;
    expect(summaryPrompt).toContain('## Full conversation transcript');
    expect(summaryPrompt).toContain('build the page');
    expect(summaryPrompt).toContain('make it dark');

    const messagesAfter = await fetch(
      `${started.url}/api/projects/${identity.projectId}/conversations/${identity.conversationId}/messages`,
      { headers: identity.headers },
    );
    const after = (await messagesAfter.json()) as { messages: unknown[] };
    // The summary round must not leak a message into the conversation.
    expect(after.messages).toHaveLength(before.messages.length);
  });
});
