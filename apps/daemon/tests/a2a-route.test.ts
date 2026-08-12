import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { buildOpenDesignAgentCard } from '../src/routes/a2a.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Open Design A2A routes', () => {
  it('declares bearer authentication when the remote daemon requires it', () => {
    const card = buildOpenDesignAgentCard('https://design.example', 'test', true);
    expect(card.securitySchemes.bearer?.scheme).toMatchObject({
      $case: 'httpAuthSecurityScheme',
      value: expect.objectContaining({ scheme: 'Bearer' }),
    });
    expect(card.securityRequirements).toEqual([{ schemes: { bearer: { list: [] } } }]);
  });

  it('publishes an A2A 1.0 Agent Card with the live JSON-RPC endpoint', async () => {
    const response = await fetch(`${baseUrl}/.well-known/agent-card.json`, {
      headers: { 'A2A-Version': '1.0' },
    });
    expect(response.status).toBe(200);
    const card = await response.json() as {
      name?: string;
      supportedInterfaces?: Array<{
        url?: string;
        protocolBinding?: string;
        protocolVersion?: string;
      }>;
      capabilities?: { streaming?: boolean; pushNotifications?: boolean };
    };
    expect(card.name).toBe('Open Design');
    expect(card.supportedInterfaces).toContainEqual(expect.objectContaining({
      url: `${baseUrl}/api/a2a`,
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
    }));
    expect(card.capabilities).toMatchObject({
      streaming: false,
      pushNotifications: false,
    });
  });

  it('accepts the A2A 1.0 JSON-RPC transport', async () => {
    const response = await fetch(`${baseUrl}/api/a2a`, {
      method: 'POST',
      headers: {
        'A2A-Version': '1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'route-smoke',
        method: 'GetTask',
        params: { id: 'missing-task' },
      }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      jsonrpc?: string;
      id?: string;
      error?: { message?: string };
    };
    expect(payload).toMatchObject({
      jsonrpc: '2.0',
      id: 'route-smoke',
      error: expect.objectContaining({ message: expect.any(String) }),
    });
  });
});
