// The connector routes own OAuth credentials stored under the daemon data
// root, so every mutating handler is registered behind the local-daemon gate.
// `registerConnectorRoutes` used to default that gate to a pass-through:
//
//   const requireLocalDaemonRequest =
//     options.requireLocalDaemonRequest ?? ((_req, _res, next) => next());
//
// Production wires the real gate, so the fail-open default was latent defence
// debt — but any caller that forgot the option would have inherited
// credential-adjacent write routes with no gate at all. This spec pins the
// fail-closed behaviour: an omission must deny, and an injected gate must be
// the thing that governs the route.

import type http from 'node:http';
import express from 'express';
import type { Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  registerConnectorRoutes,
  type RegisterConnectorRoutesOptions,
} from '../src/connectors/routes.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function sendApiError(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ error: { code, message } });
}

async function buildApp(options: RegisterConnectorRoutesOptions): Promise<string> {
  const app = express();
  app.use(express.json());
  registerConnectorRoutes(app, options);
  return listen(app);
}

describe('connector local-daemon gate contract', () => {
  it('denies a mutating connector route when the gate was not supplied', async () => {
    // Unchecked caller: deliberately omits `requireLocalDaemonRequest`, which
    // is exactly the omission the pass-through default used to absorb.
    const baseUrl = await buildApp({
      sendApiError,
    } as unknown as RegisterConnectorRoutesOptions);

    const res = await fetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('lets the supplied gate govern the mutating route', async () => {
    const baseUrl = await buildApp({
      sendApiError,
      requireLocalDaemonRequest: (_req, res, _next) =>
        sendApiError(res, 403, 'TEST_GATE_DENIED', 'denied by the injected gate'),
    });

    const res = await fetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('TEST_GATE_DENIED');
  });
});