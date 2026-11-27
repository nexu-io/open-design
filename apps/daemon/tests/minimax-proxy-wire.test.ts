import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Express } from 'express';
import { registerChatRoutes, type RegisterChatRoutesDeps } from '../src/routes/chat.js';


// Keep this transport test independent of media runtimes, SQLite and DNS.
// The daemon route/URL/auth/payload builders and SSE parser are real.
vi.mock('../src/media/config.js', () => ({ seedProviderIfMissing: vi.fn() }));
vi.mock('../src/projects.js', () => ({ isSafeId: () => true }));
vi.mock('../src/runtimes/models.js', () => ({ resolveModelForServiceTier: vi.fn() }));
vi.mock('../src/byok-tools.js', () => ({
  BYOK_SENSEAUDIO_TOOLS: [], BYOK_AIHUBMIX_TOOLS: [],
  executeGenerateImage: vi.fn(), executeGenerateSpeech: vi.fn(), executeGenerateVideo: vi.fn(),
  executeAIHubMixGenerateImage: vi.fn(), executeAIHubMixGenerateSpeech: vi.fn(), executeAIHubMixGenerateVideo: vi.fn(),
  isSenseAudioImageModel: () => false, isAIHubMixImageModel: () => false,
  isAIHubMixVideoModel: () => false, isAIHubMixSpeechModel: () => false,
}));
vi.mock('../src/connectionTest.js', () => ({
  validateUserProviderBaseUrl: async (url: string) => ({ parsed: new URL(url) }),
  proxyDispatcherRequestInit: () => ({ requestInit: {}, close: async () => {} }),
}));

afterEach(() => vi.unstubAllGlobals());

const providers = ['api.minimax.io', 'api.minimaxi.com'].flatMap((host) => [
  { label: `${host} Anthropic`, protocol: 'anthropic', baseUrl: `https://${host}/anthropic` },
  { label: `${host} OpenAI`, protocol: 'openai', baseUrl: `https://${host}/v1` },
]);
const cases = providers.flatMap((provider) =>
  ['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7', 'custom-model'].map((model) => ({ provider, model })),
);

describe('MiniMax daemon-to-provider HTTP serialization', () => {
  it.each(cases)('$provider.label sends $model unchanged to the final upstream URL', async ({ provider, model }) => {
    const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>();
    const app = {
      post: (path: string, handler: (req: unknown, res: unknown) => Promise<void>) => routes.set(path, handler),
      get: vi.fn(),
    };
    let daemonFrames = '';
    const ctx = {
      db: {}, design: {}, agents: {}, appConfig: {},
      critique: { handleCritiqueInterrupt: () => vi.fn(), handleCritiqueArtifact: () => vi.fn() },
      http: {
        sendApiError: () => { throw new Error('Unexpected API error'); },
        createSseResponse: () => ({
          send: (event: string, data: unknown) => { daemonFrames += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; },
          end: vi.fn(),
        }),
      },
    };
    registerChatRoutes(app as unknown as Express, ctx as unknown as RegisterChatRoutesDeps);
    const upstream: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      upstream.push({ url, init });
      return new Response(provider.protocol === 'anthropic'
        ? 'event: content_block_delta\ndata: {"delta":{"text":"ok"}}\n\nevent: message_stop\ndata: {}\n\n'
        : 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
    }));
    const handler = routes.get(`/api/proxy/${provider.protocol}/stream`);
    expect(handler).toBeDefined();
    await handler!({ method: 'POST', body: {
      apiKey: 'test-key', baseUrl: provider.baseUrl, model, maxTokens: 4096,
      systemPrompt: 'Be concise.', messages: [{ role: 'user', content: 'Hello' }],
    } }, new EventEmitter());
    expect(daemonFrames).toContain('event: delta');
    expect(daemonFrames).toContain('"delta":"ok"');
    expect(daemonFrames).toContain('event: end');
    expect(daemonFrames).not.toContain('event: error');
    expect(upstream).toHaveLength(1);
    const { url, init } = upstream[0]!;
    expect(url).toBe(provider.baseUrl + (provider.protocol === 'anthropic' ? '/v1/messages' : '/chat/completions'));
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject(provider.protocol === 'anthropic'
      ? { 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' }
      : { Authorization: 'Bearer test-key' });
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual(provider.protocol === 'anthropic'
      ? { model, max_tokens: 4096, messages: [{ role: 'user', content: 'Hello' }], stream: true, system: 'Be concise.' }
      : { model, max_tokens: 4096, messages: [{ role: 'system', content: 'Be concise.' }, { role: 'user', content: 'Hello' }], stream: true });
    expect(payload).not.toHaveProperty('thinking');
    expect(payload).not.toHaveProperty('reasoning_split');
  });
});
