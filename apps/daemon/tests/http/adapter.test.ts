import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiError } from '@open-design/contracts';
import { defineJsonRoute, err, mountJsonRoute, ok } from '../../src/http/index.js';
import { isLocalSameOrigin } from '../../src/origin-validation.js';

vi.mock('../../src/origin-validation.js', () => ({
  isLocalSameOrigin: vi.fn(() => true),
}));

interface MockApp {
  get: (path: string, handler: any) => void;
  post: (path: string, handler: any) => void;
  put: (path: string, handler: any) => void;
  delete: (path: string, handler: any) => void;
  patch: (path: string, handler: any) => void;
  handlers: Record<string, (req: any, res: any) => Promise<void> | void>;
}

function makeApp(): MockApp {
  const handlers: MockApp['handlers'] = {};
  const make = (method: string) => (path: string, handler: any) => {
    handlers[`${method.toUpperCase()} ${path}`] = handler;
  };
  return {
    get: make('get'),
    post: make('post'),
    put: make('put'),
    delete: make('delete'),
    patch: make('patch'),
    handlers,
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

const adapter = { resolvedPortRef: { current: 7456 } };

beforeEach(() => {
  vi.mocked(isLocalSameOrigin).mockReturnValue(true);
});

describe('http adapter', () => {
  it('parses input and returns the success payload', async () => {
    const route = defineJsonRoute<{ value: string }, { echoed: string }, unknown>({
      method: 'post',
      path: '/echo',
      parse: (raw) => ok({ value: String((raw.body as any).value) }),
      handle: (input) => ok({ echoed: input.value }),
    });
    const app = makeApp();
    mountJsonRoute(app as any, route, {}, adapter);
    const res = makeRes();
    await app.handlers['POST /echo']!({ body: { value: 'hi' }, query: {}, params: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ echoed: 'hi' });
  });

  it('returns 400 when parse fails', async () => {
    const route = defineJsonRoute<{ value: string }, unknown, unknown>({
      method: 'post',
      path: '/missing',
      parse: () => err(createApiError('BAD_REQUEST', 'required')),
      handle: () => ok({}),
    });
    const app = makeApp();
    mountJsonRoute(app as any, route, {}, adapter);
    const res = makeRes();
    await app.handlers['POST /missing']!({ body: {}, query: {}, params: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'BAD_REQUEST', message: 'required' } });
  });

  it('maps a NOT_FOUND domain error to 404', async () => {
    const route = defineJsonRoute<void, unknown, unknown>({
      method: 'get',
      path: '/missing',
      parse: () => ok(undefined),
      handle: () => err(createApiError('NOT_FOUND', 'gone')),
    });
    const app = makeApp();
    mountJsonRoute(app as any, route, {}, adapter);
    const res = makeRes();
    await app.handlers['GET /missing']!({ body: {}, query: {}, params: {} }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'gone' } });
  });

  it('blocks cross-origin requests when requireSameOrigin is set', async () => {
    vi.mocked(isLocalSameOrigin).mockReturnValue(false);
    const route = defineJsonRoute<void, { secret: number }, unknown>({
      method: 'get',
      path: '/secret',
      requireSameOrigin: true,
      parse: () => ok(undefined),
      handle: () => ok({ secret: 42 }),
    });
    const app = makeApp();
    mountJsonRoute(app as any, route, {}, adapter);
    const res = makeRes();
    await app.handlers['GET /secret']!({ body: {}, query: {}, params: {} }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'cross-origin request rejected' },
    });
  });

  it('catches thrown handler errors as INTERNAL_ERROR (500)', async () => {
    const route = defineJsonRoute<void, unknown, unknown>({
      method: 'get',
      path: '/boom',
      parse: () => ok(undefined),
      handle: () => {
        throw new Error('boom');
      },
    });
    const app = makeApp();
    mountJsonRoute(app as any, route, {}, adapter);
    const res = makeRes();
    await app.handlers['GET /boom']!({ body: {}, query: {}, params: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });
  });

  it('passes deps through to the handler', async () => {
    interface Deps {
      tag: string;
    }
    const route = defineJsonRoute<void, { tag: string }, Deps>({
      method: 'get',
      path: '/deps',
      parse: () => ok(undefined),
      handle: (_input, deps) => ok({ tag: deps.tag }),
    });
    const app = makeApp();
    mountJsonRoute(app as any, route, { tag: 'injected' }, adapter);
    const res = makeRes();
    await app.handlers['GET /deps']!({ body: {}, query: {}, params: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ tag: 'injected' });
  });
});
