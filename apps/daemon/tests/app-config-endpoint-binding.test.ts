import type { Server } from 'node:http';
import express from 'express';
import { registerMediaRoutes } from '../src/routes/media.js';
import { isLocalSameOrigin } from '../src/origin-validation.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type AppConfigPrefs, readAppConfig, readAppConfigSync, writeAppConfig } from '../src/app-config.js';

const binding = {
  profile: 'test',
  apiUrl: 'https://api.feature-test.example.test',
  linkUrl: 'https://link.feature-test.example.test',
  webUrl: 'https://feature-test.example.test',
  credentialScope: 'feature-test',
};
let dataDir: string;
let server: Server | undefined;
beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'od-bound-config-'));
  vi.stubEnv('OPEN_DESIGN_AMR_ENDPOINT_BINDING', JSON.stringify(binding));
});
afterEach(async () => {
  if (server) {
    const closing = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => closing.close(error => error ? reject(error) : resolve()));
  }
  vi.unstubAllEnvs();
  await rm(dataDir, { recursive: true, force: true });
});

it('projects legacy AMR overrides out of both reads without altering disk or other CLI settings', async () => {
  const saved = {
    agentCliEnv: {
      amr: {
        OPEN_DESIGN_AMR_PROFILE: 'feature-test',
        VELA_API_URL: 'https://old.example.test',
        VELA_LINK_URL: 'https://old-link.example.test',
        VELA_RUNTIME_KEY: 'fixture-only-old-runtime-key',
        VELA_BIN: '/fixture/bin/vela',
        VELA_OPENCODE_BIN: '/fixture/bin/opencode',
      },
      codex: { CODEX_HOME: '/fixture/codex' },
    },
  };
  const raw = JSON.stringify(saved);
  await writeFile(path.join(dataDir, 'app-config.json'), raw);
  const expected = {
    amr: { VELA_BIN: '/fixture/bin/vela', VELA_OPENCODE_BIN: '/fixture/bin/opencode' },
    codex: { CODEX_HOME: '/fixture/codex' },
  };
  expect((await readAppConfig(dataDir)).agentCliEnv).toEqual(expected);
  expect(readAppConfigSync(dataDir).agentCliEnv).toEqual(expected);
  expect(await readFile(path.join(dataDir, 'app-config.json'), 'utf8')).toBe(raw);
});

it('lets a hydrated legacy profile round-trip through a Cloud selection without weakening explicit override rejection', async () => {
  await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
    agentId: 'codex', agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'feature-test' } },
    agentCliEnvIntent: { amr: { apiKeyOverride: true } },
  }));
  const hydrated = await readAppConfig(dataDir);
  expect(hydrated.agentCliEnv).toBeUndefined();
  expect(hydrated.agentCliEnvIntent).toBeUndefined();
  expect(readAppConfigSync(dataDir).agentCliEnvIntent).toBeUndefined();
  await expect(writeAppConfig(dataDir, { ...hydrated, agentId: 'amr' })).resolves.toMatchObject({ agentId: 'amr' });
  const persisted = await readFile(path.join(dataDir, 'app-config.json'), 'utf8');
  for (const override of [
    { OPEN_DESIGN_AMR_PROFILE: 'feature-test' },
    { VELA_API_URL: 'https://other.example.test' },
    { VELA_LINK_URL: 'https://other-link.example.test' },
    { VELA_RUNTIME_KEY: 'fixture-only-new-runtime-key' },
  ]) {
    await expect(writeAppConfig(dataDir, { agentCliEnv: { amr: override } })).rejects.toMatchObject({
      code: 'INVALID_APP_CONFIG_VALUE', key: 'agentCliEnv',
    });
  }
  expect(await readFile(path.join(dataDir, 'app-config.json'), 'utf8')).toBe(persisted);
});

it('preserves legacy profile configuration when no fixed endpoint binding is active', async () => {
  vi.stubEnv('OPEN_DESIGN_AMR_ENDPOINT_BINDING', '');
  const agentCliEnv = { amr: { OPEN_DESIGN_AMR_PROFILE: 'feature-test', VELA_API_URL: 'https://old.example.test' } };
  await writeAppConfig(dataDir, { agentCliEnv });
  expect((await readAppConfig(dataDir)).agentCliEnv).toEqual(agentCliEnv);
  expect(readAppConfigSync(dataDir).agentCliEnv).toEqual(agentCliEnv);
});

// Exercise the registered production HTTP handlers, with only unrelated services
// stubbed. Config reads/writes and the same-origin check are their real functions.
it('serves a safe GET config that Cloud can PUT while rejecting an explicit endpoint override over HTTP', async () => {
  await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
    agentId: 'codex',
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'feature-test' } },
    agentCliEnvIntent: { amr: { apiKeyOverride: true } },
  }));
  const configure = vi.fn();
  const written = vi.fn();
  const noop = () => undefined;
  const stub = () => new Proxy({}, { get: () => noop });
  const port = { current: 0 };
  const app = express();
  app.use(express.json());
  registerMediaRoutes(app, {
    db: {}, design: stub(),
    http: { isLocalSameOrigin, resolvedPortRef: port, requireLocalDaemonRequest: noop, sendApiError: noop },
    paths: { PROJECT_ROOT: dataDir, PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
    auth: stub(), ids: stub(), media: stub(),
    appConfig: { readAppConfig, writeAppConfig, onAppConfigWritten: written },
    orbit: { orbitService: { configure } },
    nativeDialogs: stub(), projectStore: stub(), projectFiles: stub(),
    conversations: stub(), research: stub(),
  } as unknown as Parameters<typeof registerMediaRoutes>[1]);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  port.current = address.port;
  const origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${origin}/api/app-config`, { headers: { origin } });
  expect(response.status).toBe(200);
  const { config } = await response.json() as { config: AppConfigPrefs };
  expect(config.agentCliEnv).toBeUndefined();
  expect(config.agentCliEnvIntent).toBeUndefined();
  const put = (body: unknown) => fetch(`${origin}/api/app-config`, {
    method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const selected = await put({ ...config, mode: 'daemon', agentId: 'amr' });
  expect(selected.status).toBe(200);
  const selectedBody = await selected.json() as { config: AppConfigPrefs };
  expect(selectedBody.config.agentId).toBe('amr');
  expect(configure).toHaveBeenCalledOnce();
  expect(written).toHaveBeenCalledOnce();
  const afterSelection = await readFile(path.join(dataDir, 'app-config.json'), 'utf8');
  const rejected = await put({ ...config, agentCliEnv: { amr: { VELA_API_URL: 'https://other.example.test' } } });
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({ error: {
    code: 'INVALID_APP_CONFIG_VALUE', message: 'AMR environment binding cannot be overridden by CLI settings',
  } });
  expect(configure).toHaveBeenCalledOnce();
  expect(written).toHaveBeenCalledOnce();
  expect(await readFile(path.join(dataDir, 'app-config.json'), 'utf8')).toBe(afterSelection);
});
