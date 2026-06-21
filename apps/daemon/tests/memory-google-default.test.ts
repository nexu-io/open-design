import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractWithLLM } from '../src/memory-llm.js';
import { memoryDir } from '../src/memory.js';
import { __resetExtractionsForTests } from '../src/memory-extractions.js';

const dataDir = path.join(process.env.OD_DATA_DIR as string, 'memory-google-default-test');
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
  __resetExtractionsForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('memory-llm Google fast-model default', () => {
  it('uses gemini-3.5-flash (not a shut-down 2.0 model) when chatProvider omits a model', async () => {
    let capturedUrl: string | null = null;

    globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      capturedUrl = url;
      // Return a valid Google Gemini response shape so extractWithLLM can parse it.
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"entries":[]}' }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    await extractWithLLM(
      dataDir,
      { userMessage: 'I prefer dark mode.', assistantMessage: 'Noted.' },
      {
        projectRoot: null,
        chatAgentId: null,
        chatProvider: {
          provider: 'google',
          apiKey: 'AQ.TestKeyForUnitTests01234567890123456789012',
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiVersion: '',
          model: '',
        },
      },
    );

    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl).toContain('gemini-3.5-flash');
    expect(capturedUrl).not.toContain('gemini-2.0-flash');
  });
});
