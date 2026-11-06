import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// OPEND-3334: the Home send routes to the new project's conversation before
// POST /api/projects answers, so the Web mints the seed conversation id too.
// The daemon uses a well-formed caller id, rejects a malformed one before
// writing anything, and still mints its own when none is sent.
describe('POST /api/projects seed conversation id', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function create(body: Record<string, unknown>) {
    const id = `client-conversation-id-${randomUUID()}`;
    projectsToClean.push(id);
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'client conversation id', ...body }),
    });
    return { id, resp };
  }

  async function conversationIds(projectId: string): Promise<string[]> {
    const resp = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/conversations`);
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { conversations: Array<{ id: string }> };
    return json.conversations.map((conversation) => conversation.id);
  }

  it('seeds the conversation with the caller-minted id', async () => {
    const conversationId = randomUUID();
    const { id, resp } = await create({ conversationId });
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { conversationId: string };
    expect(json.conversationId).toBe(conversationId);
    expect(await conversationIds(id)).toEqual([conversationId]);
  });

  it('mints the id when the caller sends none', async () => {
    const { id, resp } = await create({});
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { conversationId: string };
    expect(typeof json.conversationId).toBe('string');
    expect(json.conversationId.length).toBeGreaterThan(0);
    expect(await conversationIds(id)).toEqual([json.conversationId]);
  });

  it('rejects a malformed caller id without creating the project', async () => {
    const { id, resp } = await create({ conversationId: '../escape' });
    expect(resp.status).toBe(400);
    const lookup = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(id)}`);
    expect(lookup.status).toBe(404);
  });
});
