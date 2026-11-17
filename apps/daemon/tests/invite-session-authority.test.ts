import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceInvite } from '../src/collab/invite-create.js';
import { createDevWorkspaceContextProvider } from '../src/collab/workspace-context.js';
import { fetchVelaWorkspaceDirectory } from '../src/collab/vela-workspace-context.js';
import { registerCollabContextRoutes } from '../src/routes/collab-context.js';

const servers: http.Server[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const server of servers.reverse()) {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  servers.length = 0;
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function listen(app: express.Express): Promise<string> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no listener');
  return `http://127.0.0.1:${address.port}`;
}
const member = {
  workspaceId: 'selected-workspace', workspaceName: 'Selected workspace',
  workspaceType: 'team', workspaceMemberId: 'selected-member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', providerMode: 'platform_credits',
};
interface Call { method: string; path: string; authorization: string | undefined; body: unknown }
async function upstream() {
  const calls: Call[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, res) => {
    calls.push({ method: req.method, path: req.path, authorization: req.get('authorization'), body: req.body });
    if (req.method === 'GET' && req.path === '/api/v1/workspaces') return res.json({ items: [member] });
    if (req.path.endsWith('/consume')) return res.json({ workspaceMemberId: member.workspaceMemberId, currentWorkspaceContext: member });
    return res.status(201).json({ id: 'selected-invite', deliveryStatus: 'sent' });
  });
  return { url: await listen(app), calls };
}
async function sessions() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'od-invite-session-'));
  roots.push(home);
  vi.stubEnv('AMR_HOME', home);
  const fallback = await upstream();
  const selected = await upstream();
  vi.stubEnv('VELA_API_URL', fallback.url);
  vi.stubEnv('VELA_CONTROL_KEY', 'test-default-account');
  const configuredEnv = { VELA_API_URL: selected.url, VELA_CONTROL_KEY: 'test-selected-account', OPEN_DESIGN_AMR_PROFILE: 'feature-test' };
  return { fallback, selected, configuredEnv };
}
const headers = {
  'content-type': 'application/json', 'x-od-workspace-id': member.workspaceId,
  'x-od-workspace-member-id': member.workspaceMemberId,
};

describe('invitation creation and selected account authority', () => {
  it('uses the settings-selected session in the real invite helper, not the default account', async () => {
    const { fallback, selected, configuredEnv } = await sessions();
    const options = { fetch, configuredEnv };
    expect(await createWorkspaceInvite({ email: 'new@example.test', role: 'member', workspaceId: member.workspaceId }, options))
      .toEqual({ ok: true, inviteId: 'selected-invite' });
    expect(fallback.calls).toEqual([]);
    expect(selected.calls).toEqual([{
      method: 'POST', path: '/api/v1/workspaces/selected-workspace/invites', authorization: 'Bearer test-selected-account',
      body: { invitedEmail: 'new@example.test', role: 'member' },
    }]);
  });
  it.each([false, true])('keeps authorization and creation on one configured account when settings change=%s', async (changeSettings) => {
    const { fallback, selected, configuredEnv } = await sessions();
    const app = express();
    app.use(express.json());
    let currentEnv = configuredEnv;
    registerCollabContextRoutes(app, {
      workspaceContext: createDevWorkspaceContextProvider(), configuredEnv: () => currentEnv,
      fetchWorkspaceDirectory: async () => {
        const directory = await fetchVelaWorkspaceDirectory({ configuredEnv: currentEnv });
        if (changeSettings) currentEnv = { ...configuredEnv, VELA_API_URL: fallback.url, VELA_CONTROL_KEY: 'test-default-account' };
        return directory;
      },
    });
    const url = await listen(app);
    const result = await fetch(`${url}/api/workspace/invite`, {
      method: 'POST', headers,
      body: JSON.stringify({ invites: [{ email: 'first@example.test', role: 'member' }, { email: 'second@example.test', role: 'member' }] }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ results: [{ ok: true }, { ok: true }] });
    expect(fallback.calls).toEqual([]);
    expect(selected.calls.map(call => [call.method, call.path, call.authorization])).toEqual([
      ['GET', '/api/v1/workspaces', 'Bearer test-selected-account'],
      ['POST', '/api/v1/workspaces/selected-workspace/invites', 'Bearer test-selected-account'],
      ['POST', '/api/v1/workspaces/selected-workspace/invites', 'Bearer test-selected-account'],
    ]);
  });
  it('never sends with the default account when the selected profile is signed out', async () => {
    const { fallback, selected, configuredEnv } = await sessions();
    const options = { fetch, configuredEnv: { ...configuredEnv, VELA_CONTROL_KEY: '' } };
    expect(await createWorkspaceInvite({ email: 'new@example.test', role: 'member', workspaceId: member.workspaceId }, options))
      .toEqual({ ok: false, status: 401, error: 'no_session' });
    expect(fallback.calls).toEqual([]);
    expect(selected.calls).toEqual([]);
  });

  it('keeps invite acceptance on the selected session and returns its actual target member', async () => {
    const { fallback, selected, configuredEnv } = await sessions();
    const app = express();
    app.use(express.json());
    registerCollabContextRoutes(app, {
      workspaceContext: createDevWorkspaceContextProvider(), configuredEnv: () => configuredEnv,
    });
    const url = await listen(app);
    const result = await fetch(`${url}/api/workspace/invite/continue`, {
      method: 'POST', headers, body: JSON.stringify({ nonce: 'one-time-nonce', workspaceMemberId: 'forged-member' }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ workspaceMemberId: member.workspaceMemberId, context: {
      workspaceId: member.workspaceId, workspaceMemberId: member.workspaceMemberId,
    } });
    expect(fallback.calls).toEqual([]);
    expect(selected.calls).toMatchObject([{
      method: 'POST', path: '/api/v1/workspace-invites/continuations/one-time-nonce/consume', authorization: 'Bearer test-selected-account',
    }]);
  });
});
