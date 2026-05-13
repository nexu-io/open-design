import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  memoryDir,
  readMemoryEntry,
  readMemoryIndex,
} from '../src/memory.js';
import {
  __resetExtractionsForTests,
  recordHeuristic,
} from '../src/memory-extractions.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

const dataDir = process.env.OD_DATA_DIR as string;

let baseUrl: string;
let server: http.Server;

async function closeServer(nextServer: http.Server | undefined): Promise<void> {
  if (!nextServer) return;
  await new Promise<void>((resolve) => nextServer.close(() => resolve()));
}

beforeAll(async () => {
  const started = (await startServer({
    port: 0,
    returnServer: true,
  })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => closeServer(server));

beforeEach(async () => {
  await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
  __resetExtractionsForTests();
});

describe('memory routes', () => {
  it('lists the default memory state when the store is empty', async () => {
    const res = await fetch(`${baseUrl}/api/memory`);
    expect(res.status).toBe(200);

    const json = await res.json() as {
      enabled: boolean;
      rootDir: string;
      index: string;
      entries: unknown[];
      extraction: unknown;
    };
    expect(json.enabled).toBe(true);
    expect(json.rootDir).toBe(memoryDir(dataDir));
    expect(json.index).toContain('# Memory');
    expect(json.entries).toEqual([]);
    expect(json.extraction).toBeNull();
  });

  it('creates, reads, updates, and deletes a memory entry', async () => {
    const createRes = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'UI preferences',
        description: 'Persistent rendering preferences',
        type: 'user',
        body: '- Prefer dark mode\n- Prefer generous spacing',
      }),
    });
    expect(createRes.status).toBe(200);
    const created = await createRes.json() as {
      entry: {
        id: string;
        name: string;
        description: string;
        type: string;
        body: string;
      };
    };
    expect(created.entry.id).toBe('user_ui_preferences');

    const getRes = await fetch(`${baseUrl}/api/memory/${created.entry.id}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json() as { entry: { body: string } };
    expect(fetched.entry.body).toContain('Prefer dark mode');

    const updateRes = await fetch(`${baseUrl}/api/memory/${created.entry.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'UI preferences',
        description: 'Updated preference',
        type: 'user',
        body: '- Prefer spacious layouts',
      }),
    });
    expect(updateRes.status).toBe(200);

    const stored = await readMemoryEntry(dataDir, created.entry.id);
    expect(stored?.description).toBe('Updated preference');
    expect(stored?.body).toContain('Prefer spacious layouts');

    const deleteRes = await fetch(`${baseUrl}/api/memory/${created.entry.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    const listRes = await fetch(`${baseUrl}/api/memory`);
    const listJson = await listRes.json() as { entries: unknown[] };
    expect(listJson.entries).toEqual([]);
  });

  it('saves the memory index and returns it from the list payload', async () => {
    const nextIndex = '# Memory\n\n- user_ui_preferences.md\n';
    const putRes = await fetch(`${baseUrl}/api/memory/index`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: nextIndex }),
    });
    expect(putRes.status).toBe(200);

    expect(await readMemoryIndex(dataDir)).toBe(nextIndex);

    const listRes = await fetch(`${baseUrl}/api/memory`);
    const listJson = await listRes.json() as { index: string };
    expect(listJson.index).toBe(nextIndex);
  });

  it('lists extraction history and supports deleting one row', async () => {
    const firstId = recordHeuristic({
      userMessage: 'Remember I prefer dark mode',
      writtenCount: 1,
      writtenIds: ['user_ui_preferences'],
    });
    recordHeuristic({
      userMessage: 'No durable memory in this turn',
      writtenCount: 0,
      writtenIds: [],
    });

    const listRes = await fetch(`${baseUrl}/api/memory/extractions`);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as {
      extractions: Array<{ id: string; phase: string; userMessagePreview: string }>;
    };
    expect(listJson.extractions).toHaveLength(2);
    expect(listJson.extractions[0]?.userMessagePreview).toContain('No durable memory');

    const deleteRes = await fetch(`${baseUrl}/api/memory/extractions/${firstId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json() as { removed: number };
    expect(deleteJson.removed).toBe(1);

    const afterRes = await fetch(`${baseUrl}/api/memory/extractions`);
    const afterJson = await afterRes.json() as {
      extractions: Array<{ id: string }>;
    };
    expect(afterJson.extractions).toHaveLength(1);
    expect(afterJson.extractions[0]?.id).not.toBe(firstId);
  });

  it('clears the extraction history buffer', async () => {
    recordHeuristic({
      userMessage: 'Remember I prefer dark mode',
      writtenCount: 1,
      writtenIds: ['user_ui_preferences'],
    });
    recordHeuristic({
      userMessage: 'Remember I like weekly summaries',
      writtenCount: 1,
      writtenIds: ['user_weekly_summaries'],
    });

    const clearRes = await fetch(`${baseUrl}/api/memory/extractions`, {
      method: 'DELETE',
    });
    expect(clearRes.status).toBe(200);
    const clearJson = await clearRes.json() as { removed: number };
    expect(clearJson.removed).toBe(2);

    const listRes = await fetch(`${baseUrl}/api/memory/extractions`);
    const listJson = await listRes.json() as { extractions: unknown[] };
    expect(listJson.extractions).toEqual([]);
  });

  it('extracts heuristic memories from a user message and reports the changed entries', async () => {
    const res = await fetch(`${baseUrl}/api/memory/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Remember: prefer dark mode for UI examples.',
      }),
    });
    expect(res.status).toBe(200);

    const json = await res.json() as {
      changed: Array<{ id: string; name: string; type: string }>;
      attemptedLLM: boolean;
    };
    expect(json.attemptedLLM).toBe(false);
    expect(json.changed).toHaveLength(1);
    expect(json.changed[0]).toMatchObject({
      id: 'feedback_prefer_dark_mode_for_ui_examples',
      name: 'Remembered note',
      type: 'feedback',
    });

    const listRes = await fetch(`${baseUrl}/api/memory`);
    const listJson = await listRes.json() as {
      entries: Array<{ id: string; name: string }>;
    };
    expect(listJson.entries).toEqual([
      expect.objectContaining({
        id: 'feedback_prefer_dark_mode_for_ui_examples',
        name: 'Remembered note',
      }),
    ]);
  });

  it('returns the composed system prompt body from indexed memory entries', async () => {
    await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'User role',
        description: 'User is a product designer',
        type: 'user',
        body: '- Role / identity: product designer',
      }),
    });
    await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Project goal',
        description: 'Ship a cleaner onboarding flow',
        type: 'project',
        body: '- Goal: ship a cleaner onboarding flow',
      }),
    });

    const res = await fetch(`${baseUrl}/api/memory/system-prompt`);
    expect(res.status).toBe(200);
    const json = await res.json() as { body: string };
    expect(json.body).toContain('### User');
    expect(json.body).toContain('**User role** — User is a product designer');
    expect(json.body).toContain('### Project');
    expect(json.body).toContain('**Project goal** — Ship a cleaner onboarding flow');
  });
});
