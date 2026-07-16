// HTTP-level coverage for the AMR (vela) integration routes.
//
// Boots the real daemon Express app on a random port (same shape as
// memory-config-route.test.ts) and exercises the three endpoints from the
// outside — `/api/integrations/vela/{status,login,logout}` — so the Settings
// AmrLoginPill provider helpers, the spawn lifecycle, and the
// ~/.amr/config.json projection all stay in lockstep.
//
// HOME is redirected to a tmpdir per test so the suite never touches the
// developer's real `~/.amr/config.json`. VELA_BIN points at the
// `tests/fixtures/fake-vela.mjs` stub, which handles the `login` argv by
// writing the config file with the active VELA_PROFILE and exiting 0 —
// mirroring real vela's on-disk side-effect without the device-auth loop.

import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startServer } from '../../src/server.js';
import { readAppConfig, writeAppConfig } from '../../src/app-config.js';
import {
  clearAllVelaLiveAccounts,
  clearVelaLiveAccountRefreshThrottle,
  parseAmrEntryAnalyticsPayload,
  parseAmrOnboardingProfileAnalyticsPayload,
  readVelaCredentialRevision,
  velaLiveAccountCacheKey,
} from '../../src/integrations/vela.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_VELA = path.resolve(HERE, '..', 'fixtures', 'fake-vela.mjs');

let baseUrl: string;
let server: http.Server;
let originalHome: string | undefined;
let tmpHome: string;

async function getJson<T = unknown>(url: string): Promise<{ status: number; body: T }> {
  const resp = await fetch(url);
  const parsedBody = (await resp.json()) as T;
  return { status: resp.status, body: parsedBody };
}

