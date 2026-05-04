import type http from 'node:http';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../src/server.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

describe('API proxy routes', () => {
  const realFetch = globalThis.fetch;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('converts OpenAI-compatible CRLF SSE chunks into proxy delta/end events', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse([
        'data: {"choices":[{"delta":',
        'data: {"content":"hi"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\r\n')));
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    await expect(res.text()).resolves.toContain('event: delta\ndata: {"delta":"hi"}');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('surfaces OpenAI-compatible in-stream error frames', async () => {
    vi.stubGlobal('fetch', vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"error":{"message":"bad model"}}\n\n'));
    }));

    const res = await realFetch(`${baseUrl}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'bad-model',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    await expect(res.text()).resolves.toContain('Provider error: bad model');
  });

  it('uses Azure deployment URLs and api-key auth', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: [DONE]\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/azure/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://resource.openai.azure.com',
        apiKey: 'azure-key',
        model: 'deployment-one',
        apiVersion: '2024-10-21',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [upstreamUrl, upstreamInit] = fetchMock.mock.calls[0]!;
    expect(String(upstreamUrl)).toBe(
      'https://resource.openai.azure.com/openai/deployments/deployment-one/chat/completions?api-version=2024-10-21',
    );
    expect(upstreamInit?.headers).toMatchObject({ 'api-key': 'azure-key' });
  });

  it('surfaces Gemini safety blocks as proxy errors', async () => {
    vi.stubGlobal('fetch', vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'));
    }));

    const res = await realFetch(`${baseUrl}/api/proxy/google/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'google-key',
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    await expect(res.text()).resolves.toContain('Gemini blocked the prompt (SAFETY).');
  });

  it('forwards maxTokens to Gemini generation config', async () => {
    const fetchMock = vi.fn((input: FetchInput, init?: FetchInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      return Promise.resolve(sseResponse('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await realFetch(`${baseUrl}/api/proxy/google/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'google-key',
        model: 'gemini-2.0-flash',
        maxTokens: 1234,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    const [, upstreamInit] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(upstreamInit?.body))).toMatchObject({
      generationConfig: { maxOutputTokens: 1234 },
    });
  });
});

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}
