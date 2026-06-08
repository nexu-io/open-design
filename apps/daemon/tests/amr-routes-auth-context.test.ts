import type http from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

const dataDir = process.env.OD_DATA_DIR as string;

function authHeaders(email: string): Record<string, string> {
  return { [DEFAULT_TRUSTED_EMAIL_HEADER]: email };
}

function jsonAuthHeaders(email: string): Record<string, string> {
  return {
    ...authHeaders(email),
    'content-type': 'application/json',
  };
}

async function putAppConfig(baseUrl: string, email: string, body: unknown): Promise<void> {
  const response = await fetch(`${baseUrl}/api/app-config`, {
    method: 'PUT',
    headers: jsonAuthHeaders(email),
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
}

async function postJson<T = unknown>(
  baseUrl: string,
  email: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}/api/integrations/vela/analytics-entry`, {
    method: 'POST',
    headers: {
      ...jsonAuthHeaders(email),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

function amrEntryPayload(entryId: string): Record<string, string> {
  return {
    pageName: 'open_design',
    sourcePageName: 'chat_panel',
    area: 'amr_entry',
    element: 'chat_error_recharge',
    action: 'click_amr_entry',
    entryId,
    sourceProduct: 'open_design',
    sourceDetail: 'chat_error_recharge',
    entryOccurredAt: '2026-06-03T12:00:00.000Z',
  };
}

describe('AMR routes auth context', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMultitenant: string | undefined;
  let originalAmrAnalyticsUrl: string | undefined;
  let originalAmrAnalyticsEnv: string | undefined;

  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    originalAmrAnalyticsUrl = process.env.OPEN_DESIGN_AMR_ANALYTICS_URL;
    originalAmrAnalyticsEnv = process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV;
    process.env.OD_MULTITENANT = '1';
    const started = (await startServer({
      port: 0,
      returnServer: true,
    })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'app-config.json'), { force: true });
  });

  afterEach(() => {
    if (originalAmrAnalyticsUrl === undefined) delete process.env.OPEN_DESIGN_AMR_ANALYTICS_URL;
    else process.env.OPEN_DESIGN_AMR_ANALYTICS_URL = originalAmrAnalyticsUrl;
    if (originalAmrAnalyticsEnv === undefined) delete process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV;
    else process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = originalAmrAnalyticsEnv;
  });

  it('uses the authenticated user app config for AMR analytics consent', async () => {
    await putAppConfig(baseUrl, 'alice@example.com', {
      telemetry: { metrics: false, content: false },
    });
    await putAppConfig(baseUrl, 'bob@example.com', {
      telemetry: { metrics: true, content: true },
    });

    const requests: unknown[] = [];
    const captureServer = createServer((req, res) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        requests.push(JSON.parse(raw));
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: 1 }));
      });
    });

    try {
      await new Promise<void>((resolve) => {
        captureServer.listen(0, '127.0.0.1', () => resolve());
      });
      const address = captureServer.address() as AddressInfo;
      process.env.OPEN_DESIGN_AMR_ANALYTICS_URL =
        `http://127.0.0.1:${address.port}/api/v1/analytics/events`;
      process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = 'test';

      const alice = await postJson<{ mirrored: boolean }>(
        baseUrl,
        'alice@example.com',
        { payload: amrEntryPayload('od-amr-entry-alice') },
        {
          'x-od-analytics-device-id': 'alice-device',
          'x-od-analytics-session-id': 'alice-session',
          'x-od-analytics-locale': 'en',
        },
      );
      expect(alice.status).toBe(202);
      expect(alice.body).toEqual({ mirrored: false });

      const bob = await postJson<{ mirrored: boolean; status: number }>(
        baseUrl,
        'bob@example.com',
        { payload: amrEntryPayload('od-amr-entry-bob') },
        {
          'x-od-analytics-device-id': 'bob-device',
          'x-od-analytics-session-id': 'bob-session',
          'x-od-analytics-locale': 'en',
        },
      );
      expect(bob.status).toBe(202);
      expect(bob.body).toEqual({ mirrored: true, status: 202 });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        events: [
          {
            common: {
              anonymousId: 'bob-device',
              sessionId: 'bob-session',
              env: 'test',
            },
            payload: {
              entryId: 'od-amr-entry-bob',
            },
          },
        ],
      });
    } finally {
      await new Promise<void>((resolve) => {
        captureServer.close(() => resolve());
      });
    }
  });
});
