// @vitest-environment node

import { chmod, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const PERSONAL = {
  workspaceId: 'ws-switch-personal',
  workspaceName: 'Ada workspace',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-switch-personal',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

const TEAM = {
  workspaceId: 'ws-switch-team',
  workspaceName: 'Ada team',
  workspaceType: 'team' as const,
  workspaceMemberId: 'mem-switch-team',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

let authority: Server;
let authorityUrl: string;
let directoryItems = [PERSONAL, TEAM];
let teamCurrentUnavailable = false;

beforeAll(async () => {
  authority = createServer((req, res) => {
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: directoryItems }));
      return;
    }
    if (req.url === '/api/v1/workspaces/current' && req.method === 'GET') {
      const workspaceId = req.headers['x-vela-workspace-id'];
      const current = workspaceId === TEAM.workspaceId ? TEAM : PERSONAL;
      if (!workspaceId || (workspaceId === TEAM.workspaceId && teamCurrentUnavailable)) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_principal' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ...current,
        billingState: current.workspaceType === 'team' ? 'active' : 'free',
        planId: current.workspaceType === 'team' ? 'team_plus' : null,
        providerMode: 'platform_credits',
        seatSummary: current.workspaceType === 'team'
          ? { seatLimit: 5, usedSeats: 1 }
          : { seatLimit: 1, usedSeats: 1 },
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') throw new Error('mock authority has no port');
  authorityUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => authority.close(() => resolve()));
});

async function writeBillingVelaBin(path: string): Promise<string> {
  await writeFile(
    path,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== 'billing') process.exit(1);
if (args[1] === 'summary') {
  process.stdout.write(JSON.stringify({
    membershipTier: 'free',
    balanceUsd: '0.00',
    subscriptionStatus: 'inactive',
    balances: { totalAvailableCredits: 0, subscriptionCredits: 0, rechargeCredits: 0 },
    availableActions: [],
  }) + '\\n');
  process.exit(0);
}
if (args[1] === 'workspace-snapshot') {
  const workspaceId = args[args.indexOf('--workspace-id') + 1];
  const personal = workspaceId === 'ws-switch-personal';
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    workspaceId,
    workspaceMemberId: personal ? 'mem-switch-personal' : 'mem-switch-team',
    billingScopeVersion: 2,
    billing: personal
      ? { billingState: 'free', planId: null }
      : { billingState: 'active', planId: 'team_plus' },
    wallet: { balanceUsd: '12.50', expiresAt: null, updatedAt: '2026-07-31T00:00:00Z' },
    revisions: { billing: 'billing-1', wallet: 'wallet-1' },
  }) + '\\n');
  process.exit(0);
}
if (args[1] === 'checkout') {
  process.stdout.write(JSON.stringify({ checkoutUrl: 'https://billing.example/checkout/team-1' }) + '\\n');
  process.exit(0);
}
process.exit(1);
`,
    'utf8',
  );
  await chmod(path, 0o755);
  return path;
}

async function expectStatus(
  webUrl: string,
  path: string,
  expected: number,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, `${webUrl}/`), { headers });
  expect(response.status).toBe(expected);
  return (await response.json()) as Record<string, unknown>;
}

describe('workspace switching and scoped billing', () => {
  test(
    'switches the local workspace and never authorizes personal or foreign billing scopes',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-workspace-switch-and-billing');
      directoryItems = [PERSONAL, TEAM];
      teamCurrentUnavailable = false;
      const velaBin = await writeBillingVelaBin(join(suite.scratchDir, 'fake-vela-billing'));

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const initial = await requestJson<{ context: { workspaceId: string } | null }>(
            webUrl,
            '/api/workspace/context',
            { headers: workspaceHeaders(PERSONAL) },
          );
          expect(initial.context?.workspaceId).toBe(PERSONAL.workspaceId);

          const switched = await requestJson<{
            activeWorkspaceId: string;
            context: { workspaceId: string; workspaceName?: string; workspaceType: string };
          }>(webUrl, '/api/workspace/active', {
            method: 'PUT',
            body: {
              workspaceId: TEAM.workspaceId,
              workspaceMemberId: TEAM.workspaceMemberId,
            },
          });
          expect(switched).toMatchObject({
            activeWorkspaceId: TEAM.workspaceId,
            context: {
              workspaceId: TEAM.workspaceId,
              workspaceName: TEAM.workspaceName,
              workspaceType: 'team',
            },
          });

          const directory = await requestJson<{ activeWorkspaceId: string | null }>(
            webUrl,
            '/api/workspace/directory',
          );
          expect(directory.activeWorkspaceId).toBeNull();
          const selected = await requestJson<{
            context: { workspaceId: string; workspaceMemberId: string } | null;
          }>(webUrl, '/api/workspace/context', {
            headers: workspaceHeaders(TEAM),
          });
          expect(selected.context).toMatchObject({
            workspaceId: TEAM.workspaceId,
            workspaceMemberId: TEAM.workspaceMemberId,
          });

          const billing = await requestJson<{
            summary: { workspaceId: null; membershipTier: string } | null;
            workspaceBalance: { workspaceId: string; workspaceMemberId: string; balanceUsd: string } | null;
            workspaceSnapshot?: { billing: { billingState: string; planId: string | null } };
          }>(webUrl, `/api/workspace/billing?scope=workspace&workspaceId=${TEAM.workspaceId}`, {
            headers: workspaceHeaders(TEAM),
          });
          expect(billing.summary?.workspaceId).toBeNull();
          expect(billing.workspaceBalance).toMatchObject({
            workspaceId: TEAM.workspaceId,
            workspaceMemberId: TEAM.workspaceMemberId,
            balanceUsd: '12.50',
          });
          expect(billing.workspaceSnapshot).toMatchObject({
            billing: { billingState: 'active', planId: 'team_plus' },
          });

          const checkout = await requestJson<{ checkoutUrl: string | null }>(
            webUrl,
            '/api/workspace/billing/checkout',
            {
              method: 'POST',
              headers: workspaceHeaders(TEAM),
              body: { planId: 'team_pro', seats: 3 },
            },
          );
          expect(checkout.checkoutUrl).toBe('https://billing.example/checkout/team-1');

          // Personal and Team balances both use an exact Workspace subject.
          // The directory membership is the authority; an unknown Workspace
          // must still fail closed below.
          const personalBilling = await requestJson<{
            workspaceBalance: {
              workspaceId: string;
              workspaceMemberId: string;
              balanceUsd: string;
            } | null;
            workspaceSnapshot?: { billing: { billingState: string; planId: string | null } };
          }>(webUrl,
            `/api/workspace/billing?scope=workspace&workspaceId=${PERSONAL.workspaceId}`,
            { headers: workspaceHeaders(PERSONAL) },
          );
          expect(personalBilling.workspaceBalance).toMatchObject({
            workspaceId: PERSONAL.workspaceId,
            workspaceMemberId: PERSONAL.workspaceMemberId,
            balanceUsd: '12.50',
          });
          expect(personalBilling.workspaceSnapshot).toMatchObject({
            billing: { billingState: 'free', planId: null },
          });
          await expectStatus(
            webUrl,
            '/api/workspace/billing?scope=workspace&workspaceId=ws-foreign',
            403,
            {
              'x-od-workspace-id': 'ws-foreign',
              'x-od-workspace-member-id': 'mem-foreign',
            },
          );
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-switch-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );

  test(
    'rejects a removed Team request identity while Personal remains selectable',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-workspace-stale-pin-recovery');
      directoryItems = [PERSONAL, TEAM];
      teamCurrentUnavailable = false;

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          await requestJson(webUrl, '/api/workspace/context', {
            headers: workspaceHeaders(PERSONAL),
          });
          await requestJson(webUrl, '/api/workspace/active', {
            method: 'PUT',
            body: {
              workspaceId: TEAM.workspaceId,
              workspaceMemberId: TEAM.workspaceMemberId,
            },
          });

          // Simulate B confirming that the Team membership disappeared. The
          // removed request-local identity can no longer resolve, while the
          // directory still contains the user's Personal workspace.
          directoryItems = [PERSONAL];
          teamCurrentUnavailable = true;

          const directory = await requestJson<{ activeWorkspaceId: string | null }>(
            webUrl,
            '/api/workspace/directory',
          );
          expect(directory.activeWorkspaceId).toBeNull();

          const recovered = await requestJson<{
            context: {
              workspaceId: string;
              workspaceName?: string;
              workspaceType: string;
            } | null;
          }>(webUrl, '/api/workspace/context', {
            headers: workspaceHeaders(PERSONAL),
          });
          expect(recovered.context).toMatchObject({
            workspaceId: PERSONAL.workspaceId,
            workspaceName: PERSONAL.workspaceName,
            workspaceType: 'personal',
          });

        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-stale-pin-control-key',
          },
        },
      );
    },
  );
});

function workspaceHeaders(workspace: typeof PERSONAL | typeof TEAM): Record<string, string> {
  return {
    'x-od-workspace-id': workspace.workspaceId,
    'x-od-workspace-member-id': workspace.workspaceMemberId,
  };
}
