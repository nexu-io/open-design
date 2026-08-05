import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  registerCollabContextRoutes,
  type RegisterCollabContextRoutesDeps,
} from '../src/routes/collab-context.js';
import {
  createDevWorkspaceContextProvider,
  parseWorkspaceCollabContext,
} from '../src/collab/workspace-context.js';
import { createWorkspaceBillingRuntimeCoordinator } from '../src/collab/workspace-billing-runtime.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

/** The minimal payload a dev/demo run PUTs — only enum + identity fields. */
const TEAM_CONTEXT = {
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  displayName: 'Ma Shu',
};

const ADMIN_CONTEXT = {
  ...TEAM_CONTEXT,
  role: 'admin',
};

const TEAM_DIRECTORY_ITEM = {
  workspaceId: 'wm-1',
  workspaceName: 'Workspace 1',
  workspaceType: 'team' as const,
  workspaceMemberId: 'wm-1',
  role: 'member' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

const TEAM_HEADERS = {
  'x-od-workspace-id': 'wm-1',
  'x-od-workspace-member-id': 'wm-1',
};

/** What `parseWorkspaceCollabContext` returns: the minimal input enriched with the
 *  fields it derives — workspaceId fallback, provider/billing defaults, and the
 *  permissions + seat summary derived through B's shared helpers. */
const TEAM_CONTEXT_PARSED: WorkspaceCollabContext = {
  workspaceId: 'wm-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  // Invariant: a team context always carries teamId (the workspace IS the
  // team scope) — collab gates on it, so the parser pins it when omitted.
  teamId: 'wm-1',
  displayName: 'Ma Shu',
};

async function startContextServer(
  overrides: Partial<Omit<RegisterCollabContextRoutesDeps, 'workspaceContext'>> = {},
) {
  const app = express();
  app.use(express.json());
  registerCollabContextRoutes(app, {
    workspaceContext: createDevWorkspaceContextProvider(),
    ...overrides,
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async req(
      route: string,
      options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) {
      const init: RequestInit = { method: options.method ?? 'GET' };
      if (options.headers) init.headers = options.headers;
      if (options.body !== undefined) {
        init.headers = { ...options.headers, 'content-type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(`${base}${route}`, init);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
  };
}

describe('parseWorkspaceCollabContext', () => {
  it('accepts a well-formed team context and derives permissions/seats', () => {
    expect(parseWorkspaceCollabContext(TEAM_CONTEXT)).toEqual(TEAM_CONTEXT_PARSED);
  });

  it('rejects a bad enum or a missing member id', () => {
    expect(parseWorkspaceCollabContext({ ...TEAM_CONTEXT, role: 'viewer' })).toBeNull();
    expect(parseWorkspaceCollabContext({ ...TEAM_CONTEXT, lifecycleState: 'frozen' })).toBeNull();
    expect(parseWorkspaceCollabContext({ ...TEAM_CONTEXT, workspaceMemberId: '' })).toBeNull();
  });
});

describe('collab context routes', () => {
  it('requires an explicit workspace/member pair before any context is set', async () => {
    const api = await startContextServer();
    const response = await api.req('/api/workspace/context');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('WORKSPACE_CONTEXT_REQUIRED');
  });

  it('round-trips a context set via the dev PUT for an explicit directory membership', async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [TEAM_DIRECTORY_ITEM],
      }),
    });
    const put = await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ context: TEAM_CONTEXT_PARSED });
    expect((await api.req('/api/workspace/context', {
      headers: TEAM_HEADERS,
    })).body).toEqual({ context: TEAM_CONTEXT_PARSED });
  });

  it('observes authoritative workspace size without sending names or member identity', async () => {
    const observeWorkspace = vi.fn();
    const api = await startContextServer({
      observeWorkspace,
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [TEAM_DIRECTORY_ITEM],
      }),
    });

    const put = await api.req('/api/workspace/context', {
      method: 'PUT',
      body: TEAM_CONTEXT,
    });
    expect(put.status).toBe(200);
    observeWorkspace.mockClear();
    const response = await api.req('/api/workspace/context', {
      headers: TEAM_HEADERS,
    });

    expect(response.status).toBe(200);
    expect(observeWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      TEAM_CONTEXT_PARSED,
      {
        workspace_type: 'team',
        workspace_lifecycle: 'active',
        billing_state: 'active',
        plan_bucket: 'free',
        provider_mode: 'platform_credits',
        seat_limit: 5,
        member_count: 1,
        seat_state: 'available',
      },
    );
    expect(observeWorkspace.mock.calls[0]?.[2]).not.toHaveProperty('displayName');
    expect(observeWorkspace.mock.calls[0]?.[2]).not.toHaveProperty('workspaceMemberId');
  });

  it('clears dev enrichment but retains directory-authorized exact context', async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [TEAM_DIRECTORY_ITEM],
      }),
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });
    const cleared = await api.req('/api/workspace/context', { method: 'PUT', body: {} });
    expect(cleared.body).toEqual({ context: null });
    const exact = await api.req('/api/workspace/context', {
      headers: TEAM_HEADERS,
    });
    expect(exact.status).toBe(200);
    expect(exact.body.context).toMatchObject({
      workspaceId: 'wm-1',
      workspaceMemberId: 'wm-1',
      role: 'member',
    });
  });

  it('rejects an invalid context body', async () => {
    const api = await startContextServer();
    const res = await api.req('/api/workspace/context', { method: 'PUT', body: { workspaceType: 'team' } });
    expect(res.status).toBe(400);
  });

  it('requires an explicit workspace/member pair instead of borrowing daemon current state', async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: 'ws-a',
            workspaceName: 'Workspace A',
            workspaceType: 'team',
            workspaceMemberId: 'wm-a',
            role: 'member',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
          {
            workspaceId: 'ws-b',
            workspaceName: 'Workspace B',
            workspaceType: 'team',
            workspaceMemberId: 'wm-b',
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }),
    });
    await api.req('/api/workspace/context', {
      method: 'PUT',
      body: {
        ...TEAM_CONTEXT,
        workspaceId: 'ws-b',
        workspaceMemberId: 'wm-b',
        role: 'owner',
      },
    });

    const missing = await api.req('/api/workspace/context');
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('WORKSPACE_CONTEXT_REQUIRED');

    const explicitA = await api.req('/api/workspace/context', {
      headers: {
        'x-od-workspace-id': 'ws-a',
        'x-od-workspace-member-id': 'wm-a',
      },
    });
    expect(explicitA.status).toBe(200);
    expect(explicitA.body.context).toMatchObject({
      workspaceId: 'ws-a',
      workspaceMemberId: 'wm-a',
      role: 'member',
    });
  });

  it('fails retryably when the membership authority cannot verify an explicit context', async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({ ok: false, items: [] }),
    });
    const response = await api.req('/api/workspace/context', {
      headers: {
        'x-od-workspace-id': 'ws-a',
        'x-od-workspace-member-id': 'wm-a',
      },
    });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      retryable: true,
    });
  });

  it('keeps workspace selection request-local and does not mutate the daemon active pin', async () => {
    const setActive = vi.fn(async () => {});
    const api = await startContextServer({
      activeWorkspace: {
        get: () => 'ws-a',
        set: setActive,
        clear: async () => {},
      },
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [{
          workspaceId: 'ws-b',
          workspaceName: 'Workspace B',
          workspaceType: 'team',
          workspaceMemberId: 'wm-b',
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }],
      }),
    });

    const response = await api.req('/api/workspace/active', {
      method: 'PUT',
      body: { workspaceId: 'ws-b', workspaceMemberId: 'wm-b' },
    });
    expect(response.status).toBe(200);
    expect(response.body.context).toMatchObject({
      workspaceId: 'ws-b',
      workspaceMemberId: 'wm-b',
    });
    expect(setActive).not.toHaveBeenCalled();
  });
});

