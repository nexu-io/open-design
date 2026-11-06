// #6418 acceptance gate: the run creation must atomically claim the assistant
// message. Two concurrent runs sharing an assistantMessageId can never both
// claim it — exactly one succeeds, the other is rejected with RUN_IN_PROGRESS
// and its run is dropped (no child process spawned).

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

describe('run creation atomic assistant-message ownership (#6418)', () => {
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
  });

  async function startWithHangingClaude() {
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-atomic-bin-'));
    const bin = path.join(binDir, 'claude');
    const invocationPath = path.join(binDir, 'invocations.jsonl');
    await writeFile(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs');
const invocationPath = ${JSON.stringify(invocationPath)};
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
fs.appendFileSync(invocationPath, 'x\\n');
setInterval(() => {}, 1000);
`,
      'utf8',
    );
    await chmod(bin, 0o755);

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    const response = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: bin } },
        telemetry: { metrics: false, content: false, artifactManifest: false },
        privacyDecisionAt: Date.now(),
      }),
    });
    expect(response.status).toBe(200);
    return { url: started.url, invocationPath };
  }

  async function createProject(url: string) {
    const projectId = `atomic_${randomUUID()}`;
    const project = await fetch(`${url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Atomic smoke',
        metadata: { kind: 'prototype' },
        skipDiscoveryBrief: true,
      }),
    });
    expect(project.status).toBe(200);
    const body = (await project.json()) as { conversationId: string };
    return { projectId, conversationId: body.conversationId };
  }

  async function postRun(url: string, body: Record<string, unknown>) {
    return fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function fetchAssistantMessage(
    url: string,
    projectId: string,
    conversationId: string,
    messageId: string,
  ) {
    const response = await fetch(
      `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: Array<Record<string, unknown>> };
    return body.messages.find((m) => m.id === messageId);
  }

  async function listMessages(url: string, projectId: string, conversationId: string) {
    const response = await fetch(
      `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: Array<{ id: string; role: string }> };
    return body.messages;
  }

  async function waitForInvocation(invocationPath: string): Promise<string> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        const raw = await readFile(invocationPath, 'utf8');
        if (raw.trim()) return raw;
      } catch {
        // file not written yet — the daemon spawns the child asynchronously
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('winning run never spawned the agent CLI');
  }

  it('atomically lets only one of two concurrent runs claim the assistant message', async () => {
    const { url, invocationPath } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);

    const assistantMessageId = `assistant_concurrent_${randomUUID()}`;
    const base = {
      projectId,
      conversationId,
      assistantMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
    };
    const body1 = { ...base, clientRequestId: `c1_${randomUUID()}` };
    const body2 = { ...base, clientRequestId: `c2_${randomUUID()}` };

    const [r1, r2] = await Promise.all([
      postRun(url, body1),
      postRun(url, body2),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([202, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect((await loser.json())).toMatchObject({ error: { code: 'RUN_IN_PROGRESS' } });

    // Only the winning run spawned a child process.
    const raw = await waitForInvocation(invocationPath);
    expect(raw.trim().split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('a status-less stale snapshot cannot null the status or reopen a claim', async () => {
    // nettee 8/10 on #6418: a whole-message PUT that omits runStatus must not
    // null the daemon-owned status column (which would open the terminal gate),
    // and a premature terminal PUT against an active daemon run must be
    // discarded so the row cannot be re-claimed while the run is still writing.
    const { url } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);
    const assistantMessageId = `assistant_statusless_${randomUUID()}`;

    // run #1 claims the message (daemon keeps it active).
    const r1 = await postRun(url, {
      projectId,
      conversationId,
      assistantMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `s1_${randomUUID()}`,
    });
    expect(r1.status).toBe(202);

    // A stale whole-message PUT omits runStatus — must not null the column.
    const statusless = await fetch(
      `${url}/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: assistantMessageId, role: 'assistant', content: 'stale', events: [] }),
      },
    );
    expect(statusless.status).toBe(200);
    const afterStatusless = await fetchAssistantMessage(url, projectId, conversationId, assistantMessageId);
    expect(afterStatusless?.runStatus).toBeDefined();

    // A premature terminal PUT must be discarded (daemon still active).
    const premature = await fetch(
      `${url}/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: assistantMessageId, role: 'assistant', content: 'done', runStatus: 'succeeded', events: [] }),
      },
    );
    expect(premature.status).toBe(200);
    const afterPremature = await fetchAssistantMessage(url, projectId, conversationId, assistantMessageId);
    expect(afterPremature?.runStatus).not.toBe('succeeded');

    // A second run with the same assistantMessageId must still be rejected.
    const r2 = await postRun(url, {
      projectId,
      conversationId,
      assistantMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `s2_${randomUUID()}`,
    });
    expect(r2.status).toBe(409);
  });

  it('does not move a daemon-owned running message backward to queued', async () => {
    // nettee on #6418: onRunCreated(queued) and onRunStatus(running) can arrive
    // as separate whole-message PUTs. A delayed queued snapshot must not regress
    // a daemon-known row that is already running.
    const { url, invocationPath } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);
    const assistantMessageId = `assistant_status_order_${randomUUID()}`;

    const created = await postRun(url, {
      projectId,
      conversationId,
      assistantMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `order_${randomUUID()}`,
    });
    expect(created.status).toBe(202);
    await waitForInvocation(invocationPath);
    const claimed = await fetchAssistantMessage(url, projectId, conversationId, assistantMessageId);
    expect(claimed?.runId).toBeTypeOf('string');

    const runningPut = await fetch(
      `${url}/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: assistantMessageId,
          role: 'assistant',
          content: claimed?.content ?? '',
          runId: claimed?.runId,
          runStatus: 'running',
          events: claimed?.events ?? [],
        }),
      },
    );
    expect(runningPut.status).toBe(200);
    const running = await fetchAssistantMessage(url, projectId, conversationId, assistantMessageId);
    expect(running?.runStatus).toBe('running');

    const staleQueued = await fetch(
      `${url}/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: assistantMessageId,
          role: 'assistant',
          content: running?.content ?? '',
          runId: running?.runId,
          runStatus: 'queued',
          events: running?.events ?? [],
        }),
      },
    );
    expect(staleQueued.status).toBe(200);

    const after = await fetchAssistantMessage(url, projectId, conversationId, assistantMessageId);
    expect(after?.runStatus).toBe('running');
  });

  it('a rejected concurrent run leaves no orphan user turn', async () => {
    // nettee 8/10 on #6418: the claim must precede user-message seeding, so a
    // rejected (loser) concurrent run never leaves its user row behind.
    const { url } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);

    const assistantMessageId = `assistant_orphan_${randomUUID()}`;
    const body1 = {
      projectId,
      conversationId,
      assistantMessageId,
      userMessageId: `u1_${randomUUID()}`,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `o1_${randomUUID()}`,
    };
    const body2 = {
      ...body1,
      userMessageId: `u2_${randomUUID()}`,
      clientRequestId: `o2_${randomUUID()}`,
    };

    const [r1, r2] = await Promise.all([postRun(url, body1), postRun(url, body2)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([202, 409]);
    const winner = r1.status === 202 ? body1 : body2;
    const loser = r1.status === 409 ? body1 : body2;

    const messages = await listMessages(url, projectId, conversationId);
    const userMessageIds = messages.filter((m) => m.role === 'user').map((m) => m.id);
    expect(userMessageIds).toContain(winner.userMessageId);
    expect(userMessageIds).not.toContain(loser.userMessageId);
  });

  it('rejects equal user and assistant message ids before claiming the run', async () => {
    // PerishCode on #6418: a malformed API/MCP request must not let the
    // fresh-claim ordering path seed a user row and then overwrite it with the
    // assistant row under the same primary key.
    const { url, invocationPath } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);
    const sharedMessageId = `shared_${randomUUID()}`;

    const response = await postRun(url, {
      projectId,
      conversationId,
      userMessageId: sharedMessageId,
      assistantMessageId: sharedMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `same_${randomUUID()}`,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'userMessageId and assistantMessageId must be distinct',
      },
    });

    const messages = await listMessages(url, projectId, conversationId);
    expect(messages).toEqual([]);
    await expect(readFile(invocationPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an existing non-user userMessageId before seeding', async () => {
    // nettee on #6418: seedRunUserMessage upserts by id. If a malformed
    // API/MCP request points userMessageId at an existing assistant row, the
    // seed would otherwise convert and overwrite that assistant transcript
    // before the fresh assistant row is inserted.
    const { url, invocationPath } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);
    const existingAssistantId = `assistant_as_user_${randomUUID()}`;
    const newAssistantId = `assistant_fresh_${randomUUID()}`;

    const seed = await fetch(
      `${url}/api/projects/${projectId}/conversations/${conversationId}/messages/${existingAssistantId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: existingAssistantId,
          role: 'assistant',
          content: 'old assistant transcript',
          runId: 'old-run',
          runStatus: 'succeeded',
          events: [{ kind: 'text', text: 'old assistant transcript' }],
        }),
      },
    );
    expect(seed.status).toBe(200);

    const response = await postRun(url, {
      projectId,
      conversationId,
      userMessageId: existingAssistantId,
      assistantMessageId: newAssistantId,
      agentId: 'claude',
      message: 'new prompt',
      currentPrompt: 'new prompt',
      clientRequestId: `role_${randomUUID()}`,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_USER_MESSAGE' },
    });

    const oldMessage = await fetchAssistantMessage(
      url,
      projectId,
      conversationId,
      existingAssistantId,
    );
    expect(oldMessage).toMatchObject({
      role: 'assistant',
      content: 'old assistant transcript',
      runId: 'old-run',
      runStatus: 'succeeded',
    });
    expect(await fetchAssistantMessage(url, projectId, conversationId, newAssistantId))
      .toBeUndefined();
    await expect(readFile(invocationPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps a web-persisted placeholder startedAt through the first claim', async () => {
    const { url } = await startWithHangingClaude();
    const { projectId, conversationId } = await createProject(url);

    const assistantMessageId = `assistant_placeholder_${randomUUID()}`;
    const startedAt = Date.now();

    // Web persists a runId-less assistant placeholder with its own startedAt.
    const seed = await fetch(
      `${url}/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          runStatus: 'running',
          startedAt,
        }),
      },
    );
    expect(seed.status).toBe(200);

    // First run claims the placeholder (202); its startedAt survives.
    const r1 = await postRun(url, {
      projectId,
      conversationId,
      assistantMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `p1_${randomUUID()}`,
    });
    expect(r1.status).toBe(202);

    const msg = await fetchAssistantMessage(url, projectId, conversationId, assistantMessageId);
    expect(msg?.startedAt).toBe(startedAt);

    // A second concurrent run with the same assistantMessageId is rejected.
    const r2 = await postRun(url, {
      projectId,
      conversationId,
      assistantMessageId,
      agentId: 'claude',
      message: 'M',
      currentPrompt: 'M',
      clientRequestId: `p2_${randomUUID()}`,
    });
    expect(r2.status).toBe(409);
    expect((await r2.json())).toMatchObject({ error: { code: 'RUN_IN_PROGRESS' } });
  });
});
