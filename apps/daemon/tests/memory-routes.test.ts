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
const originalFetch = globalThis.fetch;

interface SseEvent {
  event: string;
  data: unknown;
}

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
  globalThis.fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (url.startsWith(baseUrl)) return originalFetch(input, init);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '[]' } }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await closeServer(server);
});

beforeEach(async () => {
  await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
  __resetExtractionsForTests();
});

async function readNextSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: InstanceType<typeof TextDecoder>,
  state: { buffer: string },
): Promise<SseEvent> {
  while (true) {
    const boundaryIndex = state.buffer.indexOf('\n\n');
    if (boundaryIndex !== -1) {
      const rawEvent = state.buffer.slice(0, boundaryIndex);
      state.buffer = state.buffer.slice(boundaryIndex + 2);
      const eventLine = rawEvent
        .split('\n')
        .find((line) => line.startsWith('event: '));
      const dataLine = rawEvent
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (!eventLine || !dataLine) continue;
      return {
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)),
      };
    }

    const chunk = await reader.read();
    if (chunk.done) {
      throw new Error('memory SSE stream ended before the next event arrived');
    }
    state.buffer += decoder.decode(chunk.value, { stream: true });
  }
}

async function readSseEventByType(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: InstanceType<typeof TextDecoder>,
  state: { buffer: string },
  eventType: string,
): Promise<SseEvent> {
  while (true) {
    const event = await readNextSseEvent(reader, decoder, state);
    if (event.event === eventType) return event;
  }
}

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

  it('rejects invalid memory entry payloads during creation', async () => {
    const res = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '',
        description: 'Missing required values',
        type: 'unknown',
        body: '- Invalid entry',
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toContain('memory entry requires');
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

  it('reports attemptedLLM for post-turn extraction requests without triggering a real provider call', async () => {
    const res = await fetch(`${baseUrl}/api/memory/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Remember that I prefer dark mode for demos.',
        assistantMessage: 'I will keep future demos darker and quieter.',
        chatProvider: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-5-mini',
        },
      }),
    });
    expect(res.status).toBe(200);

    const json = await res.json() as {
      changed: Array<unknown>;
      attemptedLLM: boolean;
    };
    expect(json.attemptedLLM).toBe(true);
    expect(json.changed).toEqual([]);
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

  it('streams memory change events over SSE when entries are created', async () => {
    const response = await fetch(`${baseUrl}/api/memory/events`);
    expect(response.status).toBe(200);
    expect(response.body).toBeTruthy();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: '' };

    try {
      const connected = await readNextSseEvent(reader, decoder, state);
      expect(connected.event).toBe('connected');

      const createRes = await fetch(`${baseUrl}/api/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Shipping priority',
          description: 'Protect onboarding polish in examples',
          type: 'project',
          body: '- Keep onboarding examples polished',
        }),
      });
      expect(createRes.status).toBe(200);

      const change = await readSseEventByType(reader, decoder, state, 'change');
      expect(change.event).toBe('change');
      expect(change.data).toMatchObject({
        kind: 'upsert',
        id: 'project_shipping_priority',
        name: 'Shipping priority',
        description: 'Protect onboarding polish in examples',
        type: 'project',
        source: 'manual',
      });
    } finally {
      await reader.cancel();
    }
  });

  it('streams extraction events over SSE when the extraction buffer changes', async () => {
    const response = await fetch(`${baseUrl}/api/memory/events`);
    expect(response.status).toBe(200);
    expect(response.body).toBeTruthy();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: '' };

    try {
      const connected = await readNextSseEvent(reader, decoder, state);
      expect(connected.event).toBe('connected');

      recordHeuristic({
        userMessage: 'Remember that I prefer editorial chart labels.',
        writtenCount: 1,
        writtenIds: ['feedback_editorial_chart_labels'],
      });

      const extraction = await readNextSseEvent(reader, decoder, state);
      expect(extraction.event).toBe('extraction');
      expect(extraction.data).toMatchObject({
        kind: 'heuristic',
        phase: 'success',
        writtenCount: 1,
        writtenIds: ['feedback_editorial_chart_labels'],
      });
    } finally {
      await reader.cancel();
    }
  });

  it('returns 404 when reading a missing memory entry', async () => {
    const res = await fetch(`${baseUrl}/api/memory/user_missing_note`);

    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('memory not found');
  });
});
