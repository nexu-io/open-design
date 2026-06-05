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
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';
import { readAppConfig, writeAppConfig } from '../../src/app-config.js';

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
  delete process.env.FAKE_VELA_LOGIN_USER_EMAIL;
  delete process.env.FAKE_VELA_LOGIN_USER_PLAN;
  delete process.env.VELA_RUNTIME_KEY;
  delete process.env.VELA_LINK_URL;
  delete process.env.OPEN_DESIGN_AMR_ANALYTICS_URL;
  delete process.env.OPEN_DESIGN_AMR_ANALYTICS_ENV;
  rmSync(tmpHome, { recursive: true, force: true });
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
    // Let the first login finish so the next test starts from a clean slate.
    for (let i = 0; i < 50; i += 1) {
      if (existsSync(configPath())) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
      'glm-5.1',
      'gemini-2.5-flash',
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
      'glm-5.1',
      'gemini-2.5-flash',
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
