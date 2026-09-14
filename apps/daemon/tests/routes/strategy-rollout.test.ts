// An unreadable app config must not be reported as an unconfigured one.
//
// `odNextStrategyMode` decides whether OD Next runs. `readAppConfig` already
// answers `{}` for the two states that legitimately mean "nothing configured"
// — no file, unparseable file — and throws only when the daemon genuinely
// cannot read its own config. Substituting `{}` for that throw would tell an
// operator the installation was never opted in, which is a claim about their
// choice rather than about this daemon's disk.
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
    // Env must not decide the mode for these cases; the saved preference is
    // the thing under test.
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  });

  it('reports the saved mode and the authority that set it', async () => {
    await start(async () => ({ odNextStrategyMode: 'active' }));
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout`);
    expect(response.status).toBe(200);
    expect((await response.json() as { status: unknown }).status).toMatchObject({
      requestedMode: 'active',
      requestedModeSource: 'app_config',
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

  it('reports the saved off an installation opted into, not the default', async () => {
    // `default` and a saved `off` now resolve to opposite modes, so the source
    // is what tells an operator whether this daemon is on OD Next because
    // nobody touched it or off it because somebody asked.
    await start(async () => ({ odNextStrategyMode: 'off' }));
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout`);
    expect(response.status).toBe(200);
    expect((await response.json() as { status: unknown }).status).toMatchObject({
      requestedMode: 'off',
      requestedModeSource: 'app_config',
      effectiveMode: 'off',
    });
  });

  it('offers no way to change the mode from here', async () => {
    // The reset this route used to expose existed only to lift a stop latch.
    // With the latch gone there is nothing here to write, and the one way to
    // turn OD Next off is `PUT /api/app-config` — which is also the one place
    // a typo is refused rather than absorbed.
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
