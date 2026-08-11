// @vitest-environment node

import { chmod, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const DEFAULT_WORKSPACE = {
  workspaceId: 'ws-new-account-personal',
  workspaceName: 'Ada workspace',
  workspaceType: 'personal' as const,
  workspaceMemberId: 'mem-new-account-personal',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
};

const DEFAULT_WORKSPACE_HEADERS = {
  'x-od-workspace-id': DEFAULT_WORKSPACE.workspaceId,
  'x-od-workspace-member-id': DEFAULT_WORKSPACE.workspaceMemberId,
};

let authority: Server;
let authorityUrl: string;
let currentWorkspaceSelected = false;

beforeAll(async () => {
  authority = createServer((req, res) => {
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [DEFAULT_WORKSPACE] }));
      return;
    }
    if (req.url === '/api/v1/workspaces/current' && req.method === 'GET') {
      if (!req.headers['x-vela-workspace-id'] && !currentWorkspaceSelected) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_principal' }));
        return;
      }
      currentWorkspaceSelected = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ...DEFAULT_WORKSPACE,
        billingState: 'free',
        planId: null,
        providerMode: 'platform_credits',
        seatSummary: { seatLimit: 1, usedSeats: 1 },
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

async function writeFreeBillingVelaBin(path: string): Promise<string> {
  await writeFile(
    path,
    `#!/usr/bin/env node
if (process.argv[2] === 'billing' && process.argv[3] === 'summary') {
  process.stdout.write(JSON.stringify({
    membershipTier: 'free',
    balanceUsd: '0.00',
    subscriptionStatus: 'inactive',
    balances: {
      totalAvailableCredits: 0,
      subscriptionCredits: 0,
      rechargeCredits: 0,
    },
    availableActions: [],
  }) + '\\n');
  process.exit(0);
}
process.exit(1);
`,
    'utf8',
  );
  await chmod(path, 0o755);
  return path;
}

describe('new account default workspace bootstrap', () => {
  test(
    'uses nickname workspace as the default personal free workspace with zero Open Design Cloud balance',
    { timeout: 240_000 },
    async () => {
      const suite = await createSmokeSuite('collab-new-account-default-workspace');
      currentWorkspaceSelected = false;

      const velaBin = await writeFreeBillingVelaBin(
        join(suite.scratchDir, 'fake-vela-free-billing'),
      );

      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const firstContext = await requestJson<{
            context: {
              workspaceId: string;
              workspaceName?: string;
              workspaceType: string;
              billingState: string;
            } | null;
          }>(webUrl, '/api/workspace/context', {
            headers: DEFAULT_WORKSPACE_HEADERS,
          });

          // Fresh-account path: the explicit caller selects the personal
          // directory item without mutating a process-global active pointer.
          expect(firstContext.context?.workspaceId).toBe(DEFAULT_WORKSPACE.workspaceId);
          expect(firstContext.context?.workspaceName).toBe('Ada workspace');
          expect(firstContext.context?.workspaceType).toBe('personal');

          const directory = await requestJson<{
            activeWorkspaceId: string | null;
            items: Array<typeof DEFAULT_WORKSPACE>;
          }>(webUrl, '/api/workspace/directory');
          expect(directory.activeWorkspaceId).toBeNull();
          expect(directory.items).toEqual([DEFAULT_WORKSPACE]);

          // Once the local pin exists, the authoritative current context
          // carries the positive free-state marker used by the web plan label.
          const settledContext = await requestJson<{
            context: {
              workspaceId: string;
              workspaceName?: string;
              workspaceType: string;
              billingState: string;
              planId: string | null;
            } | null;
          }>(webUrl, '/api/workspace/context', {
            headers: DEFAULT_WORKSPACE_HEADERS,
          });
          expect(settledContext.context).toMatchObject({
            workspaceId: DEFAULT_WORKSPACE.workspaceId,
            workspaceName: 'Ada workspace',
            workspaceType: 'personal',
            billingState: 'free',
            planId: null,
          });

          const billing = await requestJson<{
            summary: {
              workspaceId: null;
              membershipTier: string;
              totalAvailableCredits: number;
              subscriptionCredits: number;
              rechargeCredits: number;
              balanceUsd: string;
            } | null;
            workspaceBalance: unknown;
          }>(webUrl, '/api/workspace/billing?scope=account');
          expect(billing.summary).toMatchObject({
            workspaceId: null,
            membershipTier: 'free',
            totalAvailableCredits: 0,
            subscriptionCredits: 0,
            rechargeCredits: 0,
            balanceUsd: '0.00',
          });
          expect(billing.workspaceBalance).toBeNull();
        },
        {
          env: {
            AMR_HOME: join(suite.scratchDir, 'empty-amr-home'),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-new-account-control-key',
            VELA_BIN: velaBin,
          },
        },
      );
    },
  );
});