describe('workspace billing routes', () => {
  const teamHeaders = (workspaceId = 'wm-1', workspaceMemberId = 'member-1') => ({
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-member-id': workspaceMemberId,
    // This claim is deliberately not authority. The directory row below is.
    'x-od-workspace-role': 'owner',
  });
  const teamDirectory = (workspaceId = 'wm-1') => [{
    workspaceId,
    workspaceName: 'Workspace',
    workspaceType: 'team' as const,
    workspaceMemberId: 'member-1',
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
  }];
  const personalDirectory = (workspaceId = 'personal-1') => [{
    ...teamDirectory(workspaceId)[0]!,
    workspaceType: 'personal' as const,
    workspaceMemberId: 'personal-owner',
    role: 'owner' as const,
  }];

  it('authorizes and atomically replaces a renderer full billing interest set', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => [
        ...teamDirectory('wm-1'),
        {
          ...teamDirectory('wm-2')[0]!,
          workspaceMemberId: 'member-2',
        },
      ],
    });
    const declared = await api.req(
      '/api/workspace/billing/interests/renderer-1',
      {
        method: 'PUT',
        body: {
          generation: '1',
          interests: [
            { workspaceId: 'wm-1', workspaceMemberId: 'member-1' },
            { workspaceId: 'wm-2', workspaceMemberId: 'member-2' },
          ],
        },
      },
    );
    expect(declared.status).toBe(200);
    expect(declared.body).toMatchObject({
      clientId: 'renderer-1',
      acceptedGeneration: '1',
    });

    const replaced = await api.req(
      '/api/workspace/billing/interests/renderer-1',
      {
        method: 'PUT',
        body: {
          generation: '2',
          interests: [{ workspaceId: 'wm-2', workspaceMemberId: 'member-2' }],
        },
      },
    );
    expect(replaced.status).toBe(200);
    expect(replaced.body.acceptedGeneration).toBe('2');

    const released = await api.req(
      '/api/workspace/billing/interests/renderer-1?generation=2',
      { method: 'DELETE' },
    );
    expect(released.body).toEqual({ ok: true, released: true });
  });

  it('rejects an interest whose exact workspace/member pair is not authorized', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
    });
    const response = await api.req(
      '/api/workspace/billing/interests/renderer-1',
      {
        method: 'PUT',
        body: {
          generation: '1',
          interests: [{ workspaceId: 'wm-1', workspaceMemberId: 'member-other' }],
        },
      },
    );
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'workspace_not_authorized' });
  });

  it('does not revoke another client when a stale member declares the same workspace', async () => {
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async ({ workspaceId, workspaceMemberId }) => ({
        snapshot: null,
        workspaceBalance: {
          workspaceId,
          workspaceMemberId,
          balanceUsd: '7.89',
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: '2026-07-27T00:00:00Z',
        },
      }),
    });
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      billingRuntime: runtime,
    });
    const valid = await api.req('/api/workspace/billing/interests/valid-renderer', {
      method: 'PUT',
      body: {
        generation: '1',
        interests: [{ workspaceId: 'wm-1', workspaceMemberId: 'member-1' }],
      },
    });
    expect(valid.status).toBe(200);

    const stale = await api.req('/api/workspace/billing/interests/stale-renderer', {
      method: 'PUT',
      body: {
        generation: '1',
        interests: [{ workspaceId: 'wm-1', workspaceMemberId: 'member-old' }],
      },
    });
    expect(stale.status).toBe(403);
    expect(runtime.interestedKeys()).toEqual([
      { workspaceId: 'wm-1', workspaceMemberId: 'member-1' },
    ]);
    runtime.dispose();
  });

  // recvqgaMLxEdZX: the URL workspace id is the selection source. Membership
  // authorization comes from the independently fetched directory, not from
  // daemon-global active/current state: two clients may address different
  // workspaces through the same daemon without switching each other.
  it('returns the explicit backend-scoped balance even when current points elsewhere', async () => {
    const accountCalls: string[] = [];
    const workspaceCalls: string[] = [];
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBilling: async () => {
        accountCalls.push('account');
        return {
          workspaceId: null,
          membershipTier: 'team_plus',
          totalAvailableCredits: 1_386_294,
          subscriptionCredits: 1_000_000,
          rechargeCredits: 386_294,
          balanceUsd: '13.86',
          subscriptionStatus: 'active',
          availableActions: ['billing_portal'],
          workspaceBalance: null,
        };
      },
      fetchWorkspaceBalance: async (workspaceId) => {
        workspaceCalls.push(workspaceId);
        return {
          workspaceId: 'wm-1',
          workspaceMemberId: 'member-1',
          balanceUsd: '7.89',
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: '2026-07-26T12:00:00Z',
        };
      },
    });
    await api.req('/api/workspace/context', {
      method: 'PUT',
      body: { ...TEAM_CONTEXT, workspaceMemberId: 'wm-other' },
    });

    const res = await api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');

    expect(res.status).toBe(200);
    expect(accountCalls).toEqual(['account']);
    expect(workspaceCalls).toEqual(['wm-1']);
    expect(res.body.summary).toMatchObject({
      workspaceId: null,
      membershipTier: 'team_plus',
      workspaceBalance: null,
    });
    expect(res.body.workspaceBalance).toMatchObject({
      workspaceId: 'wm-1',
      balanceUsd: '7.89',
      billingScopeVersion: 2,
    });
  });

  it('returns a Personal Workspace balance only after exact directory authorization', async () => {
    const workspaceCalls: string[] = [];
    const api = await startContextServer({
      listWorkspaceDirectory: async () => personalDirectory(),
      fetchBilling: async () => ({
        workspaceId: null,
        membershipTier: 'plus',
        totalAvailableCredits: 999_000,
        subscriptionCredits: 999_000,
        rechargeCredits: 0,
        balanceUsd: '99.90',
        subscriptionStatus: 'active',
        availableActions: [],
        workspaceBalance: null,
      }),
      fetchWorkspaceBalance: async (workspaceId) => {
        workspaceCalls.push(workspaceId);
        return {
          workspaceId,
          workspaceMemberId: 'personal-owner',
          balanceUsd: '12.34',
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: null,
        };
      },
    });

    const res = await api.req(
      '/api/workspace/billing?scope=workspace&workspaceId=personal-1',
    );

    expect(res.status).toBe(200);
    expect(workspaceCalls).toEqual(['personal-1']);
    expect(res.body.workspaceBalance).toMatchObject({
      workspaceId: 'personal-1',
      workspaceMemberId: 'personal-owner',
      balanceUsd: '12.34',
      billingScopeVersion: 2,
    });
  });

  it('returns an authorized atomic workspace plan and wallet snapshot additively', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBilling: async () => null,
      fetchWorkspaceBillingProjection: async () => ({
        snapshot: {
          schemaVersion: 1,
          workspaceId: 'wm-1',
          workspaceMemberId: 'member-1',
          billingScopeVersion: 2,
          billing: { billingState: 'active', planId: 'team_plus' },
          wallet: {
            balanceUsd: '7.89',
            expiresAt: null,
            updatedAt: '2026-07-27T00:00:00Z',
          },
          revisions: { billing: 'billing-2', wallet: 'wallet-2' },
        },
        workspaceBalance: {
          workspaceId: 'wm-1',
          workspaceMemberId: 'member-1',
          balanceUsd: '7.89',
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: '2026-07-27T00:00:00Z',
        },
      }),
    });

    const res = await api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');

    expect(res.status).toBe(200);
    expect(res.body.workspaceSnapshot).toMatchObject({
      workspaceId: 'wm-1',
      workspaceMemberId: 'member-1',
      billing: { billingState: 'active', planId: 'team_plus' },
      revisions: { billing: 'billing-2', wallet: 'wallet-2' },
    });
    expect(res.body.workspaceBalance).toMatchObject({
      workspaceId: 'wm-1',
      workspaceMemberId: 'member-1',
      balanceUsd: '7.89',
    });
  });

  it('single-flights simultaneous exact-scope billing reads in the daemon', async () => {
    let projectionCalls = 0;
    let releaseProjection!: () => void;
    const projectionGate = new Promise<void>((resolve) => {
      releaseProjection = resolve;
    });
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBilling: async () => null,
      fetchWorkspaceBillingProjection: async () => {
        projectionCalls += 1;
        await projectionGate;
        return {
          snapshot: {
            schemaVersion: 1,
            workspaceId: 'wm-1',
            workspaceMemberId: 'member-1',
            billingScopeVersion: 2,
            billing: { billingState: 'active', planId: 'team_plus' },
            wallet: {
              balanceUsd: '7.89',
              expiresAt: null,
              updatedAt: '2026-07-27T00:00:00Z',
            },
            revisions: { billing: 'billing-2', wallet: 'wallet-2' },
          },
          workspaceBalance: {
            workspaceId: 'wm-1',
            workspaceMemberId: 'member-1',
            balanceUsd: '7.89',
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: '2026-07-27T00:00:00Z',
          },
        };
      },
    });

    const first = api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');
    const second = api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');
    await vi.waitFor(() => expect(projectionCalls).toBeGreaterThan(0));
    try {
      expect(projectionCalls).toBe(1);
    } finally {
      releaseProjection();
    }

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(projectionCalls).toBe(1);
    expect(firstResponse.body.workspaceRuntime).toMatchObject({
      workspaceId: 'wm-1',
      workspaceMemberId: 'member-1',
      status: 'fresh',
      revision: '2',
    });
    expect(secondResponse.body.workspaceRuntime).toEqual(firstResponse.body.workspaceRuntime);
  });

  it('clears daemon state and returns 403 when membership disappears', async () => {
    let authorized = true;
    const api = await startContextServer({
      listWorkspaceDirectory: async () => authorized ? teamDirectory('wm-1') : [],
      fetchBilling: async () => null,
      fetchWorkspaceBillingProjection: async () => ({
        snapshot: null,
        workspaceBalance: {
          workspaceId: 'wm-1',
          workspaceMemberId: 'member-1',
          balanceUsd: '7.89',
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: '2026-07-27T00:00:00Z',
        },
      }),
    });
    const headers = {
      'x-od-workspace-runtime-client-id': 'window-1',
      'x-od-workspace-runtime-generation': '1',
    };

    const initial = await api.req(
      '/api/workspace/billing?scope=workspace&workspaceId=wm-1',
      { headers },
    );
    expect(initial.body.workspaceBalance.balanceUsd).toBe('7.89');
    authorized = false;

    const revoked = await api.req(
      '/api/workspace/billing?scope=workspace&workspaceId=wm-1',
      { headers },
    );
    expect(revoked.status).toBe(403);
    expect(revoked.body).toEqual({ error: 'workspace_not_authorized' });
  });

  it('retains internal last-good state across a transient directory outage', async () => {
    let directoryAvailable = true;
    let balance = '7.89';
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({
        ok: directoryAvailable,
        items: directoryAvailable ? teamDirectory('wm-1') : [],
      }),
      fetchBilling: async () => null,
      fetchWorkspaceBillingProjection: async () => ({
        snapshot: null,
        workspaceBalance: {
          workspaceId: 'wm-1',
          workspaceMemberId: 'member-1',
          balanceUsd: balance,
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: '2026-07-27T00:00:00Z',
        },
      }),
    });
    const request = (generation: string) =>
      api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1', {
        headers: {
          'x-od-workspace-runtime-client-id': 'window-1',
          'x-od-workspace-runtime-generation': generation,
        },
      });

    expect((await request('1')).body.workspaceBalance.balanceUsd).toBe('7.89');
    directoryAvailable = false;
    const unavailable = await request('1');
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({ error: 'workspace_directory_unavailable' });

    directoryAvailable = true;
    balance = '8.99';
    const recovered = await request('2');
    expect(recovered.body).toMatchObject({
      workspaceBalance: { balanceUsd: '8.99' },
      workspaceRuntime: { status: 'fresh' },
    });
  });

  it('returns 503 instead of last-good money when an authoritative action catch-up fails', async () => {
    let calls = 0;
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBilling: async () => null,
      fetchWorkspaceBillingProjection: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            snapshot: null,
            workspaceBalance: {
              workspaceId: 'wm-1',
              workspaceMemberId: 'member-1',
              balanceUsd: '7.89',
              billingScopeVersion: 2,
              expiresAt: null,
              updatedAt: '2026-07-27T00:00:00Z',
            },
          };
        }
        throw Object.assign(new Error('upstream unavailable'), { code: 'temporary' });
      },
    });

    expect((await api.req(
      '/api/workspace/billing?scope=workspace&workspaceId=wm-1',
    )).status).toBe(200);
    const action = await api.req(
      '/api/workspace/billing?scope=workspace&workspaceId=wm-1&freshness=authoritative',
    );
    expect(action.status).toBe(503);
    expect(action.body).toEqual({ error: 'temporary' });
    expect(calls).toBe(2);
  });

  it('marks a successful action read with exact authoritative workspace proof', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBilling: async () => null,
      fetchWorkspaceBillingProjection: async () => ({
        snapshot: null,
        workspaceBalance: {
          workspaceId: 'wm-1',
          workspaceMemberId: 'member-1',
          balanceUsd: '7.89',
          billingScopeVersion: 2,
          expiresAt: null,
          updatedAt: '2026-07-27T00:00:00Z',
        },
      }),
    });

    const action = await api.req(
      '/api/workspace/billing?scope=workspace&workspaceId=wm-1&freshness=authoritative',
    );
    expect(action.status).toBe(200);
    expect(action.body.workspaceRuntime).toMatchObject({
      workspaceId: 'wm-1',
      workspaceMemberId: 'member-1',
      status: 'fresh',
    });
    expect(action.body.authoritativeWorkspaceRead).toEqual({
      workspaceId: 'wm-1',
      workspaceMemberId: 'member-1',
      observedAt: action.body.workspaceRuntime.observedAt,
    });
  });

  it('reads the account summary explicitly without requesting a workspace balance', async () => {
    const accountCalls: string[] = [];
    const workspaceCalls: string[] = [];
    const api = await startContextServer({
      fetchBilling: async () => {
        accountCalls.push('account');
        return {
          workspaceId: null,
          membershipTier: '',
          totalAvailableCredits: 0,
          subscriptionCredits: 0,
          rechargeCredits: 0,
          balanceUsd: '0',
          subscriptionStatus: '',
          availableActions: [],
          workspaceBalance: null,
        };
      },
      fetchWorkspaceBalance: async (workspaceId) => {
        workspaceCalls.push(workspaceId);
        return null;
      },
    });

    const res = await api.req('/api/workspace/billing?scope=account');

    expect(res.status).toBe(200);
    expect(accountCalls).toEqual(['account']);
    expect(workspaceCalls).toEqual([]);
    expect(res.body.summary).toMatchObject({ workspaceId: null, workspaceBalance: null });
    expect(res.body.workspaceBalance).toBeNull();
  });

  it('fails closed when the explicit workspace is absent from the membership directory', async () => {
    const calls: string[] = [];
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBilling: async () => {
        calls.push('account');
        return null;
      },
      fetchWorkspaceBalance: async (workspaceId) => {
        calls.push(workspaceId);
        return null;
      },
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });

    const res = await api.req('/api/workspace/billing?scope=workspace&workspaceId=other');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'workspace_not_authorized' });
    expect(calls).toEqual([]);
  });

  it('rejects missing or contradictory billing scope parameters', async () => {
    const api = await startContextServer();
    expect((await api.req('/api/workspace/billing')).status).toBe(400);
    expect((await api.req('/api/workspace/billing?scope=workspace')).status).toBe(400);
    expect(
      (await api.req('/api/workspace/billing?scope=account&workspaceId=wm-1')).status,
    ).toBe(400);
  });

  it('keeps account metadata separate when the scoped balance is unavailable', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory(),
      fetchBilling: async () => ({
        workspaceId: null,
        membershipTier: 'team_plus',
        totalAvailableCredits: 10,
        subscriptionCredits: 10,
        rechargeCredits: 0,
        balanceUsd: '999.00',
        subscriptionStatus: 'active',
        availableActions: [],
        workspaceBalance: null,
      }),
      fetchWorkspaceBalance: async () => null,
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });

    const res = await api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      membershipTier: 'team_plus',
      balanceUsd: '999.00',
      workspaceBalance: null,
    });
    expect(res.body.workspaceBalance).toBeNull();
  });

  it('preserves a proven workspace balance when the account summary is unavailable', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory(),
      fetchBilling: async () => null,
      fetchWorkspaceBalance: async () => ({
        workspaceId: 'wm-1',
        workspaceMemberId: 'member-1',
        balanceUsd: '7.89',
        billingScopeVersion: 2,
        expiresAt: null,
        updatedAt: null,
      }),
    });

    const res = await api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.workspaceBalance).toMatchObject({
      workspaceId: 'wm-1',
      balanceUsd: '7.89',
      billingScopeVersion: 2,
    });
  });

  it('rejects a workspace wallet issued to a different directory membership', async () => {
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory(),
      fetchBilling: async () => null,
      fetchWorkspaceBalance: async () => ({
        workspaceId: 'wm-1',
        workspaceMemberId: 'different-member',
        balanceUsd: '7.89',
        billingScopeVersion: 2,
        expiresAt: null,
        updatedAt: null,
      }),
    });

    const res = await api.req('/api/workspace/billing?scope=workspace&workspaceId=wm-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      summary: null,
      workspaceBalance: null,
      workspaceRuntime: {
        workspaceId: 'wm-1',
        workspaceMemberId: 'member-1',
        status: 'error',
        errorCode: 'workspace_billing_scope_mismatch',
      },
    });
  });

  it('rejects billing catalog and checkout without an explicit verified workspace', async () => {
    const fetchBillingCatalog = vi.fn(async () => null);
    const startCheckout = vi.fn(async () => null);
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory(),
      fetchBillingCatalog,
      startCheckout,
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });

    const catalog = await api.req('/api/workspace/billing/catalog');
    const checkout = await api.req('/api/workspace/billing/checkout', {
      method: 'POST',
      body: { planId: 'team_pro', seats: 3 },
    });

    expect(catalog.status).toBe(400);
    expect(catalog.body.error).toBe('WORKSPACE_CONTEXT_REQUIRED');
    expect(checkout.status).toBe(400);
    expect(checkout.body.error).toBe('WORKSPACE_CONTEXT_REQUIRED');
    expect(fetchBillingCatalog).not.toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('rejects billing catalog and checkout when the claimed membership is not in the directory', async () => {
    const fetchBillingCatalog = vi.fn(async () => null);
    const startCheckout = vi.fn(async () => null);
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory('wm-1'),
      fetchBillingCatalog,
      startCheckout,
    });
    const spoofedHeaders = teamHeaders('wm-2', 'attacker-member');

    const catalog = await api.req('/api/workspace/billing/catalog', {
      headers: spoofedHeaders,
    });
    const checkout = await api.req('/api/workspace/billing/checkout', {
      method: 'POST',
      headers: spoofedHeaders,
      body: { planId: 'team_pro', seats: 3 },
    });

    expect(catalog.status).toBe(403);
    expect(catalog.body.error).toBe('WORKSPACE_ACCESS_DENIED');
    expect(checkout.status).toBe(403);
    expect(checkout.body.error).toBe('WORKSPACE_ACCESS_DENIED');
    expect(fetchBillingCatalog).not.toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('returns the real team billing catalog for the directory-verified workspace', async () => {
    const calls: string[] = [];
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory(),
      fetchBillingCatalog: async (workspaceId) => {
        calls.push(workspaceId);
        return {
          workspaceId,
          billingInterval: 'monthly',
          plans: [
            {
              planId: 'team_plus',
              seatUnitAmountCents: 3900,
              currency: 'usd',
              minSeats: 1,
              status: 'active',
            },
          ],
        };
      },
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });

    const res = await api.req('/api/workspace/billing/catalog', {
      headers: teamHeaders(),
    });

    expect(res.status).toBe(200);
    expect(calls).toEqual(['wm-1']);
    expect(res.body).toEqual({
      catalog: {
        workspaceId: 'wm-1',
        billingInterval: 'monthly',
        plans: [
          {
            planId: 'team_plus',
            seatUnitAmountCents: 3900,
            currency: 'usd',
            minSeats: 1,
            status: 'active',
          },
        ],
      },
    });
  });

  it('starts checkout with directory-derived id and ignores spoofed body and role authority', async () => {
    const calls: Array<{ workspaceId?: string; planId?: string; seats?: number }> = [];
    const api = await startContextServer({
      listWorkspaceDirectory: async () => teamDirectory(),
      startCheckout: async (input) => {
        calls.push(input);
        return 'https://checkout.stripe.test/cs_team';
      },
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });

    const res = await api.req('/api/workspace/billing/checkout', {
      method: 'POST',
      headers: teamHeaders(),
      body: { workspaceId: 'spoofed', planId: 'team_pro', seats: 3 },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checkoutUrl: 'https://checkout.stripe.test/cs_team' });
    expect(calls).toEqual([{ workspaceId: 'wm-1', planId: 'team_pro', seats: 3 }]);
  });

  it('keeps checkout pinned to the verified workspace while active workspace switches', async () => {
    let releaseCheckout!: () => void;
    const checkoutStarted = new Promise<void>((resolve) => {
      releaseCheckout = resolve;
    });
    let observeCheckout!: (input: { workspaceId?: string }) => void;
    const observedCheckout = new Promise<{ workspaceId?: string }>((resolve) => {
      observeCheckout = resolve;
    });
    const api = await startContextServer({
      listWorkspaceDirectory: async () => [
        ...teamDirectory('wm-1'),
        {
          ...teamDirectory('wm-2')[0]!,
          workspaceMemberId: 'member-2',
        },
      ],
      startCheckout: async (input) => {
        observeCheckout(input);
        await checkoutStarted;
        return 'https://checkout.stripe.test/cs_team';
      },
    });
    await api.req('/api/workspace/context', { method: 'PUT', body: TEAM_CONTEXT });

    const checkoutPromise = api.req('/api/workspace/billing/checkout', {
      method: 'POST',
      headers: teamHeaders('wm-1', 'member-1'),
      body: { planId: 'team_plus' },
    });
    const captured = await observedCheckout;
    await api.req('/api/workspace/context', {
      method: 'PUT',
      body: {
        ...TEAM_CONTEXT,
        workspaceId: 'wm-2',
        workspaceMemberId: 'member-2',
      },
    });
    releaseCheckout();
    const response = await checkoutPromise;

    expect(response.status).toBe(200);
    expect(captured.workspaceId).toBe('wm-1');
    expect(response.body.checkoutUrl).toBe('https://checkout.stripe.test/cs_team');
  });
});

