import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetExtractionsForTests, listExtractions } from '../src/memory-extractions.js';
import { extractWithLLM } from '../src/memory-llm.js';
import { memoryDir, writeMemoryConfig } from '../src/memory.js';

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OD_OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'OD_MINIMAX_API_KEY',
  'MINIMAX_API_KEY',
  'OD_AIHUBMIX_API_KEY',
  'AIHUBMIX_API_KEY',
  'OD_SENSEAUDIO_API_KEY',
  'SENSEAUDIO_API_KEY',
  'OD_MEDIA_CONFIG_DIR',
] as const;

describe('memory extraction media-provider fallback', () => {
  let root: string;
  let dataDir: string;
  let projectRoot: string;
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-memory-media-provider-'));
    dataDir = path.join(root, 'data');
    projectRoot = path.join(root, 'project');
    await mkdir(projectRoot, { recursive: true });
    await rm(memoryDir(dataDir), { recursive: true, force: true });
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: true });
    __resetExtractionsForTests();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.OD_MEDIA_CONFIG_DIR = path.join(projectRoot, '.od');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
    await rm(root, { recursive: true, force: true });
  });

  async function writeMediaConfig(config: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(config), 'utf8');
  }

  it('uses a saved MiniMax media key for LLM memory extraction', async () => {
    await writeMediaConfig({
      providers: {
        minimax: {
          apiKey: 'minimax-test-key',
          baseUrl: 'https://api.minimaxi.chat/v1',
          model: 'minimax-image-01',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.minimax.io/v1/chat/completions');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer minimax-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('MiniMax-M2.7-highspeed');
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entries: [
                  {
                    type: 'feedback',
                    name: 'Dark demos',
                    description: 'Prefers dark demos',
                    body: 'The user prefers dark UI demos.',
                  },
                ],
              }),
            },
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await extractWithLLM(
      dataDir,
      { userMessage: 'I prefer dark UI demos.', assistantMessage: 'Noted.' },
      { projectRoot, chatAgentId: null },
    );

    expect(suggestions).toEqual([
      expect.objectContaining({
        type: 'feedback',
        name: 'Dark demos',
      }),
    ]);
    expect(listExtractions()[0]).toMatchObject({
      phase: 'success',
      provider: {
        kind: 'openai',
        model: 'MiniMax-M2.7-highspeed',
        credentialSource: 'media-config',
      },
    });
  });

  it('reports unsupported saved media providers instead of missing credentials', async () => {
    await writeMediaConfig({
      providers: {
        elevenlabs: {
          apiKey: 'elevenlabs-test-key',
        },
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await extractWithLLM(
      dataDir,
      { userMessage: 'Remember that I prefer quiet transitions.' },
      { projectRoot, chatAgentId: null },
    );

    expect(suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listExtractions()[0]).toMatchObject({
      phase: 'skipped',
      reason: 'unsupported-provider',
    });
  });

  it('does not blame unsupported media providers when a text-capable media key is also saved', async () => {
    await writeMediaConfig({
      providers: {
        minimax: {
          apiKey: 'minimax-test-key',
        },
        elevenlabs: {
          apiKey: 'elevenlabs-test-key',
        },
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await extractWithLLM(
      dataDir,
      { userMessage: 'Remember that I prefer quiet transitions.' },
      // Gemini constrains extraction to Google; the saved MiniMax key is
      // text-capable, but not usable for this chat-protocol family.
      { projectRoot, chatAgentId: 'gemini' },
    );

    expect(suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listExtractions()[0]).toMatchObject({
      phase: 'skipped',
      reason: 'no-provider',
    });
  });
});
