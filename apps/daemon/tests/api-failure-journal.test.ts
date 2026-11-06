import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRecentApiFailures,
  readRecentApiFailures,
  recordApiFailure,
} from '../src/http/api-failure-journal.js';
import { sendApiError } from '../src/http/api-errors.js';

function responseForRoute(routePath: unknown, originalUrl: string, baseUrl = ''): Response {
  const request = {
    method: 'GET',
    originalUrl,
    url: originalUrl,
    baseUrl,
    route: routePath === undefined ? undefined : { path: routePath },
  } as Request;
  const response = {
    req: request,
    status: () => response,
    json: () => response,
  } as unknown as Response;
  return response;
}

describe('API failure diagnostics journal', () => {
  beforeEach(() => {
    clearRecentApiFailures();
  });

  it('retains bounded pre-run failure metadata without query strings or resource identifiers', () => {
    for (let index = 0; index < 105; index += 1) {
      recordApiFailure({
        at: `2026-08-12T03:57:${String(index % 60).padStart(2, '0')}Z`,
        request: {
          method: 'POST',
          route: { path: '/api/projects/:id/runs' },
        },
        status: 401,
        code: 'AMR_AUTH_REQUIRED',
        retryable: false,
        requestId: `request-${index}`,
      });
    }

    const failures = readRecentApiFailures();
    expect(failures).toHaveLength(100);
    expect(failures[0]?.requestId).toBe('request-5');
    expect(failures.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/projects/:id/runs',
      status: 401,
      code: 'AMR_AUTH_REQUIRED',
      retryable: false,
      requestId: 'request-104',
    });
    expect(JSON.stringify(failures)).not.toContain('prompt');
    expect(JSON.stringify(failures)).not.toContain('550e8400');
  });

  it('returns snapshots that callers cannot mutate', () => {
    recordApiFailure({
      at: '2026-08-12T03:57:36Z',
      request: {
        method: 'GET',
        route: { path: '/api/workspace/directory' },
      },
      status: 401,
      code: 'AMR_AUTH_REQUIRED',
      retryable: false,
    });

    const first = readRecentApiFailures();
    first.length = 0;
    expect(readRecentApiFailures()).toHaveLength(1);
  });

  it.each([
    {
      label: 'short connector id',
      routePath: '/api/connectors/:connectorId',
      originalUrl: '/api/connectors/private-crm',
      expected: '/api/connectors/:connectorId',
      privateValue: 'private-crm',
    },
    {
      label: 'filename',
      routePath: '/api/projects/:id/files/:fileName',
      originalUrl: '/api/projects/client-alpha/files/customer-notes.md',
      expected: '/api/projects/:id/files/:fileName',
      privateValue: 'customer-notes.md',
    },
    {
      label: 'short logo slug',
      routePath: '/api/connectors/logos/:slug',
      originalUrl: '/api/connectors/logos/acme',
      expected: '/api/connectors/logos/:slug',
      privateValue: 'acme',
    },
    {
      label: 'mounted router resource id',
      routePath: '/resources/:resourceId',
      originalUrl: '/api/workspaces/customer-success/resources/q3-plan',
      baseUrl: '/api/workspaces/customer-success',
      expected: '/api/:mounted/resources/:resourceId',
      privateValue: 'customer-success',
    },
  ])('records the declared route template instead of a user-controlled $label', ({
    routePath,
    originalUrl,
    baseUrl,
    expected,
    privateValue,
  }) => {
    sendApiError(
      responseForRoute(routePath, originalUrl, baseUrl),
      404,
      'NOT_FOUND',
      'not found',
    );

    expect(readRecentApiFailures()).toHaveLength(1);
    expect(readRecentApiFailures()[0]?.path).toBe(expected);
    expect(JSON.stringify(readRecentApiFailures())).not.toContain(privateValue);
  });

  it('uses a fixed marker when no Express route metadata is available', () => {
    sendApiError(
      responseForRoute(undefined, '/api/connectors/private-crm'),
      404,
      'NOT_FOUND',
      'not found',
    );

    expect(readRecentApiFailures()[0]?.path).toBe('/api/:unmatched');
    expect(JSON.stringify(readRecentApiFailures())).not.toContain('private-crm');
  });
});
