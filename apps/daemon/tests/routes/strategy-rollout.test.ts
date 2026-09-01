// An unreadable app config must not be reported as an unconfigured one.
//
// `odNextStrategyMode` decides whether OD Next runs. `readAppConfig` already
// answers `{}` for the two states that legitimately mean "nothing configured"
// — no file, unparseable file — and throws only when the daemon genuinely
// cannot read its own config. Substituting `{}` for that throw would tell an
// operator the installation was never opted in, which is a claim about their
// choice rather than about this daemon's disk.
import type { Server } from 'node:http';

import Database from 'better-sqlite3';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerStrategyRolloutRoutes } from '../../src/routes/strategy-rollout.js';
import { migrateOdNextRolloutStore } from '../../src/strategies/od-next/rollout.js';

function analyticsStub() {
  return {
    capture: vi.fn().mockResolvedValue(undefined),
    captureSafety: vi.fn(),
    mergeAnonymousPerson: vi.fn(),
    identifyGroup: vi.fn(),
    shutdown: vi.fn(),
  } as never;
}

describe('GET /api/strategies/od-next/rollout', () => {
  let server: Server | null = null;
  let db: Database.Database | null = null;
  let baseUrl = '';

  const start = async (
    readOdNextPreference: () => Promise<{ odNextStrategyMode?: 'off' | 'observe' | 'active' | null }>,
  ) => {
    db = new Database(':memory:');
    migrateOdNextRolloutStore(db);
    const app = express();
    app.use(express.json());
    registerStrategyRolloutRoutes(app, {
      db,
      analytics: analyticsStub(),
      getAppVersion: () => '0.0.0',
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
    db?.close();
    db = null;
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

  it('reports off/default when the installation genuinely configured nothing', async () => {
    await start(async () => ({}));
    const response = await fetch(`${baseUrl}/api/strategies/od-next/rollout`);
    expect(response.status).toBe(200);
    expect((await response.json() as { status: unknown }).status).toMatchObject({
      requestedMode: 'off',
      requestedModeSource: 'default',
    });
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