describe('POST /api/workspace/invite', () => {
  const headers = {
    'x-od-workspace-id': 'wm-1',
    'x-od-workspace-member-id': 'wm-1',
    'x-od-workspace-role': 'owner',
  };
  const directory = (role: 'admin' | 'member' = 'admin') => ({
    ok: true,
    items: [{
      workspaceId: 'wm-1',
      workspaceName: 'Team One',
      workspaceType: 'team' as const,
      workspaceMemberId: 'wm-1',
      role,
      memberStatus: 'active' as const,
      lifecycleState: 'active' as const,
    }],
  });

  it('creates each invite against the verified workspaceId and reports per-row results', async () => {
    const calls: Array<{ email: string; role: string; workspaceId: string }> = [];
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => directory('admin'),
      createInvite: async (input) => {
        calls.push(input);
        return { ok: true, inviteId: `inv-${input.email}` };
      },
    });
    const res = await api.req('/api/workspace/invite', {
      method: 'POST',
      headers,
      body: { invites: [{ email: 'a@x.com', role: 'admin' }, { email: 'b@x.com', role: 'member' }] },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [
        { email: 'a@x.com', ok: true, inviteId: 'inv-a@x.com' },
        { email: 'b@x.com', ok: true, inviteId: 'inv-b@x.com' },
      ],
    });
    expect(calls).toEqual([
      { email: 'a@x.com', role: 'admin', workspaceId: 'wm-1' },
      { email: 'b@x.com', role: 'member', workspaceId: 'wm-1' },
    ]);
  });

  it('400s an empty invite list', async () => {
    const api = await startContextServer();
    const res = await api.req('/api/workspace/invite', { method: 'POST', body: { invites: [] } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing_invites' });
  });

  it('400s when no explicit workspace identity is provided', async () => {
    const api = await startContextServer({
      createInvite: async () => ({ ok: true, inviteId: 'inv-x' }),
    });
    const res = await api.req('/api/workspace/invite', {
      method: 'POST',
      body: { invites: [{ email: 'a@x.com', role: 'member' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('WORKSPACE_CONTEXT_REQUIRED');
  });

  it('403s when the verified team member cannot invite teammates', async () => {
    let called = false;
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => directory('member'),
      createInvite: async () => {
        called = true;
        return { ok: true, inviteId: 'inv-x' };
      },
    });

    const res = await api.req('/api/workspace/invite', {
      method: 'POST',
      headers,
      body: { invites: [{ email: 'a@x.com', role: 'member' }] },
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(called).toBe(false);
  });

  it('short-circuits to 401 no_session', async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => directory('admin'),
      createInvite: async () => ({ ok: false, status: 401, error: 'no_session' }),
    });
    const res = await api.req('/api/workspace/invite', {
      method: 'POST',
      headers,
      body: { invites: [{ email: 'a@x.com', role: 'member' }] },
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'no_session' });
  });

  it("degrades a failed B create (e.g. 404) to an ok:false result, HTTP 200", async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => directory('admin'),
      createInvite: async () => ({ ok: false, status: 404, error: 'create_404' }),
    });
    const res = await api.req('/api/workspace/invite', {
      method: 'POST',
      headers,
      body: { invites: [{ email: 'a@x.com', role: 'member' }] },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [{ email: 'a@x.com', ok: false, error: 'create_404' }] });
  });
});

