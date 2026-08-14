import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

const PERSONAL = {
  workspaceId: 'ws-billing-personal',
  workspaceName: 'Personal workspace',
  workspaceType: 'personal',
  workspaceMemberId: 'member-billing-personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
} as const;

const MANAGED_ENV = [
  'AMR_HOME',
  'OD_COLLAB_TRANSPORT',
  'OD_DATA_DIR',
  'OD_RESOURCE_TRANSPORT',
  'OD_TEAM_PROJECTS_TRANSPORT',
  'OD_WORKSPACE_CONTEXT_SOURCE',
  'VELA_API_URL',
  'VELA_BIN',
  'VELA_CONTROL_KEY',
  'OD_TEST_VELA_LOG',
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

describe('server workspace billing runtime wiring', () => {
  it('loads an exact active Personal workspace projection without Team-only filtering', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'od-personal-billing-wiring-'));
    const authorityUrl = await startAuthority();
    const velaBin = await writeVelaStub(scratch);
    setEnv({
      AMR_HOME: join(scratch, 'empty-amr-home'),
      OD_COLLAB_TRANSPORT: 'off',
      OD_DATA_DIR: join(scratch, 'data'),
      OD_RESOURCE_TRANSPORT: 'off',
      OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      VELA_API_URL: authorityUrl,
      VELA_BIN: velaBin,
      VELA_CONTROL_KEY: 'billing-wiring-control-key',
      OD_TEST_VELA_LOG: join(scratch, 'vela-calls.log'),
    });

    vi.resetModules();
    const serverModule = (await import('../src/server.js')) as unknown as {
      startServer(options: { port: number; returnServer: true }): Promise<StartedServer>;
    };
    daemon = await serverModule.startServer({ port: 0, returnServer: true });

    const billingUrl =
      `${daemon.url}/api/workspace/billing?scope=workspace&workspaceId=${PERSONAL.workspaceId}`;
    const [response, concurrentResponse] = await Promise.all([
      fetch(billingUrl, { headers: workspaceHeaders() }),
      fetch(billingUrl, { headers: workspaceHeaders() }),
    ]);
    expect(response.status).toBe(200);
    expect(concurrentResponse.status).toBe(200);
    const body = await response.json() as {
      workspaceBalance: {
        workspaceId: string;
        workspaceMemberId: string;
        balanceUsd: string;
      } | null;
      workspaceRuntime: { status: string; errorCode: string | null };
    };
    expect(body.workspaceBalance).toMatchObject({
      workspaceId: PERSONAL.workspaceId,
      workspaceMemberId: PERSONAL.workspaceMemberId,
      balanceUsd: '9.75',
    });
    expect(body.workspaceRuntime).toMatchObject({
      status: 'fresh',
      errorCode: null,
    });
    expect((await concurrentResponse.json() as typeof body).workspaceBalance)
      .toEqual(body.workspaceBalance);
    const warmResponse = await fetch(billingUrl, { headers: workspaceHeaders() });
    expect(warmResponse.status).toBe(200);
    const commandLog = await readFile(process.env.OD_TEST_VELA_LOG!, 'utf8');
    expect(commandLog).toContain(
      `billing workspace-snapshot --workspace-id ${PERSONAL.workspaceId}`,
    );
    expect(commandLog.match(/billing summary --format json/g)).toHaveLength(1);
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
    'x-od-workspace-id': PERSONAL.workspaceId,
    'x-od-workspace-type': PERSONAL.workspaceType,
    'x-od-workspace-member-id': PERSONAL.workspaceMemberId,
    'x-od-workspace-role': PERSONAL.role,
    'x-od-workspace-member-status': PERSONAL.memberStatus,
    'x-od-workspace-lifecycle-state': PERSONAL.lifecycleState,
    'x-od-workspace-can-share-projects': 'false',
    'x-od-workspace-can-write-synced-files': 'true',
  };
}

async function startAuthority(): Promise<string> {
  authority = createServer((req, res) => {
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: [PERSONAL] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => authority!.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') {
    throw new Error('billing authority has no port');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function writeVelaStub(root: string): Promise<string> {
  const script = join(root, 'vela-stub.mjs');
  await writeFile(
    script,
    `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.OD_TEST_VELA_LOG, args.join(' ') + '\\n');
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
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    workspaceId,
    workspaceMemberId: '${PERSONAL.workspaceMemberId}',
    billingScopeVersion: 2,
    billing: { billingState: 'free', planId: null },
    wallet: { balanceUsd: '9.75', expiresAt: null, updatedAt: '2026-08-04T00:00:00Z' },
    revisions: { billing: 'billing-personal-1', wallet: 'wallet-personal-1' },
  }) + '\\n');
  process.exit(0);
}
process.exit(1);
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
