import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import worker, { type Env } from '../src/index';

const env: Env = {
  LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
  LANGFUSE_SECRET_KEY: 'sk-lf-test',
  LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com',
};
const objectUploadSecret = 'object-upload-secret';

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

function makeScopeKv(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function objectRelayHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Open-Design-Telemetry': 'object-ingestion-v1',
  };
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function uploadToken(scope: Record<string, unknown>): string {
  const payload = base64Url(JSON.stringify({
    version: 1,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...scope,
  }));
  const signature = createHmac('sha256', objectUploadSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function requireSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeObjectRequest(body: unknown): Request {
  let requestBody = body;
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !('upload_token' in body) &&
    Array.isArray((body as { objects?: unknown }).objects)
  ) {
    const objectBody = body as {
      client_id?: string;
      project_id?: string;
      run_id?: string;
      objects: Array<Record<string, unknown>>;
    };
    requestBody = {
      ...objectBody,
      upload_token: uploadToken({
        client_id: objectBody.client_id ?? 'installation-1',
        project_id: objectBody.project_id ?? 'proj-1',
        run_id: objectBody.run_id ?? 'run-1',
        objects: objectBody.objects.map((object) => {
          const content = typeof object.content_base64 === 'string'
            ? Buffer.from(object.content_base64, 'base64')
            : Buffer.alloc(0);
          return {
            storage_ref: object.storage_ref,
            object_class: object.object_class,
            size_bytes: content.byteLength,
            sha256: `sha256:${createHash('sha256').update(content).digest('hex')}`,
          };
        }),
      }),
    };
  }
  const bodyText = JSON.stringify(requestBody);
  return new Request('https://telemetry.open-design.ai/api/objects/batch', {
    method: 'POST',
    headers: objectRelayHeaders(),
    body: bodyText,
  });
}

function makeUnsignedObjectRequest(body: unknown): Request {
  return new Request('https://telemetry.open-design.ai/api/objects/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Open-Design-Telemetry': 'object-ingestion-v1',
    },
    body: JSON.stringify(body),
  });
}

