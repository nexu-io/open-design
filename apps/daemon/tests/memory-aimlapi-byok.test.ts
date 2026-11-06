import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractWithLLM } from '../src/memory-llm.js';
import { memoryDir, writeMemoryConfig } from '../src/memory.js';
import { __resetExtractionsForTests } from '../src/memory-extractions.js';
import {
  AIMLAPI_PARTNER_ID,
  AIMLAPI_SOURCE,
} from '../src/integrations/aimlapi.js';

const dataDir = path.join(process.env.OD_DATA_DIR as string, 'memory-aimlapi-byok-test');
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
  __resetExtractionsForTests();
  // Chat auto-extraction defaults OFF product-wide; this spec covers the
  // provider auto-pick inside the extractor, so opt in explicitly.
  await writeMemoryConfig(dataDir, { chatExtractionEnabled: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Captured = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

/** Capture the single outbound extractor call instead of performing it. */
function captureOneCall(): { calls: Captured[] } {
  const calls: Captured[] = [];
  globalThis.fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const headers: Record<string, string> = {};
    // Header names are case-insensitive on the wire; normalise so assertions
    // do not depend on the casing the caller happened to use.
    new Headers(init?.headers ?? {}).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    calls.push({ url, headers, body: String(init?.body ?? '') });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"entries":[]}' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls };
}

describe('memory-llm aimlapi.com BYOK snapshot', () => {
  // ProjectView forwards byokChatProvider.provider = 'aimlapi' on every BYOK
  // turn. pickProvider() only enters the "same as chat" branch when
  // PROVIDER_DEFAULTS[provider] exists, so without an aimlapi entry the
  // extractor silently falls back to ANTHROPIC/OPENAI credentials — the
  // "I'm chatting with X but memory used Y" surprise this path prevents.
  it('extracts against aimlapi.com rather than falling back to another vendor', async () => {
    const { calls } = captureOneCall();

    await extractWithLLM(
      dataDir,
      { userMessage: 'I prefer dark mode.', assistantMessage: 'Noted.' },
      {
        projectRoot: null,
        chatAgentId: null,
        chatProvider: {
          provider: 'aimlapi',
          apiKey: 'test-aimlapi-key',
          baseUrl: '',
          apiVersion: '',
          model: '',
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.aimlapi.com/v1/chat/completions');
    // An empty `model` must resolve to the aimlapi.com fast default, not to
    // another provider's (gpt-4o-mini would mean we fell through to OpenAI).
    expect(JSON.parse(calls[0]?.body ?? '{}').model).toBe('google/gemini-3.6-flash');
    expect(calls[0]?.headers.authorization).toBe('Bearer test-aimlapi-key');
  });

  // aimlapi.com expects the attribution pair on EVERY request it serves, the
  // memory extractor's included. A missing pair serves fine but is silently
  // untagged, so only an assertion on the outgoing headers catches it.
  it('carries the attribution pair on the extractor call', async () => {
    const { calls } = captureOneCall();

    await extractWithLLM(
      dataDir,
      { userMessage: 'I prefer dark mode.', assistantMessage: 'Noted.' },
      {
        projectRoot: null,
        chatAgentId: null,
        chatProvider: {
          provider: 'aimlapi',
          apiKey: 'test-aimlapi-key',
          baseUrl: 'https://api.aimlapi.com/v1',
          apiVersion: '',
          model: 'openai/gpt-5.6-terra',
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['x-aimlapi-source']).toBe(AIMLAPI_SOURCE);
    expect(calls[0]?.headers['x-aimlapi-partner-id']).toBe(AIMLAPI_PARTNER_ID);
    // An explicit model must win over the default.
    expect(JSON.parse(calls[0]?.body ?? '{}').model).toBe('openai/gpt-5.6-terra');
  });

  // Saved configs pre-dating the 'aimlapi' protocol stay provider: 'openai'
  // with a hand-typed base URL (backward-compat promise: saved configs load
  // unchanged). ProjectView forwards that protocol verbatim as chatProvider,
  // and pickProvider()'s "same as chat" branch copies it straight into
  // `kind`, so this is the one request shape that skipped attribution
  // before isAimlapiApiHost() was checked here too (#7461 review finding).
  it("carries the attribution pair for a legacy 'openai' provider pointed at api.aimlapi.com", async () => {
    const { calls } = captureOneCall();

    await extractWithLLM(
      dataDir,
      { userMessage: 'I prefer dark mode.', assistantMessage: 'Noted.' },
      {
        projectRoot: null,
        chatAgentId: null,
        chatProvider: {
          provider: 'openai',
          apiKey: 'test-legacy-aimlapi-key',
          baseUrl: 'https://api.aimlapi.com/v1',
          apiVersion: '',
          model: 'openai/gpt-5.6-terra',
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.aimlapi.com/v1/chat/completions');
    expect(calls[0]?.headers['x-aimlapi-source']).toBe(AIMLAPI_SOURCE);
    expect(calls[0]?.headers['x-aimlapi-partner-id']).toBe(AIMLAPI_PARTNER_ID);
  });

  it("does not send the aimlapi attribution pair for an ordinary 'openai' provider on an unrelated host", async () => {
    const { calls } = captureOneCall();

    await extractWithLLM(
      dataDir,
      { userMessage: 'I prefer dark mode.', assistantMessage: 'Noted.' },
      {
        projectRoot: null,
        chatAgentId: null,
        chatProvider: {
          provider: 'openai',
          apiKey: 'sk-unrelated',
          baseUrl: 'https://api.openai.com/v1',
          apiVersion: '',
          model: 'gpt-4o-mini',
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['x-aimlapi-source']).toBeUndefined();
    expect(calls[0]?.headers['x-aimlapi-partner-id']).toBeUndefined();
  });
});
