import type { Express, RequestHandler, Response } from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ByokCredentialService,
  type ByokSecretBackend,
} from '../../src/byok/credential-service.js';
import { registerByokCredentialRoutes } from '../../src/routes/byok-credentials.js';

class MemorySecretBackend implements ByokSecretBackend {
  readonly kind = 'test-memory';
  readonly secrets = new Map<string, string>();

  async available() { return true; }
  async set(profileId: string, secret: string) { this.secrets.set(profileId, secret); }
  async get(profileId: string) { return this.secrets.get(profileId) ?? null; }
  async delete(profileId: string) { return this.secrets.delete(profileId); }
}

describe('BYOK credential routes', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ));
  });

  it('keeps raw credentials out of profile responses and tests with the stored secret', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-byok-routes-'));
    roots.push(dataDir);
    const backend = new MemorySecretBackend();
    const credentials = new ByokCredentialService({ dataDir, backend });
    const connectionTest = vi.fn(async (input: {
      apiKey: string;
      model: string;
    }) => ({
      ok: true,
      kind: 'success' as const,
      latencyMs: 12,
      model: input.model,
      sample: 'ok',
    }));
    const routes = createRoutes(credentials, connectionTest);
    const secret = 'route-test-secret-must-not-escape';

    const createResponse = await routes.call('POST', '/api/byok/profiles', {
      body: {
        label: 'OpenRouter',
        protocol: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openrouter/free',
        apiKey: secret,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdText = JSON.stringify(createResponse.body);
    expect(createdText).not.toContain(secret);
    const created = JSON.parse(createdText) as { profile: { id: string; keyTail: string } };
    expect(created.profile.keyTail).toBe('cape');

    const listResponse = await routes.call('GET', '/api/byok/profiles');
    expect(listResponse.statusCode).toBe(200);
    expect(JSON.stringify(listResponse.body)).not.toContain(secret);

    const testResponse = await routes.call('POST', '/api/byok/profiles/:id/test', {
      params: { id: created.profile.id },
    });
    expect(testResponse.statusCode).toBe(200);
    const testText = JSON.stringify(testResponse.body);
    expect(testText).not.toContain(secret);
    expect(JSON.parse(testText)).toMatchObject({
      ok: true,
      kind: 'success',
      model: 'openrouter/free',
    });
    expect(connectionTest).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: secret,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
      protocol: 'openai',
    }));
  });

  it('guards every credential route as loopback-only', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-byok-routes-'));
    roots.push(dataDir);
    const credentials = new ByokCredentialService({
      dataDir,
      backend: new MemorySecretBackend(),
    });
    const guard: RequestHandler = (_req, res) => {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'local only' } });
    };
    const routes = createRoutes(
      credentials,
      vi.fn(),
      guard,
    );

    for (const request of [
      { path: '/api/byok/profiles', method: 'GET' as const },
      { path: '/api/byok/profiles', method: 'POST' as const },
      { path: '/api/byok/profiles/:id', method: 'DELETE' as const },
      { path: '/api/byok/profiles/:id/test', method: 'POST' as const },
    ]) {
      const response = await routes.call(request.method, request.path, {
        params: { id: 'byok-test-profile' },
        body: {},
      });
      expect(response.statusCode, `${request.method} ${request.path}`).toBe(403);
    }
  });
});

function createRoutes(
  credentials: ByokCredentialService,
  connectionTest: (...args: any[]) => Promise<any>,
  requireLocalDaemonRequest: RequestHandler = (_req, _res, next) => next(),
): {
  call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    request?: { body?: unknown; params?: Record<string, string> },
  ): Promise<{ statusCode: number; body: unknown }>;
} {
  const registered = new Map<string, RequestHandler[]>();
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registered.set(`GET ${path}`, handlers);
    },
    post(path: string, ...handlers: RequestHandler[]) {
      registered.set(`POST ${path}`, handlers);
    },
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.set(`DELETE ${path}`, handlers);
    },
  } as unknown as Express;
  registerByokCredentialRoutes(app, {
    byokCredentials: credentials,
    connectionTest,
    http: {
      requireLocalDaemonRequest,
      sendApiError(
        res: Response,
        status: number,
        code: string,
        message: string,
      ) {
        return res.status(status).json({ error: { code, message } });
      },
    },
  });
  return {
    async call(method, routePath, request = {}) {
      const handlers = registered.get(`${method} ${routePath}`);
      if (!handlers) throw new Error(`route not registered: ${method} ${routePath}`);
      let statusCode = 200;
      let body: unknown;
      const response = {
        status(code: number) {
          statusCode = code;
          return response;
        },
        json(value: unknown) {
          body = value;
          return response;
        },
        end() {
          return response;
        },
        setHeader() {
          return response;
        },
      } as unknown as Response;
      const req = {
        body: request.body,
        params: request.params ?? {},
      };
      const dispatch = async (index: number): Promise<void> => {
        const handler = handlers[index];
        if (!handler) return;
        let nextPromise: Promise<void> | null = null;
        await handler(req as never, response, () => {
          nextPromise = dispatch(index + 1);
        });
        if (nextPromise) await nextPromise;
      };
      await dispatch(0);
      return { statusCode, body };
    },
  };
}
