import type { Server } from 'node:http';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerStrategyRolloutRoutes } from '../../src/routes/strategy-rollout.js';

describe('GET /api/strategies/od-next/rollout', () => {
  let server: Server | null = null;
  let baseUrl = '';

  const start = async (
    readOdNextPreference: () => Promise<{ odNextStrategyMode?: 'off' | 'observe' | 'active' | null }>,
  ) => {
    const app = express();
    app.use(express.json());
    registerStrategyRolloutRoutes(app, {
      requireLocalDaemonRequest: (_req, _res, next) => next(),
      readOdNextPreference,
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    const address = server!.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  };

  beforeEach(() => {
    // Historical preferences must not decide the new default.
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  });

  it.each(['off', 'observe', 'active'] as const)('ignores historical %s preference', async (mode) => {
    await start(async () => ({ odNextStrategyMode: mode }));
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout`);
    expect(response.status).toBe(200);
    expect((await response.json() as { status: unknown }).status).toMatchObject({
      requestedMode: 'active',
      requestedModeSource: 'default',
      effectiveMode: 'active',
    });
  });

  it('reports active/default when the installation genuinely configured nothing', async () => {
    await start(async () => ({}));
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout`);
    expect(response.status).toBe(200);
    expect((await response.json() as { status: unknown }).status).toMatchObject({
      requestedMode: 'active',
      requestedModeSource: 'default',
    });
  });

  it('offers no way to change the mode from here', async () => {
    // The reset this route used to expose existed only to lift a stop latch.
    // This endpoint remains read-only. Engineering env overrides own rollback.
    await start(async () => ({}));
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0 }),
    });
    expect(response.status).toBe(404);
  });

  it('fails instead of calling an unreadable config an unconfigured one', async () => {
    await start(async () => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout`);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await response.text()).not.toContain('"requestedModeSource":"default"');
  });
});