function base64(value: string): string {
  return btoa(value);
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
      objectRelayConfigured: false,
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
      objectRelayConfigured: false,
      upstream: 'https://us.cloud.langfuse.com/api/public/ingestion',
    });
  });

  it('reports object relay unconfigured when the bucket exists without an upload secret', async () => {
    const response = await worker.fetch(new Request('https://telemetry.open-design.ai/health'), {
      TRACE_OBJECT_BUCKET: { put: vi.fn(async () => ({})) },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      objectRelayConfigured: false,
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

  it('stores object batches through the R2 binding without calling Langfuse', async () => {
    const put = vi.fn(async () => ({}));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(
      makeObjectRequest({
        client_id: 'installation-1',
        project_id: 'proj-1',
        run_id: 'run-1',
        objects: [
          {
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
            object_class: 'attachment',
            mime: 'text/plain',
            content_base64: base64('hello object'),
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put },
        TRACE_OBJECT_PREFIX: 'observability',
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
      },
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);
    const putCalls = (put as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(putCalls[0]![0]).toBe(
      'observability/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
    );
    const body = await response.json() as { objects: Array<Record<string, unknown>> };
    expect(body.objects[0]).toMatchObject({
      storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
      status: 'available',
      size_bytes: 12,
    });
    expect(body.objects[0]?.sha256).toEqual(expect.stringMatching(/^sha256:/));

    fetchSpy.mockRestore();
  });

  it('rejects object authorization metadata without registered telemetry scope', async () => {
    const content = 'hello object';
    const scopeKv = makeScopeKv();
    const response = await worker.fetch(
      new Request('https://telemetry.open-design.ai/api/objects/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Open-Design-Telemetry': 'object-ingestion-v1',
          'CF-Connecting-IP': '203.0.113.10',
        },
        body: JSON.stringify({
          client_id: 'installation-1',
          project_id: 'proj-1',
          run_id: 'run-1',
          objects: [
            {
              storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
              object_class: 'attachment',
              size_bytes: content.length,
              sha256: `sha256:${requireSha256(content)}`,
            },
          ],
        }),
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put: vi.fn() },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
        TRACE_OBJECT_SCOPE_KV: scopeKv,
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'object upload authority is not registered',
    });
  });

  it('issues short-lived object upload tokens for scopes registered by telemetry traces', async () => {
    const content = 'hello object';
    const scopeKv = makeScopeKv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ successes: [], errors: [] }), { status: 207 }),
    );
    const traceResponse = await worker.fetch(
      makeRequest({
        batch: [
          {
            id: 'evt-1',
            type: 'trace-create',
            timestamp: '2026-06-08T00:00:00.000Z',
            body: {
              id: 'run-1',
              name: 'open-design-turn',
              userId: 'installation-1',
              metadata: {
                projectId: 'proj-1',
                attachment_manifest: [
                  {
                    storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
                    object_class: 'attachment',
                    size_bytes: content.length,
                    sha256: `sha256:${requireSha256(content)}`,
                  },
                ],
              },
            },
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put: vi.fn() },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
        TRACE_OBJECT_SCOPE_KV: scopeKv,
      },
    );
    expect(traceResponse.status).toBe(207);
    expect(scopeKv.put).toHaveBeenCalledTimes(1);

    const response = await worker.fetch(
      new Request('https://telemetry.open-design.ai/api/objects/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Open-Design-Telemetry': 'object-ingestion-v1',
          'CF-Connecting-IP': '203.0.113.10',
        },
        body: JSON.stringify({
          client_id: 'installation-1',
          project_id: 'proj-1',
          run_id: 'run-1',
          objects: [
            {
              storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
              object_class: 'attachment',
              size_bytes: content.length,
              sha256: `sha256:${requireSha256(content)}`,
            },
          ],
        }),
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put: vi.fn() },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
        TRACE_OBJECT_SCOPE_KV: scopeKv,
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { upload_token?: string; expires_at?: string };
    expect(body.upload_token).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/));
    expect(body.expires_at).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    fetchSpy.mockRestore();
  });

  it('registers object upload scopes when only a sibling observation is rejected', async () => {
    const content = 'hello object';
    const scopeKv = makeScopeKv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          successes: [{ id: 'trace-evt-1' }],
          errors: [{ id: 'span-evt-1', status: 400 }],
        }),
        { status: 207 },
      ),
    );
    const response = await worker.fetch(
      makeRequest({
        batch: [
          {
            id: 'trace-evt-1',
            type: 'trace-create',
            timestamp: '2026-06-08T00:00:00.000Z',
            body: {
              id: 'run-1',
              name: 'open-design-turn',
              userId: 'installation-1',
              metadata: {
                projectId: 'proj-1',
                artifact_manifest: [
                  {
                    storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-1/index.html',
                    object_class: 'artifact',
                    size_bytes: content.length,
                    sha256: `sha256:${requireSha256(content)}`,
                  },
                ],
              },
            },
          },
          {
            id: 'span-evt-1',
            type: 'span-create',
            timestamp: '2026-06-08T00:00:00.000Z',
            body: { id: 'span-1', traceId: 'run-1', name: 'agent-call' },
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put: vi.fn() },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
        TRACE_OBJECT_SCOPE_KV: scopeKv,
      },
    );

    expect(response.status).toBe(207);
    expect(scopeKv.put).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('does not register object upload scopes when Langfuse rejects the trace batch', async () => {
    const scopeKv = makeScopeKv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ successes: [], errors: [{ id: 'evt-1', status: 400 }] }), {
        status: 207,
      }),
    );
    const response = await worker.fetch(
      makeRequest({
        batch: [
          {
            id: 'evt-1',
            type: 'trace-create',
            timestamp: '2026-06-08T00:00:00.000Z',
            body: {
              id: 'run-1',
              name: 'open-design-turn',
              userId: 'installation-1',
              metadata: {
                projectId: 'proj-1',
                artifact_manifest: [
                  {
                    storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-1/index.html',
                    object_class: 'artifact',
                    size_bytes: 12,
                    sha256: `sha256:${requireSha256('hello object')}`,
                  },
                ],
              },
            },
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put: vi.fn() },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
        TRACE_OBJECT_SCOPE_KV: scopeKv,
      },
    );

    expect(response.status).toBe(207);
    expect(scopeKv.put).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects object batches without the object marker', async () => {
    const response = await worker.fetch(
      new Request('https://telemetry.open-design.ai/api/objects/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects: [] }),
      }),
      { ...env, TRACE_OBJECT_BUCKET: { put: vi.fn() } },
    );

    expect(response.status).toBe(403);
  });

  it('rejects marker-only object batches without upload token', async () => {
    const put = vi.fn(async () => ({}));
    const response = await worker.fetch(
      makeUnsignedObjectRequest({
        client_id: 'installation-1',
        project_id: 'proj-1',
        run_id: 'run-1',
        objects: [
          {
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
            object_class: 'attachment',
            mime: 'text/plain',
            content_base64: base64('hello object'),
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'body.upload_token must be a string',
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('rate limits unsigned object batches by IP before reading the body', async () => {
    const put = vi.fn(async () => ({}));
    const limiter = makeRateLimiter(false);
    const unreadableBody = new ReadableStream({
      pull(controller) {
        controller.error(new Error('object body should not be read'));
      },
    });
    const response = await worker.fetch(
      new Request('https://telemetry.open-design.ai/api/objects/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
          'X-Open-Design-Telemetry': 'object-ingestion-v1',
        },
        body: unreadableBody,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
      {
        ...env,
        TELEMETRY_IP_RATE_LIMITER: limiter,
        TRACE_OBJECT_BUCKET: { put },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
      },
    );

    expect(response.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.10' });
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects signed-looking object batches when server upload authority is absent', async () => {
    const put = vi.fn(async () => ({}));
    const response = await worker.fetch(
      makeObjectRequest({
        client_id: 'installation-1',
        project_id: 'proj-1',
        run_id: 'run-1',
        objects: [
          {
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1/brief.txt',
            object_class: 'attachment',
            mime: 'text/plain',
            content_base64: base64('hello object'),
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'object relay upload authority is not configured',
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects object batches without upload authority before reading the body', async () => {
    const put = vi.fn(async () => ({}));
    const request = new Request('https://telemetry.open-design.ai/api/objects/batch', {
      method: 'POST',
      headers: {
        'X-Open-Design-Telemetry': 'object-ingestion-v1',
      },
      body: 'object body should not be read',
    });
    const textSpy = vi.spyOn(request, 'text').mockRejectedValue(
      new Error('object body should not be read'),
    );
    const response = await worker.fetch(
      request,
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'object relay upload authority is not configured',
    });
    expect(textSpy).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects object refs outside the signed project and run namespace', async () => {
    const put = vi.fn(async () => ({}));
    const response = await worker.fetch(
      makeObjectRequest({
        client_id: 'installation-1',
        project_id: 'proj-1',
        run_id: 'run-1',
        objects: [
          {
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-2/runs/run-1/attachment/att-1/brief.txt',
            object_class: 'attachment',
            mime: 'text/plain',
            content_base64: base64('hello object'),
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put },
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'body.objects[0].storage_ref must match the project, run, and object class',
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('reports oversized objects without writing them', async () => {
    const put = vi.fn(async () => ({}));
    const response = await worker.fetch(
      makeObjectRequest({
        client_id: 'installation-1',
        project_id: 'proj-1',
        run_id: 'run-1',
        objects: [
          {
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-1/index.html',
            object_class: 'artifact',
            mime: 'text/html',
            content_base64: base64('too large'),
          },
        ],
      }),
      {
        ...env,
        TRACE_OBJECT_BUCKET: { put },
        TRACE_OBJECT_MAX_BYTES: '4',
        TRACE_OBJECT_UPLOAD_SECRET: objectUploadSecret,
      },
    );

    expect(response.status).toBe(200);
    expect(put).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      objects: [
        {
          storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-1/index.html',
          status: 'unavailable',
          reason: 'object_too_large',
          size_bytes: 9,
        },
      ],
    });
  });
});
