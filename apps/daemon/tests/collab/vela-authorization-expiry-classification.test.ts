/**
 * Which upstream answers are allowed to expire the LOCAL Vela credential, and
 * how the daemon gets back out of that state.
 *
 * Background: `markVelaAuthorizationExpired` writes the active credential
 * revision into process-lifetime sets that nothing but an explicit logout ever
 * emptied. Anything that reaches it therefore pins the daemon into
 * `reauth_required` — `/api/integrations/vela/status` keeps reporting it, and
 * the web shell replaces the route with onboarding. So the set of statuses
 * that reach it has to be exactly the set that PROVES the credential is dead,
 * and a credential that is demonstrably alive again has to be able to clear
 * the mark on its own.
 *
 * Vela answers 403 `missing_principal` from a bare catch around principal
 * resolution, so anything that stops a principal resolving surfaces as 403
 * with the caller's control key untouched. The case observed in the field is a
 * workspace id and a control key that describe different environments — the
 * membership row does not exist, `workspace_member_required` is raised, and
 * the catch reports 403. Probing production confirms the symmetry: prod key +
 * test workspace and test key + prod workspace both answer 403, while a
 * nonsense key answers 401. 401 `untrusted_caller` is the only answer that
 * means "this key does not verify".
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchVelaWorkspaceDirectory } from '../../src/collab/vela-workspace-context.js';
import { createDevWorkspaceContextProvider } from '../../src/collab/workspace-context.js';
import {
  clearVelaAuthorizationState,
  readVelaLoginStatus,
} from '../../src/integrations/vela.js';
import { createVelaWalletSnapshotReader } from '../../src/integrations/vela-wallet.js';
import { registerCollabContextRoutes } from '../../src/routes/collab-context.js';

const tempDirs: string[] = [];
let server: http.Server | null = null;

/**
 * The production-shaped session: a Settings-backed env credential for the
 * runtime key plus the file profile's control key, which is what the workspace
 * directory authenticates with. Using the real reader (no `readSession`
 * injection) is deliberate — the credential-expiry bookkeeping only runs on
 * the production wiring.
 */
function seedSettingsBackedVelaSession(): { configuredEnv: Record<string, string> } {
  const amrHome = mkdtempSync(join(tmpdir(), 'od-vela-auth-classification-'));
  tempDirs.push(amrHome);
  vi.stubEnv('AMR_HOME', amrHome);
  writeFileSync(
    join(amrHome, 'config.json'),
    JSON.stringify({
      profiles: {
        prod: {
          apiUrl: 'https://vela.example',
          controlKey: 'file-control-key',
        },
      },
    }),
    'utf8',
  );
  return {
    configuredEnv: {
      VELA_LINK_URL: 'https://settings.example/link',
      VELA_RUNTIME_KEY: 'settings-runtime-key',
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

async function startDirectoryServer(
  fetchWorkspaceDirectory: () => Promise<
    Awaited<ReturnType<typeof fetchVelaWorkspaceDirectory>>
  >,
) {
  const app = express();
  app.use(express.json());
  registerCollabContextRoutes(app, {
    workspaceContext: createDevWorkspaceContextProvider(),
    fetchWorkspaceDirectory,
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  const base = `http://127.0.0.1:${address.port}`;
  return async (route: string) => {
    const response = await fetch(`${base}${route}`);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
}

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  clearVelaAuthorizationState();
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('vela credential expiry classification', () => {
  it('does not expire the credential when the workspace directory answers 403', async () => {
    const { configuredEnv } = seedSettingsBackedVelaSession();

    await expect(fetchVelaWorkspaceDirectory({
      configuredEnv,
      fetch: async () => jsonResponse(403, { error: 'missing_principal' }),
    })).resolves.toEqual({
      ok: false,
      items: [],
      reason: 'upstream',
      status: 403,
    });

    // The credential was never rejected — only the upstream principal lookup
    // failed — so the session must stay usable and the client must stay put.
    expect(readVelaLoginStatus(process.env, configuredEnv)).toMatchObject({
      loggedIn: true,
      sessionState: 'authenticated',
    });
  });

  it('still expires the credential when the workspace directory answers 401', async () => {
    const { configuredEnv } = seedSettingsBackedVelaSession();

    await expect(fetchVelaWorkspaceDirectory({
      configuredEnv,
      fetch: async () => jsonResponse(401, { error: 'untrusted_caller' }),
    })).resolves.toMatchObject({
      ok: false,
      reason: 'unauthorized',
      status: 401,
    });

    expect(readVelaLoginStatus(process.env, configuredEnv)).toMatchObject({
      loggedIn: true,
      sessionState: 'reauth_required',
    });
  });

  it('clears an expired credential mark once the directory accepts it again', async () => {
    const { configuredEnv } = seedSettingsBackedVelaSession();

    await fetchVelaWorkspaceDirectory({
      configuredEnv,
      fetch: async () => jsonResponse(401, { error: 'untrusted_caller' }),
    });
    expect(readVelaLoginStatus(process.env, configuredEnv).sessionState)
      .toBe('reauth_required');

    // The same credential is accepted on the next poll. That is direct proof
    // the earlier rejection is over, so the daemon must stop demanding a fresh
    // sign-in without waiting for the user to log out and back in.
    await expect(fetchVelaWorkspaceDirectory({
      configuredEnv,
      fetch: async () => jsonResponse(200, []),
    })).resolves.toEqual({ ok: true, items: [] });

    expect(readVelaLoginStatus(process.env, configuredEnv).sessionState)
      .toBe('authenticated');
  });

  it('serves an upstream 403 to the client as a retryable authority outage', async () => {
    const { configuredEnv } = seedSettingsBackedVelaSession();
    const req = await startDirectoryServer(() => fetchVelaWorkspaceDirectory({
      configuredEnv,
      fetch: async () => jsonResponse(403, { error: 'missing_principal' }),
    }));

    // 503 + retryable is the shape the web shell maps to its `unavailable`
    // lane ("Sync recovering", last workspace preserved). A 401
    // AMR_AUTH_REQUIRED here is what navigates the user to onboarding.
    const response = await req('/api/workspace/directory');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      retryable: true,
    });
  });

  it('does not expire the credential when the wallet balance answers 403', async () => {
    const { configuredEnv } = seedSettingsBackedVelaSession();
    const reader = createVelaWalletSnapshotReader({
      fetch: (async () => new Response(JSON.stringify({ error: 'missing_principal' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
    });

    await expect(reader.read({ configuredEnv })).resolves.toMatchObject({
      status: 'unavailable',
      error: { code: 'upstream' },
    });

    expect(readVelaLoginStatus(process.env, configuredEnv).sessionState)
      .toBe('authenticated');
  });
});