describe('POST /api/workspace/invite/continue', () => {
  it('refreshes membership authority before returning a consumed continuation', async () => {
    const refreshWorkspaceDirectoryAfterMutation = vi.fn(async () => ({
      ok: true as const,
      items: [TEAM_DIRECTORY_ITEM],
    }));
    const api = await startContextServer({
      consumeInvite: async () => ({
        ok: true,
        context: TEAM_CONTEXT_PARSED,
        workspaceMemberId: 'wm-1',
      }),
      refreshWorkspaceDirectoryAfterMutation,
    });

    const response = await api.req('/api/workspace/invite/continue', {
      method: 'POST',
      body: { nonce: 'nonce-1' },
    });

    expect(response.status).toBe(200);
    expect(refreshWorkspaceDirectoryAfterMutation).toHaveBeenCalledOnce();
    expect(response.body).toEqual({
      context: TEAM_CONTEXT_PARSED,
      workspaceMemberId: 'wm-1',
    });
  });

  it('does not reverse a consumed continuation when authority refresh is unavailable', async () => {
    const api = await startContextServer({
      consumeInvite: async () => ({
        ok: true,
        context: TEAM_CONTEXT_PARSED,
        workspaceMemberId: 'wm-1',
      }),
      refreshWorkspaceDirectoryAfterMutation: async () => {
        throw new Error('directory unavailable');
      },
    });

    const response = await api.req('/api/workspace/invite/continue', {
      method: 'POST',
      body: { nonce: 'nonce-1' },
    });

    expect(response.status).toBe(200);
    expect(response.body.workspaceMemberId).toBe('wm-1');
  });
});

