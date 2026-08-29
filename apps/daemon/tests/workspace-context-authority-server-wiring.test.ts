import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

const WORKSPACE_ID = 'workspace-team';
const MEMBER_ID = 'member-admin';
const MANAGED_ENV = [
  'AMR_HOME',
  'OD_COLLAB_TRANSPORT',
  'OD_DATA_DIR',
  'OD_RESOURCE_TRANSPORT',
  'OD_TEAM_PROJECTS_TRANSPORT',
  'OD_WORKSPACE_AUTHORITY_CACHE_MODE',
  'OD_WORKSPACE_CONTEXT_SOURCE',
  'VELA_API_URL',
  'VELA_BIN',
  'VELA_CONTROL_KEY',
] as const;

let authority: Server | null = null;
let daemon: StartedServer | null = null;
let scratch: string | null = null;
const savedEnv = new Map<string, string | undefined>();

afterEach(async () => {
  if (daemon) {
    const current = daemon;
    daemon = null;
    await Promise.resolve(current.shutdown?.());
    current.server.closeAllConnections?.();
    current.server.closeIdleConnections?.();
    if (current.server.listening) {
      await new Promise<void>((resolve) => current.server.close(() => resolve()));
    }
  }
  if (authority) {
    const current = authority;
    authority = null;
    current.closeAllConnections?.();
    current.closeIdleConnections?.();
    if (current.listening) {
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
  }
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = null;
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
  vi.resetModules();
}, 30_000);

describe('server workspace context authority wiring', () => {
  it('keeps directory Team authority and fences an unread A -> B -> A Settings transition', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'od-context-authority-wiring-'));
    let directoryReads = 0;
    let allowHubReady = true;
    const authorityUrl = await startAuthority({
      onDirectory: () => {
        directoryReads += 1;
      },
      isHubReady: () => allowHubReady,
    });
    const velaBin = await writeVelaStub(scratch);
    setEnv({
      AMR_HOME: join(scratch, 'empty-amr-home'),
      OD_COLLAB_TRANSPORT: 'off',
      OD_DATA_DIR: join(scratch, 'data'),
      OD_RESOURCE_TRANSPORT: 'off',
      OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OD_WORKSPACE_AUTHORITY_CACHE_MODE: 'adaptive',
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      VELA_API_URL: authorityUrl,
      VELA_BIN: velaBin,
      VELA_CONTROL_KEY: 'context-authority-control-key',
    });

    vi.resetModules();
    const serverModule = (await import('../src/server.js')) as unknown as {
      startServer(options: { port: number; returnServer: true }): Promise<StartedServer>;
    };
    daemon = await serverModule.startServer({ port: 0, returnServer: true });

    const initial = await getWorkspaceContext();
    expect(initial).toMatchObject({ workspaceType: 'team', role: 'admin' });
    const directoryReadsAfterInitial = directoryReads;
    expect(directoryReadsAfterInitial).toBeGreaterThan(0);

    const interest = await fetch(`${daemon.url}/api/workspace/billing/interests/context-test`, {
      method: 'PUT',
      headers: { ...workspaceHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        generation: '1',
        interests: [{ workspaceId: WORKSPACE_ID, workspaceMemberId: MEMBER_ID }],
      }),
    });
    expect(interest.status).toBe(200);
    await vi.waitFor(
      () => expect(directoryReads).toBeGreaterThan(directoryReadsAfterInitial),
      { timeout: 10_000, interval: 50 },
    );

    let warmContext: Record<string, unknown> | null = null;
    await vi.waitFor(async () => {
      const readsBefore = directoryReads;
      const context = await getWorkspaceContext();
      expect(directoryReads).toBe(readsBefore);
      warmContext = context;
    }, { timeout: 10_000, interval: 50 });

    expect(warmContext).not.toBeNull();
    expect(warmContext).toMatchObject({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: MEMBER_ID,
      workspaceType: 'team',
      role: 'admin',
      teamId: WORKSPACE_ID,
      planId: null,
    });
    const directoryReadsAfterCatchUp = directoryReads;
    await getWorkspaceContext();
    await getWorkspaceContext();
    expect(directoryReads).toBe(directoryReadsAfterCatchUp);

    // Red spec for the account-identity fence: both Settings writes complete
    // without any directory/status read. The final credential identity is
    // byte-for-byte A again, so a cache keyed only by the current identity
    // would otherwise revive the old five-minute authority lease.
    allowHubReady = false;
    const directoryReadsBeforeCredentialRoundTrip = directoryReads;
    await putAmrApiUrl('https://account-b.example');
    await putAmrApiUrl(authorityUrl);
    expect(directoryReads).toBe(directoryReadsBeforeCredentialRoundTrip);

    const afterCredentialRoundTrip = await getWorkspaceContext();
    expect(afterCredentialRoundTrip).toMatchObject({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: MEMBER_ID,
      role: 'admin',
    });
    expect(directoryReads).toBeGreaterThan(directoryReadsBeforeCredentialRoundTrip);
  }, 60_000);
});

