import express, { type RequestHandler } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerDiagnosticsExportRoutes } from '../src/diagnostics-export.js';

// #8382: the browser asks for the diagnostics bundle with POST so it attaches
// an `Origin` the local-request guard can check; the CLI and the desktop path
// keep GET. Both methods must reach the same handler and neither may skip the
// guard, because the bundle carries logs, host metadata and crash reports.

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function mount(admit: boolean) {
  const guard = vi.fn<RequestHandler>((_req, res, next) => {
    if (admit) next();
    else res.status(403).json({ error: { code: 'FORBIDDEN' } });
  });
  const handler = vi.fn<RequestHandler>((_req, res) => {
    res.type('application/zip').send('bundle');
  });
  const app = express();
  registerDiagnosticsExportRoutes(app, guard, handler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/diagnostics/export`;
  return { guard, handler, url };
}

describe('registerDiagnosticsExportRoutes (#8382)', () => {
  it('serves the same bundle on GET and POST', async () => {
    const { handler, url } = await mount(true);

    for (const method of ['GET', 'POST']) {
      const resp = await fetch(url, { method });
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe('bundle');
    }
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('runs the guard first on both methods and never reaches the handler when it rejects', async () => {
    const { guard, handler, url } = await mount(false);

    for (const method of ['GET', 'POST']) {
      const resp = await fetch(url, { method });
      expect(resp.status).toBe(403);
    }
    expect(guard).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalled();
  });
});