describe('GET /api/workspace/members', () => {
  it('passes the directory-verified Workspace context to the member service', async () => {
    const contexts: unknown[] = [];
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [{
          workspaceId: 'team-a',
          workspaceName: 'Team A',
          workspaceType: 'team',
          workspaceMemberId: 'member-a',
          role: 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
        }],
      }),
      listMembers: async (context) => {
        contexts.push(context);
        return [{ memberId: 'member-a', displayName: 'A', role: 'member' }];
      },
    });

    const response = await api.req('/api/workspace/members', {
      headers: {
        'x-od-workspace-id': 'team-a',
        'x-od-workspace-member-id': 'member-a',
        'x-od-workspace-role': 'owner',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.members).toEqual([
      { memberId: 'member-a', displayName: 'A', role: 'member' },
    ]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      workspaceId: 'team-a',
      workspaceMemberId: 'member-a',
      role: 'member',
    });
  });

  it('reports a transient directory failure instead of returning an authoritative empty roster', async () => {
    const api = await startContextServer({
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [{
          workspaceId: 'team-a',
          workspaceName: 'Team A',
          workspaceType: 'team',
          workspaceMemberId: 'member-a',
          role: 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
        }],
      }),
      listMembers: async () => {
        throw new Error('member directory unavailable');
      },
    });

    const response = await api.req('/api/workspace/members', {
      headers: {
        'x-od-workspace-id': 'team-a',
        'x-od-workspace-member-id': 'member-a',
      },
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
      },
    });
  });
});