function setEnv(values: Record<string, string>): void {
  for (const key of MANAGED_ENV) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

function workspaceHeaders(): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-id': MEMBER_ID,
    'x-od-workspace-role': 'admin',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
  };
}

async function getWorkspaceContext(): Promise<Record<string, unknown>> {
  const response = await fetch(`${daemon!.url}/api/workspace/context`, {
    headers: workspaceHeaders(),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { context: Record<string, unknown> };
  return body.context;
}

async function putAmrApiUrl(apiUrl: string): Promise<void> {
  const response = await fetch(`${daemon!.url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentCliEnv: {
        amr: { VELA_API_URL: apiUrl },
      },
    }),
  });
  expect(response.status).toBe(200);
}

async function startAuthority(callbacks: {
  onDirectory: () => void;
  isHubReady?: () => boolean;
}): Promise<string> {
  authority = createServer((req, res) => {
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      callbacks.onDirectory();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        items: [{
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Verified team',
          workspaceType: 'team',
          workspaceMemberId: MEMBER_ID,
          role: 'admin',
          memberStatus: 'active',
          lifecycleState: 'active',
        }],
      }));
      return;
    }
    if (req.url === '/api/v1/collab/events' && req.method === 'GET') {
      res.writeHead(200, {
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
      });
      if (callbacks.isHubReady?.() === false) return;
      res.write(
        `event: ready\ndata: ${JSON.stringify({
          workspaceId: WORKSPACE_ID,
          capabilities: [
            'workspace-member-events-v1',
            'workspace-event-listener-status-v1',
          ],
          listenerEpoch: 'authority-test',
          listenerHealth: 'healthy',
          sourceGap: false,
        })}\n\n`,
      );
      res.write(
        'event: heartbeat\ndata: ' + JSON.stringify({
          listenerEpoch: 'authority-test',
          listenerHealth: 'healthy',
          sourceGap: false,
        }) + '\n\n',
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => authority!.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') {
    throw new Error('workspace authority has no port');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function writeVelaStub(root: string): Promise<string> {
  const script = join(root, 'vela-stub.mjs');
  await writeFile(
    script,
    `const args = process.argv.slice(2);
if (args[0] === 'billing' && args[1] === 'summary') {
  process.stdout.write(JSON.stringify({
    membershipTier: 'team',
    balanceUsd: '0.00',
    subscriptionStatus: 'active',
    balances: { totalAvailableCredits: 0, subscriptionCredits: 0, rechargeCredits: 0 },
    availableActions: [],
  }) + '\\n');
  process.exit(0);
}
if (args[0] === 'billing' && args[1] === 'workspace-snapshot') {
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    workspaceId: '${WORKSPACE_ID}',
    workspaceMemberId: '${MEMBER_ID}',
    billingScopeVersion: 2,
    billing: { billingState: 'active', planId: 'team_pro' },
    wallet: { balanceUsd: '10.00', expiresAt: null, updatedAt: '2026-08-13T00:00:00Z' },
    revisions: { billing: 'billing-1', wallet: 'wallet-1' },
  }) + '\\n');
  process.exit(0);
}
process.stdout.write(JSON.stringify([]) + '\\n');
`,
    'utf8',
  );
  const bin = join(root, 'vela');
  await writeFile(
    bin,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}
