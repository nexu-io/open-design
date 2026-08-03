// Regression: a run must not attach to a conversation owned by a DIFFERENT
// project. POST /api/runs reads `projectId` and `conversationId` independently
// from the request body. The run's cwd is derived from `projectId`, but every
// persistence key — the pinned assistant/user message rows, the native
// agent_sessions row, and the resume lookup — is keyed on `conversationId`.
// routes/runs.ts fetches `getConversation(db, conversationId)` only to read
// `sessionMode`; it never checks that the conversation belongs to `projectId`.
//
// Sibling routes DO enforce this invariant: routes/handoff.ts rejects with 404
// when `conversation.projectId !== req.params.id`, and routes/terminal.ts does
// the same for terminals. The chat/run hot path is the one that skips it.
//
// Consequence (cross-project data mixup): a run submitted as
//   { projectId: A, conversationId: <a conversation owned by B> }
// runs with cwd = project A's folder but writes its messages into project B's
// conversation (pinAssistantMessageOnRunCreate → messages.conversation_id = B),
// and overwrites B's agent_sessions.cwd with A's folder — corrupting B's chat
// history and B's resume identity.
//
// Invariant: a run for project A must never write into a conversation owned by
// a different project. The mismatched request must be rejected, and no message
// row for it may appear under the foreign conversation.

import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

describe('run cross-project conversation ownership', () => {
  let started: StartedServer | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
  });

  it('a run for project A must not write into a conversation owned by project B', async () => {
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    const url = started.url;

    const projectA = `xproj_a_${randomUUID()}`;
    const projectB = `xproj_b_${randomUUID()}`;
    await createProject(url, projectA, 'Cross-project A');
    await createProject(url, projectB, 'Cross-project B');

    const convA = await firstConversationId(url, projectA);
    const convB = await firstConversationId(url, projectB);
    expect(convA).toBeTruthy();
    expect(convB).toBeTruthy();
    expect(convB).not.toBe(convA);

    // Submit a run for project A but point it at project B's conversation.
    const assistantMessageId = `assistant_xproj_${randomUUID()}`;
    const runResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: projectA,
        conversationId: convB,
        assistantMessageId,
        clientRequestId: `client_xproj_${randomUUID()}`,
        agentId: 'claude',
        message: 'CROSS_PROJECT_MARKER',
        currentPrompt: 'CROSS_PROJECT_MARKER',
      }),
    });

    // The damage is written synchronously at run-create (pinAssistantMessage
    // OnRunCreate) regardless of whether the agent spawns, so inspect the DB
    // directly. app.sqlite lives under the isolated test OD_DATA_DIR.
    const dataDir = process.env.OD_DATA_DIR;
    expect(dataDir).toBeTruthy();
    const db = new Database(join(dataDir!, 'app.sqlite'), { readonly: true });
    let landedConversationId: string | null = null;
    try {
      const row = db
        .prepare('SELECT conversation_id FROM messages WHERE id = ?')
        .get(assistantMessageId) as { conversation_id?: string } | undefined;
      landedConversationId = row?.conversation_id ?? null;
    } finally {
      db.close();
    }

    // INVARIANT: the run belongs to project A. Its message must never land in
    // project B's conversation. On main the ownership check is missing, so the
    // request is accepted (202) and the row lands under convB — a cross-project
    // history/session corruption.
    expect(landedConversationId).not.toBe(convB);
    expect(runResponse.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /api/chat is guarded too: a chat run for project A must not write into project B', async () => {
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    const url = started.url;

    const projectA = `xchat_a_${randomUUID()}`;
    const projectB = `xchat_b_${randomUUID()}`;
    await createProject(url, projectA, 'Cross-project chat A');
    await createProject(url, projectB, 'Cross-project chat B');

    const convB = await firstConversationId(url, projectB);
    expect(convB).toBeTruthy();

    const assistantMessageId = `assistant_xchat_${randomUUID()}`;
    const chatResponse = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: projectA,
        conversationId: convB,
        assistantMessageId,
        clientRequestId: `client_xchat_${randomUUID()}`,
        agentId: 'claude',
        message: 'CROSS_PROJECT_MARKER',
        currentPrompt: 'CROSS_PROJECT_MARKER',
      }),
    });

    // The guard returns 404 before streaming/run creation, so this resolves
    // promptly (the SSE stream is never opened for a rejected pairing).
    expect(chatResponse.status).toBeGreaterThanOrEqual(400);

    const dataDir = process.env.OD_DATA_DIR;
    expect(dataDir).toBeTruthy();
    const db = new Database(join(dataDir!, 'app.sqlite'), { readonly: true });
    let landedConversationId: string | null = null;
    try {
      const row = db
        .prepare('SELECT conversation_id FROM messages WHERE id = ?')
        .get(assistantMessageId) as { conversation_id?: string } | undefined;
      landedConversationId = row?.conversation_id ?? null;
    } finally {
      db.close();
    }
    expect(landedConversationId).not.toBe(convB);
  });
});

async function createProject(url: string, id: string, name: string): Promise<void> {
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, name, metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }),
  });
  expect(response.status).toBe(200);
}

async function firstConversationId(url: string, projectId: string): Promise<string> {
  const response = await fetch(`${url}/api/projects/${encodeURIComponent(projectId)}/conversations`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversations: Array<{ id: string }> };
  const id = body.conversations[0]?.id;
  expect(id).toBeTruthy();
  return id!;
}
