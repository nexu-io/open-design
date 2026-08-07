import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVelaWalletSnapshotReader } from '../../src/integrations/vela-wallet.js';

let originalHome: string | undefined;
let originalProfile: string | undefined;
let testHome: string;

function seedWalletLogin(): void {
  const configFile = path.join(testHome, '.amr', 'config.json');
  mkdirSync(path.dirname(configFile), { recursive: true });
  writeFileSync(
    configFile,
    JSON.stringify({
      profiles: {
        local: {
          apiUrl: 'https://wallet.example.test',
          controlKey: 'ck-wallet-unit',
          runtimeKey: 'rt-wallet-unit',
          user: {
            id: 'wallet-unit-user',
            email: 'wallet-unit@example.com',
            plan: 'plus',
          },
        },
      },
    }),
    'utf8',
  );
}

beforeEach(() => {
  originalHome = process.env.HOME;
  originalProfile = process.env.OPEN_DESIGN_AMR_PROFILE;
  testHome = mkdtempSync(path.join(tmpdir(), 'od-vela-wallet-'));
  process.env.HOME = testHome;
  process.env.OPEN_DESIGN_AMR_PROFILE = 'local';
  seedWalletLogin();
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalProfile === undefined) delete process.env.OPEN_DESIGN_AMR_PROFILE;
  else process.env.OPEN_DESIGN_AMR_PROFILE = originalProfile;
  rmSync(testHome, { recursive: true, force: true });
});

describe('createVelaWalletSnapshotReader balance validation', () => {
  it.each([
    { label: 'missing', balanceUsd: undefined },
    { label: 'numeric', balanceUsd: 20 },
    { label: 'negative', balanceUsd: '-1.00' },
    { label: 'NaN', balanceUsd: 'NaN' },
    { label: 'infinite', balanceUsd: 'Infinity' },
    { label: 'exponent', balanceUsd: '1e2' },
  ])('rejects a $label balance when there is no valid cached snapshot', async ({ balanceUsd }) => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(balanceUsd === undefined ? {} : { balanceUsd }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const reader = createVelaWalletSnapshotReader({ fetch: fetchMock as typeof fetch });

    await expect(reader.read()).resolves.toMatchObject({
      status: 'unavailable',
      balanceUsd: null,
      source: 'unavailable',
      stale: false,
      error: { code: 'upstream' },
    });
  });

  it('serves the last valid snapshot as stale when a refresh returns an invalid balance', async () => {
    let responseBody: unknown = { balanceUsd: '20.00' };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const reader = createVelaWalletSnapshotReader({
      fetch: fetchMock as typeof fetch,
      ttlMs: 60_000,
    });

    await expect(reader.read()).resolves.toMatchObject({
      status: 'available',
      balanceUsd: '20.00',
      source: 'vela_api',
      stale: false,
    });
    responseBody = { balanceUsd: '-1.00' };

    await expect(reader.read({ refresh: true })).resolves.toMatchObject({
      status: 'available',
      balanceUsd: '20.00',
      source: 'daemon_cache',
      stale: true,
      error: { code: 'upstream' },
    });
  });
});
