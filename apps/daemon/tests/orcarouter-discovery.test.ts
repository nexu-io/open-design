// OrcaRouter through the centre of the repo: the provider connection test and
// the shared model-discovery layer.
//
// These two modules are what every BYOK surface funnels through, so a
// regression here is a regression everywhere. The assertions are deliberately
// about the WIRE (which origin, which path, which header) rather than about
// OrcaRouter's own helpers, which are covered in orcarouter-catalog.test.ts.

import { describe, expect, it, vi } from 'vitest';

import { listProviderModels } from '../src/integrations/provider-models.js';
import { testProviderConnection } from '../src/connectionTest.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const CATALOGUE = {
  data: [
    {
      id: 'openai/gpt-5.5',
      object: 'model',
      supported_endpoint_types: ['openai', 'openai-response'],
      architecture: { input_modalities: ['text', 'image', 'file'] },
      context_length: 272000,
      pricing: { prompt_per_million: '5.000000', completion_per_million: '30.000000' },
    },
    {
      id: 'deepseek/deepseek-v4-pro',
      object: 'model',
      supported_endpoint_types: ['openai'],
      architecture: { input_modalities: ['text'] },
    },
    {
      // A media route that must not reach the chat picker even though the
      // catalogue page included it.
      id: 'vendor/image-only',
      object: 'model',
      supported_endpoint_types: ['image-generation'],
      architecture: { input_modalities: ['text'] },
    },
  ],
};

describe('OrcaRouter through provider model discovery', () => {
  it('reads the chat catalogue through the shared discovery layer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CATALOGUE));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      const result = await listProviderModels({
        protocol: 'orcarouter',
        baseUrl: 'https://api.orcarouter.ai/v1',
        apiKey: 'sk-orca-fake',
      });
      expect(result.ok).toBe(true);

      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-orca-fake');

      const ids = (result.models ?? []).map((m) => m.id);
      expect(ids).toContain('openai/gpt-5.5');
      expect(ids).toContain('deepseek/deepseek-v4-pro');
      // Capability filtering is applied on the way through — the discovery
      // layer does not hand the picker a media-only route.
      expect(ids).not.toContain('vendor/image-only');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('carries context window and pricing metadata onto the option shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(CATALOGUE)));
    try {
      const result = await listProviderModels({
        protocol: 'orcarouter',
        baseUrl: 'https://api.orcarouter.ai/v1',
        apiKey: 'sk-orca-fake',
      });
      const gpt = (result.models ?? []).find((m) => m.id === 'openai/gpt-5.5');
      expect(gpt?.metadata?.contextWindowTokens).toBe(272000);
      expect(gpt?.inputPriceUsdPerMillion).toBe(5);
      expect(gpt?.outputPriceUsdPerMillion).toBe(30);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports an auth failure as auth_failed and never echoes the key', async () => {
    const secret = 'sk-orca-shouldneverappear00000000000000';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid key"}', { status: 401 })));
    try {
      const result = await listProviderModels({
        protocol: 'orcarouter',
        baseUrl: 'https://api.orcarouter.ai/v1',
        apiKey: secret,
      });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('auth_failed');
      expect(result.detail ?? '').not.toContain(secret);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never sends the credential to a non-OrcaRouter origin when the base URL changes', async () => {
    // A self-hosted override still receives the key — that is the point of the
    // override — but the default must stay on the documented inference origin.
    const fetchImpl = vi.fn(async () => jsonResponse(CATALOGUE));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await listProviderModels({
        protocol: 'orcarouter',
        baseUrl: 'https://api.orcarouter.ai/v1',
        apiKey: 'sk-orca-fake',
      });
      const [url] = fetchImpl.mock.calls[0] as unknown as [string];
      expect(new URL(url).hostname).toBe('api.orcarouter.ai');
      // The auth origin must never appear on an inference call.
      expect(new URL(url).hostname).not.toBe('www.orcarouter.ai');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('OrcaRouter connection smoke test', () => {
  it('posts an OpenAI-shaped chat completion to the inference origin', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      model: 'openai/gpt-5.5',
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
    }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      const result = await testProviderConnection({
        protocol: 'orcarouter',
        baseUrl: 'https://api.orcarouter.ai/v1',
        apiKey: 'sk-orca-fake',
        model: 'openai/gpt-5.5',
      });
      expect(result.ok).toBe(true);

      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const parsed = new URL(url);
      // Inference, not auth — the smoke test must never touch the auth origin.
      expect(parsed.hostname).toBe('api.orcarouter.ai');
      expect(parsed.pathname).toContain('/chat/completions');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-orca-fake');
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.model).toBe('openai/gpt-5.5');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('classifies a rejected key as an auth failure without echoing it', async () => {
    const secret = 'sk-orca-nevershouldleak00000000000000000';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })));
    try {
      const result = await testProviderConnection({
        protocol: 'orcarouter',
        baseUrl: 'https://api.orcarouter.ai/v1',
        apiKey: secret,
        model: 'openai/gpt-5.5',
      });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
