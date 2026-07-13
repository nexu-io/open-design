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

  it('clears the extraction override when the patch sends extraction: null', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-stored-secret',
        baseUrl: 'https://api.openai.com',
      },
    });

    const res = await patchConfig({
      extraction: null,
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction).toBeNull();
  });

  it('preserves the stored azure apiVersion when the patch omits the field', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'azure',
        model: 'gpt-4.1-mini',
        apiKey: 'azure-secret',
        baseUrl: 'https://example.openai.azure.com',
        apiVersion: '2025-01-01-preview',
      },
    });

    const res = await patchConfig({
      extraction: {
        provider: 'azure',
        model: 'gpt-4.1-mini',
        baseUrl: 'https://example.openai.azure.com',
      },
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction?.provider).toBe('azure');
    expect(extraction?.apiVersion).toBe('2025-01-01-preview');
  });

  it('clears the stored azure apiVersion when the patch sends an explicit empty string', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'azure',
        model: 'gpt-4.1-mini',
        apiKey: 'azure-secret',
        baseUrl: 'https://example.openai.azure.com',
        apiVersion: '2025-01-01-preview',
      },
    });

    const res = await patchConfig({
      extraction: {
        provider: 'azure',
        model: 'gpt-4.1-mini',
        baseUrl: 'https://example.openai.azure.com',
        apiVersion: '',
      },
    });
    expect(res.status).toBe(200);

    const extraction = await readStoredExtraction();
    expect(extraction?.provider).toBe('azure');
    expect(extraction?.apiVersion ?? '').toBe('');
  });

  it('updates the enabled flag independently of extraction settings', async () => {
    await writeMemoryConfig(dataDir, {
      enabled: true,
      extraction: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-stored-secret',
        baseUrl: 'https://api.openai.com',
      },
    });

    const res = await patchConfig({ enabled: false });
    expect(res.status).toBe(200);

    const json = await res.json() as {
      enabled: boolean;
      extraction: { provider: string; apiKeyConfigured: boolean } | null;
    };
    expect(json.enabled).toBe(false);
    expect(json.extraction).toMatchObject({
      provider: 'openai',
      apiKeyConfigured: true,
    });

    const extraction = await readStoredExtraction();
    expect(extraction?.provider).toBe('openai');
  });

  it('returns a masked extraction config without leaking the apiKey on GET /api/memory', async () => {
    await writeMemoryConfig(dataDir, {
      extraction: {
        provider: 'azure',
        model: 'gpt-4.1-mini',
        apiKey: 'azure-secret-1234',
        baseUrl: 'https://example.openai.azure.com',
        apiVersion: '2025-01-01-preview',
      },
    });

    const res = await fetch(`${baseUrl}/api/memory`);
    expect(res.status).toBe(200);

    const json = await res.json() as {
      extraction: {
        provider: string;
        model: string;
        baseUrl: string;
        apiVersion: string;
        apiKeyTail: string;
        apiKeyConfigured: boolean;
        apiKey?: string;
      } | null;
    };
    expect(json.extraction).toMatchObject({
      provider: 'azure',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://example.openai.azure.com',
      apiVersion: '2025-01-01-preview',
      apiKeyTail: '1234',
      apiKeyConfigured: true,
    });
    expect(json.extraction && 'apiKey' in json.extraction).toBe(false);
  });
});
