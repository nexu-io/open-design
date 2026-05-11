// Coverage for PATCH /api/memory/config apiKey three-state handling.
//
// MemoryModelInline now silently re-PATCHes whenever the surrounding BYOK
// chat creds drift, so the route must distinguish:
//   - apiKey field absent     → preserve the stored secret (settings re-save
//                                without re-typing the key)
//   - apiKey === ''           → CLEAR the stored secret (the user removed
//                                their chat key; we must not keep calling
//                                the provider with the stale credential)
//   - apiKey === 'sk-…'       → replace with the new key

import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  memoryDir,
  readMemoryConfig,
  writeMemoryConfig,
} from '../src/memory.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

let baseUrl: string;
let server: http.Server;
const dataDir = process.env.OD_DATA_DIR as string;

async function patchConfig(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/memory/config`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readStoredExtraction(): Promise<Record<string, unknown> | null> {
  const stored = (await readMemoryConfig(dataDir)) as {
    extraction: Record<string, unknown> | null;
  };
  return stored.extraction;
}

beforeAll(async () => {
  const started = (await startServer({
    port: 0,
    returnServer: true,
  })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(async () => {
  await fsp.rm(path.join(memoryDir(dataDir), 'config.json'), { force: true });
});

describe('PATCH /api/memory/config apiKey three-state handling', () => {
  it('preserves stored apiKey when the patch omits the field entirely', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-stored-secret',
        baseUrl: 'https://api.openai.com',
      },
    });

    const res = await patchConfig({
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com',
      },
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction?.apiKey).toBe('sk-stored-secret');
  });

  it('clears the stored apiKey when the patch sends an explicit empty string', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-stored-secret',
        baseUrl: 'https://api.openai.com',
      },
    });

    const res = await patchConfig({
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com',
        apiKey: '',
      },
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction?.apiKey ?? '').toBe('');
  });

  it('replaces the stored apiKey when the patch sends a new value', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-old-secret',
        baseUrl: 'https://api.openai.com',
      },
    });

    const res = await patchConfig({
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-new-secret',
      },
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction?.apiKey).toBe('sk-new-secret');
  });

  it('does not reuse the stored apiKey when the provider changes', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-openai-secret',
        baseUrl: 'https://api.openai.com',
      },
    });

    const res = await patchConfig({
      extraction: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        baseUrl: 'https://api.anthropic.com',
      },
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction?.provider).toBe('anthropic');
    expect(extraction?.apiKey ?? '').toBe('');
  });
});
