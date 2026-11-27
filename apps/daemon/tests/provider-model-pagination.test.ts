import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listProviderModels } from '../src/integrations/provider-models.js';

type PaginatedProtocol = 'google' | 'anthropic';

describe('provider model pagination', () => {
  let server: ReturnType<typeof createServer>;
  let origin: string;
  let handle: (url: URL) => { status?: number; body: unknown };
  let requests: Array<{ url: URL; headers: IncomingHttpHeaders }>;

  beforeEach(async () => {
    requests = [];
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '', origin);
      requests.push({ url, headers: request.headers });
      const reply = handle(url);
      response.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address == null || typeof address === 'string') throw new Error('missing test TCP address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function row(protocol: PaginatedProtocol, id: string) {
    return protocol === 'google'
      ? { name: `models/${id}`, displayName: id, supportedGenerationMethods: ['generateContent'] }
      : { id, display_name: id };
  }

  function page(protocol: PaginatedProtocol, ids: string[], next?: unknown) {
    return protocol === 'google'
      ? { models: ids.map((id) => row(protocol, id)), ...(next === undefined ? {} : { nextPageToken: next }) }
      : { data: ids.map((id) => row(protocol, id)), has_more: next !== undefined, last_id: next ?? null };
  }

  function cursor(protocol: PaginatedProtocol, url: URL) {
    return url.searchParams.get(protocol === 'google' ? 'pageToken' : 'after_id');
  }

  function run(protocol: PaginatedProtocol | 'openai', signal?: AbortSignal) {
    return listProviderModels({
      protocol, baseUrl: origin, apiKey: 'fixture-key', ...(signal ? { signal } : {}),
    });
  }

  for (const protocol of ['google', 'anthropic'] as const) {
    it(`${protocol}: follows pages, preserving provider order and first-seen duplicates`, async () => {
      const opaque = 'next+/=% token';
      handle = (url) => ({
        body: cursor(protocol, url) === null
          ? page(protocol, ['z-first', 'shared'], opaque)
          : page(protocol, ['a-later', 'shared']),
      });

      const result = await run(protocol);

      expect(result.ok).toBe(true);
      expect(result.models?.map((model) => model.id)).toEqual(['z-first', 'shared', 'a-later']);
      expect(requests).toHaveLength(2);
      expect(requests[1]?.url.searchParams.get(protocol === 'google' ? 'pageToken' : 'after_id')).toBe(opaque);
      for (const request of requests) {
        if (protocol === 'google') {
          expect(request.url.searchParams.get('key')).toBe('fixture-key');
        } else {
          expect(request.url.searchParams.get('limit')).toBe('1000');
          expect(request.headers['x-api-key']).toBe('fixture-key');
          expect(request.headers['anthropic-version']).toBe('2023-06-01');
        }
      }
    });

    it(`${protocol}: propagates a later-page error instead of returning an incomplete catalog`, async () => {
      handle = (url) => cursor(protocol, url) === null
        ? { body: page(protocol, ['first'], 'next') }
        : { status: 429, body: { error: { message: 'too many requests for fixture-key' } } };

      const result = await run(protocol);

      expect(result).toMatchObject({ ok: false, kind: 'rate_limited', status: 429 });
      expect(result.detail).not.toContain('fixture-key');
      expect(requests).toHaveLength(2);
    });

    it(`${protocol}: stops a repeated pagination cursor`, async () => {
      handle = () => ({ body: page(protocol, ['first'], 'same') });

      const result = await run(protocol);

      expect(result).toMatchObject({ ok: false, kind: 'unknown' });
      expect(result.detail).toMatch(/pagination/i);
      expect(requests).toHaveLength(2);
    });

    it(`${protocol}: forwards parent cancellation to a later-page request`, async () => {
      const controller = new AbortController();
      handle = (url) => {
        if (cursor(protocol, url) !== null) controller.abort();
        return { body: page(protocol, ['first'], 'next') };
      };

      const result = await run(protocol, controller.signal);

      expect(result).toMatchObject({ ok: false, kind: 'timeout' });
      expect(requests).toHaveLength(2);
    });
  }

  it('continues past an embedding-only Google page to find text models', async () => {
    handle = (url) => cursor('google', url) === null
      ? {
        body: {
          models: [{ name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }],
          nextPageToken: 'next',
        },
      }
      : { body: page('google', ['gemini-later']) };

    const result = await run('google');

    expect(result.ok).toBe(true);
    expect(result.models?.map((model) => model.id)).toEqual(['gemini-later']);
  });

  it('rejects Anthropic has_more without a usable cursor', async () => {
    handle = () => ({ body: { data: [row('anthropic', 'first')], has_more: true } });

    const result = await run('anthropic');

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/pagination/i);
    expect(requests).toHaveLength(1);
  });

  it('rejects malformed Google pagination metadata', async () => {
    handle = () => ({ body: page('google', ['first'], { token: 'unexpected' }) });

    const result = await run('google');

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/pagination/i);
  });

  it('bounds a provider that returns endlessly changing cursors', async () => {
    handle = () => ({ body: page('google', ['first'], `next-${requests.length}`) });

    const result = await run('google');

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/pagination.*limit/i);
    expect(requests).toHaveLength(100);
  });

  it('keeps OpenAI-compatible discovery to one request', async () => {
    handle = () => ({
      body: { data: [{ id: 'chat-model' }], nextPageToken: 'ignore', has_more: true, last_id: 'ignore' },
    });

    const result = await run('openai');

    expect(result.ok).toBe(true);
    expect(result.models?.map((model) => model.id)).toEqual(['chat-model']);
    expect(requests).toHaveLength(1);
  });
});