async function postJson<T = unknown>(
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const init: RequestInit = {
    method: 'POST',
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(url, init);
  const parsedBody = (await resp.json()) as T;
  return { status: resp.status, body: parsedBody };
}

async function waitForAmrModels(
  expectedSource: 'preset' | 'remote',
  timeoutMs = 5_000,
): Promise<{ status: number; body: { source: 'preset' | 'remote'; models: Array<{ id: string }> } }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await getJson<{
      source: 'preset' | 'remote';
      models: Array<{ id: string }>;
    }>(`${baseUrl}/api/amr/models`);
    if (response.body.source === expectedSource) return response;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for /api/amr/models source=${expectedSource}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function waitForVelaLoginIdle(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await getJson<{ loginInFlight: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    if (!response.body.loginInFlight) return;
    if (Date.now() >= deadline) {
      throw new Error('timed out waiting for vela login subprocess to become idle');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function configPath(): string {
  return path.join(tmpHome, '.amr', 'config.json');
}

function legacyVelaConfigPath(): string {
  return path.join(tmpHome, '.vela', 'config.json');
}

function seedLogin(profile: string, payload: Record<string, unknown> = {}): void {
  const dir = path.dirname(configPath());
  mkdirSync(dir, { recursive: true });
  const full = {
    profiles: {
      [profile]: {
        runtimeKey: 'rt-seeded-key',
        controlKey: 'ck-seeded-key',
        apiUrl: 'http://localhost:18080',
        linkUrl: 'http://localhost:18081',
        user: {
          id: 'user-seed',
          email: 'seed@example.com',
          plan: 'free',
          ...((payload.user as Record<string, unknown>) ?? {}),
        },
        ...payload,
      },
    },
  };
  writeFileSync(configPath(), JSON.stringify(full, null, 2), 'utf8');
}

async function setSettingsAmrEnv(extra: Record<string, string | undefined>): Promise<void> {
  const dataDir = process.env.OD_DATA_DIR as string;
  const cfg = await readAppConfig(dataDir);
  const amr: Record<string, string> = {
    ...((cfg.agentCliEnv?.amr as Record<string, string>) ?? {}),
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete amr[key];
    else amr[key] = value;
  }
  await writeAppConfig(dataDir, {
    ...cfg,
    agentCliEnv: { ...(cfg.agentCliEnv ?? {}), amr },
  });
}

async function startWalletApi(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>,
): Promise<{ close: () => Promise<void>; requests: string[]; url: string }> {
  const requests: string[] = [];
  const walletServer = createServer((req, res) => {
    requests.push(req.headers.authorization ?? '');
    void Promise.resolve(handler(req, res)).catch((err) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
  await new Promise<void>((resolve) => walletServer.listen(0, '127.0.0.1', resolve));
  const address = walletServer.address() as AddressInfo;
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => walletServer.close(() => resolve())),
  };
}

async function waitForFile(file: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(file)) return;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

beforeAll(async () => {
  // The login route resolves the vela binary through the daemon's
  // `agentCliEnvForAgent` projection of `app-config.json` (NOT process.env),
  // so we have to persist the fake binary path through the app-config file
  // before any test calls /login. Without this the route would fall through
  // to `resolveOnPath('vela')` and spawn the developer's real vela.
  const dataDir = process.env.OD_DATA_DIR as string;
  const config = await readAppConfig(dataDir);
  await writeAppConfig(dataDir, {
    ...config,
    agentCliEnv: {
      ...(config.agentCliEnv ?? {}),
      amr: {
        ...((config.agentCliEnv?.amr as Record<string, string>) ?? {}),
        VELA_BIN: FAKE_VELA,
      },
    },
  });
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  originalHome = process.env.HOME;
  tmpHome = mkdtempSync(path.join(tmpdir(), 'od-vela-routes-'));
  process.env.HOME = tmpHome;
  process.env.OPEN_DESIGN_AMR_PROFILE = 'local';
  process.env.VELA_PROFILE = 'prod';
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  delete process.env.OPEN_DESIGN_AMR_PROFILE;
  delete process.env.VELA_PROFILE;
  delete process.env.FAKE_VELA_LOGIN_DELAY_MS;
  delete process.env.FAKE_VELA_LOGIN_FAIL;
  delete process.env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL;
  delete process.env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL_DELAY_MS;
  delete process.env.OD_AMR_LOGIN_ACTIVATION_GRACE_MS;
  delete process.env.FAKE_VELA_LOGIN_USER_EMAIL;
  delete process.env.FAKE_VELA_LOGIN_USER_PLAN;
  delete process.env.FAKE_VELA_BILLING_TIER;
  delete process.env.FAKE_VELA_BILLING_BALANCE_USD;
  delete process.env.FAKE_VELA_BILLING_LOG;
  delete process.env.FAKE_VELA_BILLING_DELAY_MS;
  delete process.env.FAKE_VELA_BILLING_UNKNOWN_COMMAND;
  delete process.env.FAKE_VELA_MODEL_LIST_JSON;
  delete process.env.FAKE_VELA_MODEL_PRESET_JSON;
  delete process.env.FAKE_VELA_ENV_DUMP_PATH;
  delete process.env.OD_PUBLIC_BASE_URL;
  delete process.env.VELA_RUNTIME_KEY;
  delete process.env.VELA_LINK_URL;
  delete process.env.OPEN_DESIGN_AMR_ANALYTICS_URL;
  delete process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV;
  delete process.env.OD_AMR_WALLET_FETCH_TIMEOUT_MS;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('GET /api/integrations/vela/wallet', () => {
  it('returns signed_out without reading an upstream wallet API', async () => {
    const walletApi = await startWalletApi((_req, res) => {
      res.statusCode = 500;
      res.end('must not be called');
    });
    try {
      const { status, body } = await getJson<{
        status: string;
        balanceUsd: string | null;
        error?: { code: string };
      }>(`${baseUrl}/api/integrations/vela/wallet`);

      expect(status).toBe(200);
      expect(body.status).toBe('signed_out');
      expect(body.balanceUsd).toBeNull();
      expect(body.error?.code).toBe('signed_out');
      expect(walletApi.requests).toEqual([]);
    } finally {
      await walletApi.close();
    }
  });

  it('fetches the AMR wallet balance with the local control key and caches it briefly', async () => {
    const walletApi = await startWalletApi((req, res) => {
      expect(req.url).toBe('/api/v1/wallet/balance');
      expect(req.headers.authorization).toBe('Bearer ck-wallet-balance');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        balanceUsd: '0.1000',
        updatedAt: '2026-06-23T06:05:18.782Z',
      }));
    });
    seedLogin('local', {
      apiUrl: walletApi.url,
      controlKey: 'ck-wallet-balance',
      runtimeKey: 'rt-wallet-balance',
      user: { id: 'wallet-user', email: 'wallet@example.com', plan: 'free' },
    });
    try {
      const first = await getJson<{
        balanceUsd: string | null;
        source: string;
        status: string;
        user: { email?: string } | null;
      }>(`${baseUrl}/api/integrations/vela/wallet`);
      const second = await getJson<{ balanceUsd: string | null; source: string }>(
        `${baseUrl}/api/integrations/vela/wallet`,
      );

      expect(first.status).toBe(200);
      expect(first.body.status).toBe('available');
      expect(first.body.balanceUsd).toBe('0.1000');
      expect(first.body.source).toBe('vela_api');
      expect(first.body.user?.email).toBe('wallet@example.com');
      expect(second.body.balanceUsd).toBe('0.1000');
      expect(second.body.source).toBe('daemon_cache');
      expect(walletApi.requests).toEqual(['Bearer ck-wallet-balance']);
      expect(JSON.stringify(first.body)).not.toContain('ck-wallet-balance');
      expect(JSON.stringify(first.body)).not.toContain('rt-wallet-balance');
    } finally {
      await walletApi.close();
    }
  });

  it('invalidates the AMR model catalog cache on explicit wallet refresh', async () => {
    const walletApi = await startWalletApi((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        balanceUsd: '20.0000',
        updatedAt: '2026-07-09T07:30:00.000Z',
      }));
    });
    process.env.FAKE_VELA_MODEL_LIST_JSON = JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_deepseek_v4_flash', enabled: false },
      ],
    });
    seedLogin('local', {
      apiUrl: walletApi.url,
      controlKey: 'ck-wallet-refresh',
      runtimeKey: 'rt-wallet-refresh',
      user: { id: 'wallet-user', email: 'wallet@example.com', plan: 'free' },
    });
    try {
      const warmed = await waitForAmrModels('remote');
      expect(warmed.body.models).toEqual([
        { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: false },
      ]);

      const refresh = await getJson<{ status: string; balanceUsd: string | null }>(
        `${baseUrl}/api/integrations/vela/wallet?refresh=1`,
      );
      expect(refresh.status).toBe(200);
      expect(refresh.body.status).toBe('available');

      const afterRefresh = await getJson<{
        source: 'preset' | 'remote';
        refreshing?: boolean;
        models: Array<{ id: string }>;
      }>(`${baseUrl}/api/amr/models`);
      expect(afterRefresh.status).toBe(200);
      expect(afterRefresh.body.source).toBe('preset');
      expect(afterRefresh.body.refreshing).toBe(true);
      expect(afterRefresh.body.models.map((model) => model.id)).toEqual([
        'deepseek-v4-flash',
        'deepseek-v3.2',
        'gemini-2.5-flash',
        'glm-5.1',
      ]);
    } finally {
      await walletApi.close();
    }
  });

  it('invalidates the AMR model catalog cache when a forced status refresh observes a plan change', async () => {
    process.env.FAKE_VELA_BILLING_TIER = 'free';
    process.env.FAKE_VELA_BILLING_BALANCE_USD = '1.00';
    process.env.FAKE_VELA_MODEL_LIST_JSON = JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_deepseek_v4_flash', enabled: false },
      ],
    });
    seedLogin('local', {
      controlKey: 'ck-status-refresh',
      runtimeKey: 'rt-status-refresh',
      user: { id: 'status-user', email: 'status@example.com', plan: 'free' },
    });

    const firstStatus = await getJson<{ account?: { plan?: string } }>(
      `${baseUrl}/api/integrations/vela/status?refresh=1`,
    );
    expect(firstStatus.status).toBe(200);
    expect(firstStatus.body.account?.plan).toBe('free');

    const warmed = await waitForAmrModels('remote');
    expect(warmed.body.models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: false },
    ]);

    process.env.FAKE_VELA_BILLING_TIER = 'pro';
    const upgradedStatus = await getJson<{ account?: { plan?: string } }>(
      `${baseUrl}/api/integrations/vela/status?refresh=1`,
    );
    expect(upgradedStatus.status).toBe(200);
    expect(upgradedStatus.body.account?.plan).toBe('pro');

    const afterPlanChange = await getJson<{
      source: 'preset' | 'remote';
      refreshing?: boolean;
      models: Array<{ id: string }>;
    }>(`${baseUrl}/api/amr/models`);
    expect(afterPlanChange.status).toBe(200);
    expect(afterPlanChange.body.source).toBe('preset');
    expect(afterPlanChange.body.refreshing).toBe(true);
  });

  it('invalidates the AMR model catalog cache on forced status refresh without a prior account snapshot', async () => {
    process.env.FAKE_VELA_BILLING_TIER = 'pro';
    process.env.FAKE_VELA_BILLING_BALANCE_USD = '1.00';
    process.env.FAKE_VELA_MODEL_LIST_JSON = JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_deepseek_v4_flash', enabled: false },
      ],
    });
    seedLogin('local', {
      controlKey: 'ck-status-refresh-cold-account',
      runtimeKey: 'rt-status-refresh-cold-account',
      user: {
        id: 'status-cold-account-user',
        email: 'status-cold-account@example.com',
        plan: 'pro',
      },
    });

    const warmed = await waitForAmrModels('remote');
    expect(warmed.body.models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: false },
    ]);

    clearAllVelaLiveAccounts();
    const refreshedStatus = await getJson<{ account?: { plan?: string } }>(
      `${baseUrl}/api/integrations/vela/status?refresh=1`,
    );
    expect(refreshedStatus.status).toBe(200);
    expect(refreshedStatus.body.account?.plan).toBe('pro');

    const afterRefresh = await getJson<{
      source: 'preset' | 'remote';
      refreshing?: boolean;
      models: Array<{ id: string }>;
    }>(`${baseUrl}/api/amr/models`);
    expect(afterRefresh.status).toBe(200);
    expect(afterRefresh.body.source).toBe('preset');
    expect(afterRefresh.body.refreshing).toBe(true);
  });

  it('preserves model-cache invalidation when forced status refresh joins an in-flight probe', async () => {
    clearAllVelaLiveAccounts();
    process.env.FAKE_VELA_BILLING_TIER = 'free';
    process.env.FAKE_VELA_BILLING_BALANCE_USD = '1.00';
    process.env.FAKE_VELA_MODEL_LIST_JSON = JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_deepseek_v4_flash', enabled: false },
      ],
    });
    seedLogin('local', {
      controlKey: 'ck-status-refresh-inflight',
      runtimeKey: 'rt-status-refresh-inflight',
      user: { id: 'status-inflight-user', email: 'status-inflight@example.com', plan: 'free' },
    });

    const firstStatus = await getJson<{ account?: { plan?: string } }>(
      `${baseUrl}/api/integrations/vela/status?refresh=1`,
    );
    expect(firstStatus.status).toBe(200);
    expect(firstStatus.body.account?.plan).toBe('free');

    const warmed = await waitForAmrModels('remote');
    expect(warmed.body.models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: false },
    ]);

    const accountCacheKey = velaLiveAccountCacheKey(
      readVelaCredentialRevision(process.env, {}),
    );
    clearVelaLiveAccountRefreshThrottle(accountCacheKey);
    process.env.FAKE_VELA_BILLING_TIER = 'pro';
    process.env.FAKE_VELA_BILLING_DELAY_MS = '150';

    const warmStatus = getJson<{ account?: { plan?: string } }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    const forcedStatus = await getJson<{ account?: { plan?: string } }>(
      `${baseUrl}/api/integrations/vela/status?refresh=1`,
    );
    expect((await warmStatus).body.account?.plan).toBe('free');
    expect(forcedStatus.status).toBe(200);
    expect(forcedStatus.body.account?.plan).toBe('pro');

    const afterPlanChange = await getJson<{
      source: 'preset' | 'remote';
      refreshing?: boolean;
      models: Array<{ id: string }>;
    }>(`${baseUrl}/api/amr/models`);
    expect(afterPlanChange.status).toBe(200);
    expect(afterPlanChange.body.source).toBe('preset');
    expect(afterPlanChange.body.refreshing).toBe(true);
  });

  it('does not serve a cached wallet balance after the control key is rejected', async () => {
    let requestCount = 0;
    const walletApi = await startWalletApi((_req, res) => {
      requestCount += 1;
      res.setHeader('content-type', 'application/json');
      if (requestCount === 1) {
        res.end(JSON.stringify({
          balanceUsd: '0.1000',
          updatedAt: '2026-06-23T06:05:18.782Z',
        }));
        return;
      }
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'unauthenticated' }));
    });
    seedLogin('local', {
      apiUrl: walletApi.url,
      controlKey: 'ck-revoked-wallet',
      runtimeKey: 'rt-wallet-balance',
      user: { id: 'wallet-user', email: 'wallet@example.com', plan: 'free' },
    });
    try {
      const first = await getJson<{
        balanceUsd: string | null;
        source: string;
        status: string;
      }>(`${baseUrl}/api/integrations/vela/wallet`);
      const second = await getJson<{
        balanceUsd: string | null;
        error?: { code: string; message: string };
        source: string;
        status: string;
      }>(`${baseUrl}/api/integrations/vela/wallet?refresh=1`);

      expect(first.body.status).toBe('available');
      expect(first.body.balanceUsd).toBe('0.1000');
      expect(first.body.source).toBe('vela_api');
      expect(second.body.status).toBe('unavailable');
      expect(second.body.balanceUsd).toBeNull();
      expect(second.body.source).toBe('unavailable');
      expect(second.body.error?.code).toBe('unauthorized');
      expect(second.body.error?.message).toMatch(/sign in again/i);
    } finally {
      await walletApi.close();
    }
  });

  it('reports missing_control_key instead of showing zero when only a runtime key is present', async () => {
    seedLogin('local', {
      controlKey: '',
      runtimeKey: 'rt-without-control',
      user: { id: 'wallet-user', email: 'wallet@example.com' },
    });

    const { status, body } = await getJson<{
      status: string;
      balanceUsd: string | null;
      error?: { code: string };
    }>(`${baseUrl}/api/integrations/vela/wallet?refresh=1`);

    expect(status).toBe(200);
    expect(body.status).toBe('unavailable');
    expect(body.balanceUsd).toBeNull();
    expect(body.error?.code).toBe('missing_control_key');
  });

  it('bounds a stalled upstream wallet request and returns a recoverable network snapshot', async () => {
    process.env.OD_AMR_WALLET_FETCH_TIMEOUT_MS = '25';
    const walletApi = await startWalletApi((_req, _res) => {
      // Intentionally leave the request open so the daemon timeout owns the boundary.
    });
    seedLogin('local', {
      apiUrl: walletApi.url,
      controlKey: 'ck-stalled-wallet',
      runtimeKey: 'rt-wallet-balance',
      user: { id: 'wallet-user', email: 'wallet@example.com', plan: 'free' },
    });
    try {
      const startedAt = Date.now();
      const { status, body } = await getJson<{
        balanceUsd: string | null;
        error?: { code: string; message: string };
        source: string;
        status: string;
      }>(`${baseUrl}/api/integrations/vela/wallet?refresh=1`);

      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(status).toBe(200);
      expect(body.status).toBe('unavailable');
      expect(body.balanceUsd).toBeNull();
      expect(body.source).toBe('unavailable');
      expect(body.error?.code).toBe('network');
      expect(body.error?.message).toMatch(/temporarily unavailable/i);
      expect(walletApi.requests).toEqual(['Bearer ck-stalled-wallet']);
    } finally {
      await walletApi.close();
    }
  });
});

