import { describe, expect, it, vi } from 'vitest';

import worker, { type Env } from '../src/index';

const env: Env = {
  LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
  LANGFUSE_SECRET_KEY: 'sk-lf-test',
  LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com',
};

function makeRequest(body: unknown): Request {
  return new Request('https://telemetry.open-design.ai/api/langfuse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Open-Design-Telemetry': 'langfuse-ingestion-v1',
    },
    body: JSON.stringify(body),
  });
}

function makeRateLimiter(success: boolean) {
  return {
    limit: vi.fn(async () => ({ success })),
  };
}

describe('telemetry worker', () => {
  it('returns a health response for browser checks', async () => {
    const response = await worker.fetch(
      new Request('https://telemetry.open-design.ai/api/langfuse'),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: 'open-design-telemetry-relay',
      configured: true,
      upstream: 'https://us.cloud.langfuse.com/api/public/ingestion',
    });
  });

  it('reports unconfigured health without exposing secrets', async () => {
    const response = await worker.fetch(new Request('https://telemetry.open-design.ai/health'), {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: 'open-design-telemetry-relay',
      configured: false,
      upstream: 'https://us.cloud.langfuse.com/api/public/ingestion',
    });
  });

  it('forwards valid Langfuse ingestion batches with server-side auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ successes: [{ id: 'evt-1' }], errors: [] }), {
        status: 207,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await worker.fetch(
      makeRequest({
        batch: [
          {
            id: 'evt-1',
            type: 'trace-create',
            timestamp: '2026-05-11T00:00:00.000Z',
            body: { id: 'trace-1', name: 'open-design-turn' },
          },
        ],
      }),
      env,
    );

    expect(response.status).toBe(207);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://us.cloud.langfuse.com/api/public/ingestion');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      'Content-Type': 'application/json',
    });

    fetchSpy.mockRestore();
  });

  it('rejects requests without the Open Design client marker', async () => {
    const response = await worker.fetch(
      new Request('https://telemetry.open-design.ai/api/langfuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: [] }),
      }),
      env,
    );

    expect(response.status).toBe(403);
  });

  it('rate limits validated batches before forwarding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const limiter = makeRateLimiter(false);
    const response = await worker.fetch(
      makeRequest({
        batch: [
          {
            id: 'evt-1',
            type: 'trace-create',
            timestamp: '2026-05-11T00:00:00.000Z',
            body: {
              id: 'trace-1',
              name: 'open-design-turn',
              userId: 'installation-1',
            },
          },
        ],
      }),
      { ...env, TELEMETRY_CLIENT_RATE_LIMITER: limiter },
    );

    expect(response.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: 'client:installation-1' });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('rejects malformed batches before forwarding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(makeRequest({ batch: [{ type: 'bad' }] }), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'body.batch[0].id must be a string',
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('fails closed when Langfuse credentials are absent', async () => {
    const response = await worker.fetch(makeRequest({ batch: [] }), {});
    expect(response.status).toBe(503);
  });
});
