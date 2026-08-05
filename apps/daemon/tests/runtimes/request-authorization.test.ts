import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ToolTokenRegistry } from '../../src/tool-tokens.js';
import {
  createLocalDaemonRequestMiddleware,
  createToolAuthorizationHandlers,
} from '../../src/runtimes/request-authorization.js';
import type { sendApiError } from '../../src/http/api-errors.js';

type SendApiError = typeof sendApiError;

function fakeResponse(): Response {
  return {
    setHeader: vi.fn(),
  } as unknown as Response;
}

function fakeRequest(
  headers: Record<string, string | undefined>,
  remoteAddress = '127.0.0.1',
): Request {
  return {
    socket: { remoteAddress } as Request['socket'],
    get: vi.fn((name: string) => headers[name]),
    path: '/api/tools/test',
  } as unknown as Request;
}

describe('request authorization adapters', () => {
  it('rejects non-loopback requests before invoking the route', () => {
    const response = fakeResponse();
    const sendApiError = vi.fn((_res: Response) => response) as unknown as SendApiError;
    const next = vi.fn();

    createLocalDaemonRequestMiddleware(sendApiError)(
      fakeRequest({ host: '127.0.0.1:3000' }, '192.0.2.1'),
      response,
      next,
    );

    expect(sendApiError).toHaveBeenCalledWith(
      response,
      403,
      'FORBIDDEN',
      'request peer must be a loopback address',
      { details: { peer: 'remoteAddress' } },
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves loopback CORS headers and continues valid requests', () => {
    const response = fakeResponse();
    const sendApiError = vi.fn((_res: Response) => response) as unknown as SendApiError;
    const next = vi.fn();

    createLocalDaemonRequestMiddleware(sendApiError)(
      fakeRequest({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }),
      response,
      next,
    );

    expect(sendApiError).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns typed grants and maps invalid tool tokens at the HTTP boundary', () => {
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({
      runId: 'run-1',
      projectId: 'project-1',
      allowedEndpoints: ['/api/tools/test'],
      allowedOperations: ['live-artifacts:create'],
    });
    const response = fakeResponse();
    const sendApiError = vi.fn((_res: Response) => response) as unknown as SendApiError;
    const handlers = createToolAuthorizationHandlers(registry, sendApiError);

    expect(handlers.authorizeToolRequest(
      fakeRequest({ authorization: `Bearer ${grant.token}` }),
      response,
      'live-artifacts:create',
    )).toMatchObject({ runId: 'run-1', projectId: 'project-1' });
    expect(handlers.optionalToolGrantFromRequest(
      fakeRequest({ authorization: `Bearer ${grant.token}` }),
    )).toMatchObject({ runId: 'run-1' });

    expect(handlers.authorizeToolRequest(fakeRequest({ authorization: 'Bearer invalid' }), response, 'live-artifacts:create')).toBeNull();
    expect(sendApiError).toHaveBeenCalledWith(
      response,
      401,
      'TOOL_TOKEN_INVALID',
      'tool token is invalid or revoked',
      { details: { endpoint: '/api/tools/test', operation: 'live-artifacts:create' } },
    );
    registry.clear();
  });
});
