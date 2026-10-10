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
  'OD_MEDIA_CONFIG_DIR',
  'OD_MEMORY_MODEL',
] as const;

const BEDROCK_BASE_URL = 'https://bedrock-runtime.us-east-1.amazonaws.com';

// The BYOK "Same as chat" memory pass has no Bedrock client: the extractor
// speaks Anthropic / OpenAI-compatible HTTP with a plain API key, while a
// Bedrock chat authenticates with a bearer token or an AWS profile and
// picks its endpoint per model family. Until that exists, a Bedrock chat
// must skip extraction outright. It must never fall through to the env or
// media-config credentials of another vendor, which would send the
// conversation somewhere the user did not configure.
describe('memory extraction with a Bedrock BYOK chat provider', () => {
  let root: string;
  let dataDir: string;
  let projectRoot: string;
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-memory-bedrock-chat-'));
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
    // Every unrelated credential the legacy chain could wander to.
    process.env.ANTHROPIC_API_KEY = 'anthropic-env-key';
    process.env.OPENAI_API_KEY = 'openai-env-key';
    const mediaConfig = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(mediaConfig), { recursive: true });
    await writeFile(
      mediaConfig,
      JSON.stringify({ providers: { openai: { apiKey: 'openai-media-key' } } }),
      'utf8',
    );
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

  it('skips extraction for an API-key Bedrock chat instead of using another vendor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await extractWithLLM(
      dataDir,
      { userMessage: 'Remember that I prefer quiet transitions.', assistantMessage: 'Noted.' },
      {
        projectRoot,
        chatAgentId: null,
        chatProvider: {
          provider: 'bedrock',
          apiKey: 'bedrock-api-key-test',
          baseUrl: BEDROCK_BASE_URL,
          model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
        },
      },
    );

    expect(suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listExtractions()[0]).toMatchObject({
      phase: 'skipped',
      reason: 'no-provider',
    });
  });

  it('skips extraction for an AWS-profile Bedrock chat (no key, keyless snapshot)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await extractWithLLM(
      dataDir,
      { userMessage: 'Remember that I prefer quiet transitions.', assistantMessage: 'Noted.' },
      {
        projectRoot,
        chatAgentId: null,
        chatProvider: {
          provider: 'bedrock',
          apiKey: '',
          baseUrl: BEDROCK_BASE_URL,
          model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
          requiresApiKey: false,
        },
      },
    );

    expect(suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listExtractions()[0]).toMatchObject({
      phase: 'skipped',
      reason: 'no-provider',
    });
  });

  it('still runs "Same as chat" extraction for a vendor the extractor supports', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/chat/completions');
      expect(init?.headers).toMatchObject({ authorization: 'Bearer openai-chat-key' });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ entries: [] }) } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await extractWithLLM(
      dataDir,
      { userMessage: 'Remember that I prefer quiet transitions.', assistantMessage: 'Noted.' },
      {
        projectRoot,
        chatAgentId: null,
        chatProvider: {
          provider: 'openai',
          apiKey: 'openai-chat-key',
          baseUrl: 'https://api.openai.com',
          model: 'gpt-4o-mini',
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listExtractions()[0]).toMatchObject({
      provider: { kind: 'openai', credentialSource: 'chat-byok' },
    });
  });
});