describe('GET /api/integrations/vela/status', () => {
  it('reports loggedIn=false when ~/.amr/config.json is absent', async () => {
    const { status, body } = await getJson<{
      loggedIn: boolean;
      loginInFlight: boolean;
      profile: string;
      user: { email?: string } | null;
      configPath: string;
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(status).toBe(200);
    expect(body.loggedIn).toBe(false);
    expect(body.loginInFlight).toBe(false);
    expect(body.profile).toBe('local');
    expect(body.user).toBeNull();
    // configPath must point inside the temp HOME so the suite never leaks
    // into the developer's real config file.
    expect(body.configPath.startsWith(tmpHome)).toBe(true);
    expect(body.configPath).toContain('/.amr/');
  });

  it('ignores legacy ~/.vela/config.json when reporting AMR status', async () => {
    const legacyPath = legacyVelaConfigPath();
    mkdirSync(path.dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        profiles: {
          local: {
            runtimeKey: 'rt-legacy',
            user: { id: 'legacy-user', email: 'legacy@example.com' },
          },
        },
      }),
      'utf8',
    );

    const { status, body } = await getJson<{
      loggedIn: boolean;
      user: { email?: string } | null;
      configPath: string;
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(status).toBe(200);
    expect(body.loggedIn).toBe(false);
    expect(body.user).toBeNull();
    expect(body.configPath).toContain('/.amr/');
  });

  it('reports Settings-configured AMR env credentials as logged in', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          VELA_RUNTIME_KEY: 'rt-env-secret',
          VELA_LINK_URL: 'https://openrouter.example/v1',
        },
      },
    });
    try {
      const { status, body } = await getJson<{
        loggedIn: boolean;
        user: { email?: string } | null;
      }>(`${baseUrl}/api/integrations/vela/status`);
      expect(status).toBe(200);
      expect(body.loggedIn).toBe(true);
      expect(body.user).toBeNull();
      expect(JSON.stringify(body)).not.toContain('rt-env-secret');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('reports daemon-process AMR env credentials as logged in', async () => {
    process.env.VELA_RUNTIME_KEY = 'rt-process-secret';
    process.env.VELA_LINK_URL = 'https://openrouter.example/v1';

    const { status, body } = await getJson<{
      loggedIn: boolean;
      user: { email?: string } | null;
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(status).toBe(200);
    expect(body.loggedIn).toBe(true);
    expect(body.user).toBeNull();
    expect(JSON.stringify(body)).not.toContain('rt-process-secret');
  });

  it('reports status for the Settings-configured AMR profile', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    seedLogin('local', {
      user: { id: 'local-user', email: 'settings-local@example.com' },
    });
    const cfg = JSON.parse(readFileSync(configPath(), 'utf8'));
    cfg.profiles.prod = {};
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
    process.env.OPEN_DESIGN_AMR_PROFILE = 'prod';
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          OPEN_DESIGN_AMR_PROFILE: 'local',
        },
      },
    });
    try {
      const { status, body } = await getJson<{
        loggedIn: boolean;
        profile: string;
        user: { email?: string } | null;
      }>(`${baseUrl}/api/integrations/vela/status`);
      expect(status).toBe(200);
      expect(body.loggedIn).toBe(true);
      expect(body.profile).toBe('local');
      expect(body.user?.email).toBe('settings-local@example.com');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('keeps Settings-configured AMR env, profile, status, and model catalog in sync', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    process.env.OPEN_DESIGN_AMR_PROFILE = 'prod';
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          OPEN_DESIGN_AMR_PROFILE: 'local',
          VELA_RUNTIME_KEY: 'rt-settings-risk-smoke',
          VELA_LINK_URL: 'http://localhost:18081',
        },
      },
    });

    try {
      const statusResponse = await getJson<{
        loggedIn: boolean;
        profile: string;
        user: { email?: string } | null;
      }>(`${baseUrl}/api/integrations/vela/status`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toMatchObject({
        loggedIn: true,
        profile: 'local',
        user: null,
      });
      expect(JSON.stringify(statusResponse.body)).not.toContain('rt-settings-risk-smoke');

      const modelsResponse = await waitForAmrModels('remote');
      expect(modelsResponse.status).toBe(200);
      expect(modelsResponse.body.models.map((model) => model.id)).toContain('deepseek-v4-flash');
      expect(modelsResponse.body.models.map((model) => model.id)).toContain('gpt-5.4');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('reports loggedIn=true with the surfaced user fields when the active profile has a runtimeKey', async () => {
    seedLogin('local', {
      user: {
        id: 'u1',
        email: 'leaf@example.com',
        name: '杨瑾龙',
        plan: 'free',
      },
    });
    const { body } = await getJson<{
      loggedIn: boolean;
      user: { email?: string; plan?: string; name?: string } | null;
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(body.loggedIn).toBe(true);
    expect(body.user?.email).toBe('leaf@example.com');
    expect(body.user?.plan).toBe('free');
    expect(body.user?.name).toBe('杨瑾龙');
  });

  it('blocks the first signed-in /status on a cold cache and surfaces the fetched plan + balance', async () => {
    // Regression: the new account surfaces read /status once and do not
    // re-poll, so a cold cache must resolve live billing BEFORE the first
    // response — otherwise plan/balance stay hidden until the user refocuses.
    clearAllVelaLiveAccounts();
    process.env.FAKE_VELA_BILLING_TIER = 'plus';
    process.env.FAKE_VELA_BILLING_BALANCE_USD = '247.51';
    // Config carries no plan, so plan/balance can only come from the live fetch.
    seedLogin('local', {
      user: { id: 'cold-1', email: 'cold@example.com', plan: undefined },
    });
    const { body } = await getJson<{
      loggedIn: boolean;
      user: { email?: string } | null;
      account?: { plan?: string; balanceUsd?: string | null };
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(body.loggedIn).toBe(true);
    // Env-/config-identity stays on `user`; live billing rides on `account`.
    expect(body.account?.plan).toBe('plus');
    expect(body.account?.balanceUsd).toBe('247.51');
  });

  it('normalizes a successful billing summary without a tier to free (upgradeable)', async () => {
    // membershipTier is omitted for free accounts; a successful read must still
    // surface a concrete plan so the UI shows it AND keeps the Upgrade CTA.
    clearAllVelaLiveAccounts();
    // Balance set, tier unset → fake-vela returns balanceUsd with NO membershipTier.
    process.env.FAKE_VELA_BILLING_BALANCE_USD = '0.00';
    seedLogin('local', {
      user: { id: 'free-1', email: 'free@example.com', plan: undefined },
    });
    const { body } = await getJson<{
      loggedIn: boolean;
      account?: { plan?: string; balanceUsd?: string | null };
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(body.loggedIn).toBe(true);
    expect(body.account?.plan).toBe('free');
    expect(body.account?.balanceUsd).toBe('0.00');
  });

  it('keeps failed live billing reads throttled for repeated status polls', async () => {
    clearAllVelaLiveAccounts();
    const billingLog = path.join(tmpHome, 'billing-summary.log');
    process.env.FAKE_VELA_BILLING_LOG = billingLog;
    // Leave FAKE_VELA_BILLING_* unset so fake-vela exits non-zero for the
    // optional live billing read.
    seedLogin('local', {
      user: { id: 'backoff-1', email: 'backoff@example.com', plan: undefined },
    });

    const first = await getJson<{
      loggedIn: boolean;
      account?: { plan?: string; balanceUsd?: string | null };
    }>(`${baseUrl}/api/integrations/vela/status`);
    const second = await getJson<{
      loggedIn: boolean;
      account?: { plan?: string; balanceUsd?: string | null };
    }>(`${baseUrl}/api/integrations/vela/status`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.loggedIn).toBe(true);
    expect(second.body.loggedIn).toBe(true);
    expect(first.body.account).toBeUndefined();
    expect(second.body.account).toBeUndefined();
    const attempts = existsSync(billingLog)
      ? readFileSync(billingLog, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    expect(attempts).toHaveLength(1);
  });

  it('keeps signed-in status usable when old vela CLI lacks billing commands', async () => {
    clearAllVelaLiveAccounts();
    process.env.FAKE_VELA_BILLING_UNKNOWN_COMMAND = '1';
    seedLogin('local', {
      user: { id: 'old-cli-1', email: 'old-cli@example.com', plan: undefined },
    });

    const { status, body } = await getJson<{
      loggedIn: boolean;
      user: { email?: string } | null;
      account?: { plan?: string; balanceUsd?: string | null };
    }>(`${baseUrl}/api/integrations/vela/status`);

    expect(status).toBe(200);
    expect(body.loggedIn).toBe(true);
    expect(body.user?.email).toBe('old-cli@example.com');
    expect(body.account).toBeUndefined();
  });

  it('uses the same Settings-backed credential for billing fetch and live-account cache key', async () => {
    clearAllVelaLiveAccounts();
    const billingLog = path.join(tmpHome, 'billing-summary-env.log');
    process.env.FAKE_VELA_BILLING_LOG = billingLog;
    process.env.FAKE_VELA_BILLING_DELAY_MS = '150';
    process.env.FAKE_VELA_BILLING_TIER = 'plus';
    process.env.FAKE_VELA_BILLING_BALANCE_USD = '8.00';
    seedLogin('local', {
      user: { id: 'race-1', email: 'race@example.com', plan: undefined },
    });

    try {
      await setSettingsAmrEnv({
        VELA_RUNTIME_KEY: 'rt-billing-account-A',
        VELA_LINK_URL: 'http://link.invalid',
      });
      const pending = getJson<{
        loggedIn: boolean;
        account?: { plan?: string; balanceUsd?: string | null };
      }>(`${baseUrl}/api/integrations/vela/status`);
      await new Promise((resolve) => setTimeout(resolve, 25));
      await setSettingsAmrEnv({ VELA_RUNTIME_KEY: 'rt-billing-account-B' });

      const { body } = await pending;

      expect(body.loggedIn).toBe(true);
      expect(body.account?.plan).toBe('plus');
      expect(body.account?.balanceUsd).toBe('8.00');
      const attempts = readFileSync(billingLog, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toContain('rt-billing-account-A');
      expect(attempts[0]).not.toContain('rt-billing-account-B');
    } finally {
      await setSettingsAmrEnv({
        VELA_RUNTIME_KEY: undefined,
        VELA_LINK_URL: undefined,
      });
    }
  });

  it('does not leak cached billing when the Settings-backed env credential switches accounts', async () => {
    // Account A and B share ~/.amr/config.json (untouched) and differ only by
    // the agentCliEnv.amr VELA_RUNTIME_KEY. The credential fingerprint must keep
    // their live-account caches separate so B never inherits A's plan/balance.
    clearAllVelaLiveAccounts();
    const dataDir = process.env.OD_DATA_DIR as string;
    const setAmrEnv = async (extra: Record<string, string | undefined>) => {
      const cfg = await readAppConfig(dataDir);
      const amr: Record<string, string> = {
        ...((cfg.agentCliEnv?.amr as Record<string, string>) ?? {}),
      };
      for (const [k, v] of Object.entries(extra)) {
        if (v === undefined) delete amr[k];
        else amr[k] = v;
      }
      await writeAppConfig(dataDir, {
        ...cfg,
        agentCliEnv: { ...(cfg.agentCliEnv ?? {}), amr },
      });
    };
    seedLogin('local', {
      user: { id: 'cfg', email: 'cfg@example.com', plan: undefined },
    });
    try {
      await setAmrEnv({
        VELA_RUNTIME_KEY: 'rt-account-A',
        VELA_LINK_URL: 'http://link.invalid',
      });
      process.env.FAKE_VELA_BILLING_TIER = 'plus';
      const a = await getJson<{ account?: { plan?: string } }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      expect(a.body.account?.plan).toBe('plus');

      // Switch the Settings env credential to account B WITHOUT touching the
      // config file, and change what billing returns for the new account.
      await setAmrEnv({ VELA_RUNTIME_KEY: 'rt-account-B' });
      process.env.FAKE_VELA_BILLING_TIER = 'max';
      const b = await getJson<{ account?: { plan?: string } }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      expect(b.body.account?.plan).toBe('max');
    } finally {
      await setAmrEnv({ VELA_RUNTIME_KEY: undefined, VELA_LINK_URL: undefined });
    }
  });

  it('never leaks the runtimeKey or controlKey in the status payload', async () => {
    seedLogin('local', {
      runtimeKey: 'rt-very-secret-do-not-leak',
      controlKey: 'ck-also-secret',
    });
    const resp = await fetch(`${baseUrl}/api/integrations/vela/status`);
    const text = await resp.text();
    expect(text).not.toContain('rt-very-secret-do-not-leak');
    expect(text).not.toContain('ck-also-secret');
  });
});

describe('POST /api/integrations/vela/login', () => {
  it('starts vela login over a direct connection (no AMR API proxy) when the direct attempt succeeds', async () => {
    const dumpPath = path.join(tmpHome, 'vela-env.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;

    const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(status).toBe(202);

    await waitForFile(dumpPath);
    const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
    // Direct-first: a healthy device-authorization path must NOT be re-routed
    // through the daemon IPv4 proxy. The proxy hop loses the client IP behind a
    // corporate transparent proxy (e.g. 飞连/CorpLink) → device authorization
    // fails with "502: Invalid IP address: undefined" (#4210 regression).
    expect(env.VELA_API_URL ?? '').toBe('');
  });

  it('falls back to the daemon AMR API proxy when the direct device-authorization attempt fails', async () => {
    const dumpPath = path.join(tmpHome, 'vela-env-fallback.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    // Direct attempt fails (models a broken amr-api edge path, #3726); the proxy
    // attempt (which sets VELA_API_URL) succeeds.
    process.env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL =
      'start device authorization: API request failed with status 502: broken edge';

    const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(status).toBe(202);

    await waitForFile(dumpPath);
    const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
    expect(env.VELA_API_URL).toBe(`${baseUrl}/api/integrations/vela/api-proxy`);
  });

  it('falls back to the proxy when the direct attempt fails AFTER the startup grace', async () => {
    // Regression (review on #4402): a direct device-authorization that survives
    // the 250ms startup grace and only then errors out before printing an
    // activation URL must still reach the proxy retry — returning 202 on the
    // dead direct login would strand the broken-edge cohort. waitForActivation
    // blocks for the steady state; OD_AMR_LOGIN_ACTIVATION_GRACE_MS keeps the
    // wait short, and the direct failure is delayed past LOGIN_STARTUP_GRACE_MS.
    const dumpPath = path.join(tmpHome, 'vela-env-fallback-after-grace.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    process.env.OD_AMR_LOGIN_ACTIVATION_GRACE_MS = '2000';
    process.env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL =
      'start device authorization: API request failed with status 502: post-grace broken edge';
    process.env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL_DELAY_MS = '450';

    const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(status).toBe(202);

    await waitForFile(dumpPath);
    const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
    expect(env.VELA_API_URL).toBe(`${baseUrl}/api/integrations/vela/api-proxy`);
  });

  it('passes Open Design attribution device id to vela login', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    const dumpPath = path.join(tmpHome, 'vela-env-attribution.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    await writeAppConfig(dataDir, {
      ...previous,
      telemetry: { ...(previous.telemetry ?? {}), metrics: true },
    });

    try {
      const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`, {
        attribution: {
          entryId: 'od-amr-entry-onboarding',
          sourceProduct: 'open_design',
          sourceDetail: 'onboarding_amr_sign_in_continue',
          occurredAt: '2026-06-16T08:00:00.000Z',
          odDeviceId: 'body-should-not-win',
        },
      }, { 'x-od-analytics-device-id': 'od-install-abc' });
      expect(status).toBe(202);

      await waitForFile(dumpPath);
      const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
      expect(env.OPEN_DESIGN_AMR_ORIGIN).toBe('open_design');
      expect(env.OPEN_DESIGN_AMR_ENTRY_ID).toBe('od-amr-entry-onboarding');
      expect(env.OPEN_DESIGN_AMR_ENTRY_SOURCE).toBe(
        'onboarding_amr_sign_in_continue',
      );
      expect(env.OPEN_DESIGN_AMR_ENTRY_AT).toBe('2026-06-16T08:00:00.000Z');
      expect(env.OPEN_DESIGN_AMR_DEVICE_ID).toBe('od-install-abc');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('omits Open Design attribution device id without analytics consent headers', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    const dumpPath = path.join(tmpHome, 'vela-env-attribution-no-headers.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    await writeAppConfig(dataDir, {
      ...previous,
      telemetry: { ...(previous.telemetry ?? {}), metrics: true },
    });

    try {
      const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`, {
        attribution: {
          entryId: 'od-amr-entry-onboarding',
          sourceProduct: 'open_design',
          sourceDetail: 'onboarding_amr_sign_in_continue',
          occurredAt: '2026-06-16T08:00:00.000Z',
          odDeviceId: 'body-should-be-dropped',
        },
      });
      expect(status).toBe(202);

      await waitForFile(dumpPath);
      const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
      expect(env.OPEN_DESIGN_AMR_ENTRY_ID).toBe('od-amr-entry-onboarding');
      expect(env.OPEN_DESIGN_AMR_DEVICE_ID).toBeUndefined();
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('omits Open Design attribution device id when telemetry metrics are disabled', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    const dumpPath = path.join(tmpHome, 'vela-env-attribution-metrics-off.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    await writeAppConfig(dataDir, {
      ...previous,
      telemetry: { ...(previous.telemetry ?? {}), metrics: false },
    });

    try {
      const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`, {
        attribution: {
          entryId: 'od-amr-entry-onboarding',
          sourceProduct: 'open_design',
          sourceDetail: 'onboarding_amr_sign_in_continue',
          occurredAt: '2026-06-16T08:00:00.000Z',
          odDeviceId: 'body-should-be-dropped',
        },
      }, { 'x-od-analytics-device-id': 'od-install-abc' });
      expect(status).toBe(202);

      await waitForFile(dumpPath);
      const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
      expect(env.OPEN_DESIGN_AMR_ENTRY_ID).toBe('od-amr-entry-onboarding');
      expect(env.OPEN_DESIGN_AMR_DEVICE_ID).toBeUndefined();
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('derives the fallback login API proxy from OD_PUBLIC_BASE_URL when the direct attempt fails', async () => {
    const dumpPath = path.join(tmpHome, 'vela-env-public-base-url.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    process.env.OD_PUBLIC_BASE_URL = 'https://open-design.example.com/';
    process.env.FAKE_VELA_LOGIN_FAIL_WITHOUT_API_URL =
      'start device authorization: API request failed with status 502: broken edge';

    const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(status).toBe(202);

    await waitForFile(dumpPath);
    const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
    expect(env.VELA_API_URL).toBe(
      'https://open-design.example.com/api/integrations/vela/api-proxy',
    );
  });

  it('preserves an explicitly configured VELA_API_URL during login', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    const dumpPath = path.join(tmpHome, 'vela-env-custom-url.json');
    process.env.FAKE_VELA_ENV_DUMP_PATH = dumpPath;
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          VELA_API_URL: 'https://custom-amr.example',
        },
      },
    });
    try {
      const { status } = await postJson(`${baseUrl}/api/integrations/vela/login`);
      expect(status).toBe(202);

      await waitForFile(dumpPath);
      const env = JSON.parse(readFileSync(dumpPath, 'utf8'));
      expect(env.VELA_API_URL).toBe('https://custom-amr.example');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('spawns the configured vela binary and surfaces a pid + startedAt + profile', async () => {
    process.env.FAKE_VELA_LOGIN_USER_EMAIL = 'login-route@example.com';
    const { status, body } = await postJson<{
      pid: number;
      startedAt: string;
      profile: string;
    }>(`${baseUrl}/api/integrations/vela/login`);
    expect(status).toBe(202);
    expect(typeof body.pid).toBe('number');
    expect(body.pid).toBeGreaterThan(0);
    expect(body.profile).toBe('local');
    expect(body.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // The fake vela writes ~/.amr/config.json synchronously before exit.
    // Wait briefly for the child to finish so the next status read sees
    // the on-disk projection production produces.
    for (let i = 0; i < 50; i += 1) {
      if (existsSync(configPath())) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(existsSync(configPath())).toBe(true);

    const cfg = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(cfg?.profiles?.local?.user?.email).toBe('login-route@example.com');
    expect(cfg?.profiles?.prod).toBeUndefined();
  });

  it('passes the resolved AMR profile to vela login even when VELA_PROFILE is set differently', async () => {
    process.env.OPEN_DESIGN_AMR_PROFILE = 'test';
    process.env.VELA_PROFILE = 'local';
    process.env.FAKE_VELA_LOGIN_USER_EMAIL = 'login-test@example.com';

    const { status, body } = await postJson<{
      pid: number;
      profile: string;
    }>(`${baseUrl}/api/integrations/vela/login`);
    expect(status).toBe(202);
    expect(body.profile).toBe('test');

    for (let i = 0; i < 50; i += 1) {
      if (existsSync(configPath())) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const cfg = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(cfg?.profiles?.test?.user?.email).toBe('login-test@example.com');
    expect(cfg?.profiles?.local).toBeUndefined();
  });

  it('passes the Settings-configured AMR profile to vela login', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    process.env.OPEN_DESIGN_AMR_PROFILE = 'prod';
    process.env.VELA_PROFILE = 'prod';
    process.env.FAKE_VELA_LOGIN_USER_EMAIL = 'settings-login@example.com';
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          OPEN_DESIGN_AMR_PROFILE: 'local',
        },
      },
    });
    try {
      const { status, body } = await postJson<{
        pid: number;
        profile: string;
      }>(`${baseUrl}/api/integrations/vela/login`);
      expect(status).toBe(202);
      expect(body.profile).toBe('local');

      for (let i = 0; i < 50; i += 1) {
        if (existsSync(configPath())) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const cfg = JSON.parse(readFileSync(configPath(), 'utf8'));
      expect(cfg?.profiles?.local?.user?.email).toBe('settings-login@example.com');
      expect(cfg?.profiles?.prod).toBeUndefined();
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });


  it('uses the same Settings-configured AMR env for login and subsequent status reads', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    process.env.OPEN_DESIGN_AMR_PROFILE = 'prod';
    process.env.VELA_PROFILE = 'prod';
    process.env.FAKE_VELA_LOGIN_USER_EMAIL = 'settings-roundtrip@example.com';
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          OPEN_DESIGN_AMR_PROFILE: 'local',
        },
      },
    });
    try {
      const before = await getJson<{
        loggedIn: boolean;
        profile: string;
        user: { email?: string } | null;
      }>(`${baseUrl}/api/integrations/vela/status`);
      expect(before.status).toBe(200);
      expect(before.body.loggedIn).toBe(false);
      expect(before.body.profile).toBe('local');

      const login = await postJson<{
        pid: number;
        profile: string;
      }>(`${baseUrl}/api/integrations/vela/login`);
      expect(login.status).toBe(202);
      expect(login.body.profile).toBe('local');

      for (let i = 0; i < 50; i += 1) {
        const current = await getJson<{
          loggedIn: boolean;
          profile: string;
          user: { email?: string } | null;
        }>(`${baseUrl}/api/integrations/vela/status`);
        if (current.body.loggedIn) {
          expect(current.body.profile).toBe('local');
          expect(current.body.user?.email).toBe('settings-roundtrip@example.com');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('expected configured-profile AMR login to become visible via /status');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
      delete process.env.FAKE_VELA_LOGIN_USER_EMAIL;
    }
  });

  it('returns 409 when a login subprocess is already in flight', async () => {
    // Use the stub's delay knob so the first login is still running when
    // the second request arrives; without this the first exits before the
    // route's `isVelaLoginInFlight` guard sees it.
    process.env.FAKE_VELA_LOGIN_DELAY_MS = '2000';

    const first = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(first.status).toBe(202);

    const second = await postJson<{ error?: string }>(
      `${baseUrl}/api/integrations/vela/login`,
    );
    expect(second.status).toBe(409);
    expect(String(second.body.error || '')).toMatch(/already running/i);

    delete process.env.FAKE_VELA_LOGIN_DELAY_MS;
    await waitForVelaLoginIdle();
  });

  it('returns an error when the login subprocess exits immediately with stderr', async () => {
    process.env.FAKE_VELA_LOGIN_FAIL =
      'profile "prod" api URL: is not configured';

    const { status, body } = await postJson<{ error?: string }>(
      `${baseUrl}/api/integrations/vela/login`,
    );

    expect(status).toBe(500);
    expect(body.error).toContain('profile "prod" api URL: is not configured');
  });

  it('surfaces and cancels a delayed login subprocess', async () => {
    process.env.FAKE_VELA_LOGIN_DELAY_MS = '30000';

    const login = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(login.status).toBe(202);

    const during = await getJson<{ loggedIn: boolean; loginInFlight: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    expect(during.body.loggedIn).toBe(false);
    expect(during.body.loginInFlight).toBe(true);

    const cancel = await postJson<{ canceled: boolean; pids: number[] }>(
      `${baseUrl}/api/integrations/vela/login/cancel`,
    );
    expect(cancel.status).toBe(200);
    expect(cancel.body.canceled).toBe(true);
    expect(cancel.body.pids.length).toBeGreaterThan(0);

    for (let i = 0; i < 50; i += 1) {
      const next = await getJson<{ loginInFlight: boolean }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      if (!next.body.loginInFlight) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const after = await getJson<{ loggedIn: boolean; loginInFlight: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    expect(after.body.loggedIn).toBe(false);
    expect(after.body.loginInFlight).toBe(false);
    expect(existsSync(configPath())).toBe(false);
  });
});

describe('ALL /api/integrations/vela/api-proxy/*', () => {
  it('forwards form-encoded POST bodies to the AMR API upstream', async () => {
    const upstreamRequests: Array<{
      href: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    }> = [];
    const requestSpy = vi.spyOn(https, 'request').mockImplementation(((target, options, callback) => {
      const req = new PassThrough() as any;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('finish', () => {
        upstreamRequests.push({
          href: target instanceof URL ? target.href : String(target),
          method: String(options?.method ?? ''),
          headers: options?.headers as Record<string, string>,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        const upstreamRes = new PassThrough() as any;
        upstreamRes.statusCode = 201;
        upstreamRes.headers = { 'content-type': 'application/json' };
        callback?.(upstreamRes);
        upstreamRes.end(JSON.stringify({ ok: true }));
      });
      req.setTimeout = () => req;
      return req;
    }) as typeof https.request);

    try {
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'device-code-123',
      }).toString();
      const resp = await fetch(`${baseUrl}/api/integrations/vela/api-proxy/api/v1/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      expect(resp.status).toBe(201);
      expect(await resp.json()).toEqual({ ok: true });
      expect(upstreamRequests).toHaveLength(1);
      expect(upstreamRequests[0]?.href).toBe('https://amr-api.open-design.ai/api/v1/oauth/token');
      expect(upstreamRequests[0]?.method).toBe('POST');
      expect(upstreamRequests[0]?.headers['content-type']).toContain(
        'application/x-www-form-urlencoded',
      );
      expect(upstreamRequests[0]?.headers['content-length']).toBe(String(Buffer.byteLength(body)));
      expect(upstreamRequests[0]?.body).toBe(body);
    } finally {
      requestSpy.mockRestore();
    }
  });
});

describe('POST /api/integrations/vela/analytics-entry', () => {
  it('mirrors Open Design AMR entry clicks to the AMR analytics ingest shape', async () => {
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
    await new Promise<void>((resolve) => {
      captureServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = captureServer.address() as AddressInfo;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_URL =
      `http://127.0.0.1:${address.port}/api/v1/analytics/events`;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = 'test';

    const payload = {
      pageName: 'open_design',
      sourcePageName: 'chat_panel',
      area: 'amr_entry',
      element: 'chat_error_recharge',
      action: 'click_amr_entry',
      entryId: 'od-amr-entry-123',
      sourceProduct: 'open_design',
      sourceDetail: 'chat_error_recharge',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
    };

    try {
      const { status, body } = await postJson<{ mirrored: boolean; status: number }>(
        `${baseUrl}/api/integrations/vela/analytics-entry`,
        { payload },
        {
          'x-od-analytics-device-id': 'od-device-1',
          'x-od-analytics-session-id': 'od-session-1',
          'x-od-analytics-locale': 'zh-CN',
        },
      );

      expect(status).toBe(202);
      expect(body).toEqual({ mirrored: true, status: 202 });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        events: [
          {
            common: {
              eventId: 'od-amr-entry-od-amr-entry-123',
              eventTime: '2026-06-03T12:00:00.000Z',
              registryKey: 'open_design_amr_entry',
              eventName: 'amr_entry',
              eventType: 'click',
              platform: 'web',
              env: 'test',
              userId: null,
              anonymousId: 'od-device-1',
              sessionId: 'od-session-1',
              appVersion: null,
              locale: 'zh-CN',
              traceId: 'od-amr-entry-123',
            },
            payload,
          },
        ],
      });
    } finally {
      await new Promise<void>((resolve) => {
        captureServer.close(() => resolve());
      });
    }
  });

  it('forwards optional onboarding profile (role/orgSize/useCase/source) to the AMR ingest body', async () => {
    const requests: Array<{ events: Array<{ payload: Record<string, unknown> }> }> = [];
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
    await new Promise<void>((resolve) => {
      captureServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = captureServer.address() as AddressInfo;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_URL =
      `http://127.0.0.1:${address.port}/api/v1/analytics/events`;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = 'test';

    const payload = {
      pageName: 'open_design',
      sourcePageName: 'chat_panel',
      area: 'amr_entry',
      element: 'chat_error_recharge',
      action: 'click_amr_entry',
      entryId: 'od-amr-entry-456',
      sourceProduct: 'open_design',
      sourceDetail: 'chat_error_recharge',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
      odRole: 'pm',
      odOrgSize: 'startup',
      odUseCase: ['product', 'design-system'],
      odSource: 'github',
    };

    try {
      const { status } = await postJson<{ mirrored: boolean }>(
        `${baseUrl}/api/integrations/vela/analytics-entry`,
        { payload },
        { 'x-od-analytics-device-id': 'od-device-2' },
      );

      expect(status).toBe(202);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.events[0]?.payload).toMatchObject({
        odRole: 'pm',
        odOrgSize: 'startup',
        odUseCase: ['product', 'design-system'],
        odSource: 'github',
      });
    } finally {
      await new Promise<void>((resolve) => {
        captureServer.close(() => resolve());
      });
    }
  });

  it('mirrors Open Design onboarding profile snapshots with the header-derived device id', async () => {
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
    await new Promise<void>((resolve) => {
      captureServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = captureServer.address() as AddressInfo;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_URL =
      `http://127.0.0.1:${address.port}/api/v1/analytics/events`;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = 'test';

    const payload = {
      pageName: 'open_design',
      sourcePageName: 'onboarding',
      area: 'onboarding',
      element: 'about_you_submit',
      action: 'submit_profile',
      entryId: 'od-amr-entry-profile',
      sourceProduct: 'open_design',
      sourceDetail: 'onboarding_amr_sign_in_continue',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
      profileOccurredAt: '2026-06-03T12:03:00.000Z',
      odDeviceId: 'body-device-should-not-win',
      odRole: 'pm',
      odOrgSize: 'startup',
      odUseCase: ['product', 'design-system'],
      odSource: 'github',
    };

    try {
      const { status, body } = await postJson<{ mirrored: boolean; status: number }>(
        `${baseUrl}/api/integrations/vela/analytics-profile`,
        { payload },
        {
          'x-od-analytics-device-id': 'od-device-1',
          'x-od-analytics-session-id': 'od-session-1',
          'x-od-analytics-locale': 'zh-CN',
        },
      );

      expect(status).toBe(202);
      expect(body).toEqual({ mirrored: true, status: 202 });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        events: [
          {
            common: {
              eventId: 'od-onboarding-profile-od-amr-entry-profile',
              eventTime: '2026-06-03T12:03:00.000Z',
              registryKey: 'open_design_onboarding_profile',
              eventName: 'onboarding_profile',
              eventType: 'result',
              platform: 'web',
              env: 'test',
              anonymousId: 'od-device-1',
              sessionId: 'od-session-1',
              locale: 'zh-CN',
              traceId: 'od-amr-entry-profile',
            },
            payload: { ...payload, odDeviceId: 'od-device-1' },
          },
        ],
      });
    } finally {
      await new Promise<void>((resolve) => {
        captureServer.close(() => resolve());
      });
    }
  });

  it('drops an over-long profile value rather than mirroring it', () => {
    const base = {
      pageName: 'open_design',
      sourcePageName: 'chat_panel',
      area: 'amr_entry',
      element: 'chat_error_recharge',
      action: 'click_amr_entry',
      entryId: 'od-amr-entry-789',
      sourceProduct: 'open_design',
      sourceDetail: 'chat_error_recharge',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
    };
    // Valid optional values pass through; an over-long value rejects the event.
    expect(parseAmrEntryAnalyticsPayload({ payload: { ...base, odRole: 'student' } }))
      .toMatchObject({ odRole: 'student' });
    expect(
      parseAmrEntryAnalyticsPayload({
        payload: { ...base, odRole: 'x'.repeat(65) },
      }),
    ).toBeNull();
    // useCase is an array; valid lists pass through, a bad element rejects.
    expect(
      parseAmrEntryAnalyticsPayload({
        payload: { ...base, odUseCase: ['product', 'landing'], odSource: 'github' },
      }),
    ).toMatchObject({ odUseCase: ['product', 'landing'], odSource: 'github' });
    expect(
      parseAmrEntryAnalyticsPayload({
        payload: { ...base, odUseCase: ['product', 'x'.repeat(65)] },
      }),
    ).toBeNull();
    expect(
      parseAmrEntryAnalyticsPayload({
        payload: { ...base, odUseCase: 'not-an-array' },
      }),
    ).toBeNull();
  });

  it('rejects malformed AMR onboarding profile analytics payloads', async () => {
    const base = {
      pageName: 'open_design',
      sourcePageName: 'onboarding',
      area: 'onboarding',
      element: 'about_you_submit',
      action: 'submit_profile',
      entryId: 'od-amr-entry-profile',
      sourceProduct: 'open_design',
      sourceDetail: 'onboarding_amr_sign_in_continue',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
      profileOccurredAt: '2026-06-03T12:03:00.000Z',
    };

    expect(
      parseAmrOnboardingProfileAnalyticsPayload({
        payload: { ...base, odRole: 'pm', odDeviceId: 'od-install-abc' },
      }),
    ).toMatchObject({ odRole: 'pm', odDeviceId: 'od-install-abc' });
    expect(parseAmrOnboardingProfileAnalyticsPayload({ payload: base }))
      .toBeNull();
    expect(
      parseAmrOnboardingProfileAnalyticsPayload({
        payload: { ...base, odRole: 'x'.repeat(65) },
      }),
    ).toBeNull();

    const { status, body } = await postJson<{ error: string }>(
      `${baseUrl}/api/integrations/vela/analytics-profile`,
      { payload: { pageName: 'open_design' } },
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: 'invalid_amr_profile_analytics' });
  });

  it('rejects non-onboarding sources for AMR onboarding profile analytics', async () => {
    const payload = {
      pageName: 'open_design',
      sourcePageName: 'onboarding',
      area: 'onboarding',
      element: 'about_you_submit',
      action: 'submit_profile',
      entryId: 'od-amr-entry-profile',
      sourceProduct: 'open_design',
      sourceDetail: 'settings_amr_console',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
      profileOccurredAt: '2026-06-03T12:03:00.000Z',
      odRole: 'pm',
    };

    expect(parseAmrOnboardingProfileAnalyticsPayload({ payload })).toBeNull();

    const { status, body } = await postJson<{ error: string }>(
      `${baseUrl}/api/integrations/vela/analytics-profile`,
      { payload },
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: 'invalid_amr_profile_analytics' });
  });

  it('rejects malformed AMR entry analytics payloads', async () => {
    const { status, body } = await postJson<{ error: string }>(
      `${baseUrl}/api/integrations/vela/analytics-entry`,
      { payload: { pageName: 'open_design' } },
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: 'invalid_amr_entry_analytics' });
  });

  it('does not mirror to AMR when the request carries no analytics-consent headers', async () => {
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
    await new Promise<void>((resolve) => {
      captureServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = captureServer.address() as AddressInfo;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_URL =
      `http://127.0.0.1:${address.port}/api/v1/analytics/events`;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = 'test';

    const payload = {
      pageName: 'open_design',
      sourcePageName: 'chat_panel',
      area: 'amr_entry',
      element: 'chat_error_recharge',
      action: 'click_amr_entry',
      entryId: 'od-amr-entry-no-consent',
      sourceProduct: 'open_design',
      sourceDetail: 'chat_error_recharge',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
    };

    try {
      // No x-od-analytics-* headers => readAnalyticsContext returns null =>
      // opted out. The route must short-circuit before any external fetch.
      const { status, body } = await postJson<{ mirrored: boolean }>(
        `${baseUrl}/api/integrations/vela/analytics-entry`,
        { payload },
      );

      expect(status).toBe(202);
      expect(body).toEqual({ mirrored: false });
      expect(requests).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve) => {
        captureServer.close(() => resolve());
      });
    }
  });

  it('does not mirror to AMR when telemetry.metrics consent is off', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    await writeAppConfig(dataDir, {
      ...previous,
      telemetry: { ...(previous.telemetry ?? {}), metrics: false },
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
    await new Promise<void>((resolve) => {
      captureServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = captureServer.address() as AddressInfo;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_URL =
      `http://127.0.0.1:${address.port}/api/v1/analytics/events`;
    process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV = 'test';

    const payload = {
      pageName: 'open_design',
      sourcePageName: 'chat_panel',
      area: 'amr_entry',
      element: 'chat_error_recharge',
      action: 'click_amr_entry',
      entryId: 'od-amr-entry-metrics-off',
      sourceProduct: 'open_design',
      sourceDetail: 'chat_error_recharge',
      entryOccurredAt: '2026-06-03T12:00:00.000Z',
    };

    try {
      // Consent headers are present, but app-config opt-out must still win as
      // defense in depth against a stale header leak after the user opts out.
      const { status, body } = await postJson<{ mirrored: boolean }>(
        `${baseUrl}/api/integrations/vela/analytics-entry`,
        { payload },
        {
          'x-od-analytics-device-id': 'od-device-1',
          'x-od-analytics-session-id': 'od-session-1',
          'x-od-analytics-locale': 'zh-CN',
        },
      );

      expect(status).toBe(202);
      expect(body).toEqual({ mirrored: false });
      expect(requests).toHaveLength(0);
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
      await new Promise<void>((resolve) => {
        captureServer.close(() => resolve());
      });
    }
  });
});

describe('POST /api/integrations/vela/logout', () => {
  it('drops back to preset AMR models after file-backed logout invalidates the cached remote catalog', async () => {
    seedLogin('local');

    const first = await getJson<{
      source: 'preset' | 'remote';
      refreshing?: boolean;
      models: Array<{ id: string }>;
    }>(`${baseUrl}/api/amr/models`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      source: 'preset',
      refreshing: true,
    });
    expect(first.body.models.map((model) => model.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v3.2',
      'gemini-2.5-flash',
      'glm-5.1',
    ]);

    const warmed = await waitForAmrModels('remote');
    expect(warmed.status).toBe(200);
    expect(warmed.body.source).toBe('remote');
    expect(warmed.body.models.map((model) => model.id)).toContain('deepseek-v4-flash');
    expect(warmed.body.models.map((model) => model.id)).toContain('gpt-5.4');

    const logout = await postJson<{ ok?: boolean }>(`${baseUrl}/api/integrations/vela/logout`);
    expect(logout.status).toBe(200);
    expect(logout.body.ok).toBe(true);

    const afterLogout = await getJson<{
      source: 'preset' | 'remote';
      refreshing?: boolean;
      remoteError?: string;
      models: Array<{ id: string }>;
    }>(`${baseUrl}/api/amr/models`);
    expect(afterLogout.status).toBe(200);
    expect(afterLogout.body).toMatchObject({
      source: 'preset',
      refreshing: true,
    });
    expect(afterLogout.body.models.map((model) => model.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v3.2',
      'gemini-2.5-flash',
      'glm-5.1',
    ]);
  });

  it('removes only resolved profile credentials so the next login can reuse endpoint config', async () => {
    seedLogin('local');
    const cfg = JSON.parse(readFileSync(configPath(), 'utf8'));
    cfg.profiles.prod = {
      runtimeKey: 'rt-prod',
      user: { id: 'prod-user', email: 'prod@example.com' },
    };
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
    expect(existsSync(configPath())).toBe(true);

    const { status, body } = await postJson<{ ok?: boolean }>(
      `${baseUrl}/api/integrations/vela/logout`,
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(existsSync(configPath())).toBe(true);
    const next = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(next.profiles.local.runtimeKey).toBeUndefined();
    expect(next.profiles.local.controlKey).toBeUndefined();
    expect(next.profiles.local.user).toBeUndefined();
    expect(next.profiles.local.apiUrl).toBe('http://localhost:18080');
    expect(next.profiles.local.linkUrl).toBe('http://localhost:18081');
    expect(next.profiles.prod.runtimeKey).toBe('rt-prod');

    const after = await getJson<{ loggedIn: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    expect(after.body.loggedIn).toBe(false);
  });

  it('is a no-op when there is no config file (idempotent / safe to spam from UI)', async () => {
    expect(existsSync(configPath())).toBe(false);
    const { status, body } = await postJson<{ ok?: boolean }>(
      `${baseUrl}/api/integrations/vela/logout`,
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('clears Settings-backed AMR auth env while preserving executable config', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    await writeAppConfig(dataDir, {
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          VELA_OPENCODE_BIN: '/tmp/opencode',
          VELA_RUNTIME_KEY: 'rt-env-secret',
          VELA_LINK_URL: 'https://openrouter.example/v1',
        },
      },
    });

    try {
      const before = await getJson<{ loggedIn: boolean }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      expect(before.body.loggedIn).toBe(true);

      const { status, body } = await postJson<{ ok?: boolean }>(
        `${baseUrl}/api/integrations/vela/logout`,
      );
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const after = await getJson<{ loggedIn: boolean }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      expect(after.body.loggedIn).toBe(false);

      const next = await readAppConfig(dataDir);
      expect(next.agentCliEnv?.amr?.VELA_BIN).toBe(FAKE_VELA);
      expect(next.agentCliEnv?.amr?.VELA_OPENCODE_BIN).toBe('/tmp/opencode');
      expect(next.agentCliEnv?.amr?.VELA_RUNTIME_KEY).toBeUndefined();
      expect(next.agentCliEnv?.amr?.VELA_LINK_URL).toBeUndefined();
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('clears both Settings-backed AMR env credentials and same-profile ~/.amr credentials on logout', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    seedLogin('local', {
      user: { id: 'local-user', email: 'local@example.com' },
    });
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          VELA_OPENCODE_BIN: '/tmp/opencode',
          OPEN_DESIGN_AMR_PROFILE: 'local',
          VELA_RUNTIME_KEY: 'rt-env-secret',
          VELA_LINK_URL: 'https://openrouter.example/v1',
        },
      },
    });

    try {
      const before = await getJson<{ loggedIn: boolean }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      expect(before.body.loggedIn).toBe(true);

      const { status, body } = await postJson<{ ok?: boolean }>(
        `${baseUrl}/api/integrations/vela/logout`,
      );
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const after = await getJson<{ loggedIn: boolean }>(
        `${baseUrl}/api/integrations/vela/status`,
      );
      expect(after.body.loggedIn).toBe(false);

      const nextConfig = await readAppConfig(dataDir);
      expect(nextConfig.agentCliEnv?.amr?.VELA_RUNTIME_KEY).toBeUndefined();
      expect(nextConfig.agentCliEnv?.amr?.VELA_LINK_URL).toBeUndefined();

      const nextAmrConfig = JSON.parse(readFileSync(configPath(), 'utf8'));
      expect(nextAmrConfig.profiles.local.runtimeKey).toBeUndefined();
      expect(nextAmrConfig.profiles.local.user).toBeUndefined();
      expect(nextAmrConfig.profiles.local.linkUrl).toBe('http://localhost:18081');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('logs out the Settings-configured AMR profile from the AMR config file', async () => {
    const dataDir = process.env.OD_DATA_DIR as string;
    const previous = await readAppConfig(dataDir);
    seedLogin('local');
    const cfg = JSON.parse(readFileSync(configPath(), 'utf8'));
    cfg.profiles.prod = {
      runtimeKey: 'rt-prod',
      user: { id: 'prod-user', email: 'prod@example.com' },
    };
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
    process.env.OPEN_DESIGN_AMR_PROFILE = 'prod';
    await writeAppConfig(dataDir, {
      ...previous,
      agentCliEnv: {
        ...(previous.agentCliEnv ?? {}),
        amr: {
          ...((previous.agentCliEnv?.amr as Record<string, string>) ?? {}),
          VELA_BIN: FAKE_VELA,
          OPEN_DESIGN_AMR_PROFILE: 'local',
        },
      },
    });
    try {
      const { status, body } = await postJson<{ ok?: boolean }>(
        `${baseUrl}/api/integrations/vela/logout`,
      );
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const next = JSON.parse(readFileSync(configPath(), 'utf8'));
      expect(next.profiles.local.runtimeKey).toBeUndefined();
      expect(next.profiles.prod.runtimeKey).toBe('rt-prod');
    } finally {
      await writeAppConfig(dataDir, previous as unknown as Record<string, unknown>);
    }
  });

  it('clears daemon-process AMR auth env for the current daemon session', async () => {
    process.env.VELA_RUNTIME_KEY = 'rt-process-secret';
    process.env.VELA_LINK_URL = 'https://openrouter.example/v1';

    const before = await getJson<{ loggedIn: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    expect(before.body.loggedIn).toBe(true);

    const { status, body } = await postJson<{ ok?: boolean }>(
      `${baseUrl}/api/integrations/vela/logout`,
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(process.env.VELA_RUNTIME_KEY).toBeUndefined();
    expect(process.env.VELA_LINK_URL).toBeUndefined();

    const after = await getJson<{ loggedIn: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    expect(after.body.loggedIn).toBe(false);
  });
});

describe('login → status round-trip (E2E across the three routes)', () => {
  it('flips loggedIn=false → loggedIn=true after a successful login subprocess', async () => {
    process.env.FAKE_VELA_LOGIN_USER_EMAIL = 'round-trip@example.com';
    process.env.FAKE_VELA_LOGIN_USER_PLAN = 'pro';

    const before = await getJson<{ loggedIn: boolean }>(
      `${baseUrl}/api/integrations/vela/status`,
    );
    expect(before.body.loggedIn).toBe(false);

    const login = await postJson(`${baseUrl}/api/integrations/vela/login`);
    expect(login.status).toBe(202);

    // Poll until the subprocess writes the config file (production AmrLoginPill
    // polls /status every 2s; here we cap at 5s).
    for (let i = 0; i < 50; i += 1) {
      if (existsSync(configPath())) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(existsSync(configPath())).toBe(true);

    const after = await getJson<{
      loggedIn: boolean;
      user: { email?: string; plan?: string } | null;
    }>(`${baseUrl}/api/integrations/vela/status`);
    expect(after.body.loggedIn).toBe(true);
    expect(after.body.user?.email).toBe('round-trip@example.com');
    expect(after.body.user?.plan).toBe('pro');

    delete process.env.FAKE_VELA_LOGIN_USER_EMAIL;
    delete process.env.FAKE_VELA_LOGIN_USER_PLAN;
  });
});

describe('parseAmrEntryAnalyticsPayload — entry sources added in this PR', () => {
  const payloadFor = (source: string, page: string) => ({
    pageName: 'open_design',
    sourcePageName: page,
    area: 'amr_entry',
    element: source,
    action: 'click_amr_entry',
    entryId: 'od-amr-entry-x',
    sourceProduct: 'open_design',
    sourceDetail: source,
    entryOccurredAt: '2026-06-03T12:00:00.000Z',
  });

  it('accepts upgrade / agent-card sources so mirroring is not 400ed', () => {
    const cases: Array<[string, string]> = [
      ['settings_amr_upgrade', 'settings'],
      ['inline_amr_upgrade', 'chat_panel'],
      ['avatar_amr_upgrade', 'chat_panel'],
      ['avatar_amr_agent_card', 'chat_panel'],
      ['artifact_success_upgrade', 'artifact'],
      ['home_artifact_upgrade', 'home'],
    ];
    for (const [source, page] of cases) {
      expect(parseAmrEntryAnalyticsPayload(payloadFor(source, page))).not.toBeNull();
    }
  });

  it('still rejects an unknown source', () => {
    expect(
      parseAmrEntryAnalyticsPayload(payloadFor('made_up_source', 'settings')),
    ).toBeNull();
  });
});
