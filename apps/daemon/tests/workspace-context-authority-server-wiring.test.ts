import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { register as metricRegistry } from 'prom-client';

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
  'VELA_RUNTIME_KEY',
  'OPEN_DESIGN_AMR_PROFILE',
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
  vi.restoreAllMocks();
  metricRegistry.clear();
  vi.resetModules();
}, 30_000);

describe('server workspace context authority wiring', () => {
  it.each(['absent', 'removed'] as const)('cancels only current actor runs with %s membership after missed Hub events', async (membership) => {
    const h = await startDirectoryRunHarness();
    const removed = h.run(WORKSPACE_ID);
    const personal = h.run('personal');
    const otherActor = h.run(WORKSPACE_ID, 'another-user');
    h.directory.items = [
      directoryItem('personal'),
      ...(membership === 'removed' ? [{ ...directoryItem(WORKSPACE_ID), memberStatus: 'removed' }] : []),
    ];

    expect((await h.directoryBroker.fresh()).ok).toBe(true);

    await vi.waitFor(() => expect(removed.status).toBe('canceled'));
    expect(removed.cancelOrigin).toBe('unknown');
    expect(personal.status).toBe('running');
    expect(otherActor.status).toBe('running');
  });

  it('preserves active membership through role and billing lifecycle changes', async () => {
    const h = await startDirectoryRunHarness();
    const run = h.run(WORKSPACE_ID);
    h.directory.items = [{ ...directoryItem(WORKSPACE_ID), role: 'member', lifecycleState: 'locked' }];

    expect((await h.directoryBroker.fresh()).ok).toBe(true);

    expect(run.status).toBe('running');
    expect(run.cancelRequested).toBe(false);
  });

  it('still stops the same actor after credential refresh changes the directory identity', async () => {
    const h = await startDirectoryRunHarness();
    const run = h.run(WORKSPACE_ID);
    await h.signIn('member-user', 'rotated');
    h.directory.items = [directoryItem('personal')];

    expect((await h.directoryBroker.fresh()).ok).toBe(true);

    await vi.waitFor(() => expect(run.status).toBe('canceled'));
    expect(run.cancelOrigin).toBe('unknown');
  });

  it('records removal during setup before the actual child actor can be pinned', async () => {
    const h = await startDirectoryRunHarness();
    const run = h.run(WORKSPACE_ID, 'member-user', false);
    h.directory.items = [directoryItem('personal')];

    expect((await h.directoryBroker.fresh()).ok).toBe(true);
    expect(run.cancelRequested).toBe(false);

    expect(h.pin(run)).toBe(false);
    await vi.waitFor(() => expect(run.status).toBe('canceled'));
  });

  it.each([401, 403, 503])('does not turn a directory %s into membership revocation', async (status) => {
    const h = await startDirectoryRunHarness();
    const run = h.run(WORKSPACE_ID);
    h.directory.status = status;
    h.directory.items = [];

    expect((await h.directoryBroker.fresh()).ok).toBe(false);

    expect(run.status).toBe('running');
    expect(run.cancelRequested).toBe(false);
  });

  it.each([
    { unrelated: [] },
    { items: [{ ...directoryItem(WORKSPACE_ID), memberStatus: 'unrecognized' }] },
  ])('does not treat a malformed successful directory body %j as a complete membership list', async (body) => {
    const h = await startDirectoryRunHarness();
    const run = h.run(WORKSPACE_ID);
    h.directory.body = body;

    await h.directoryBroker.fresh();

    expect(run.status).toBe('running');
    expect(run.cancelRequested).toBe(false);
  });

  it.each([200, 503])('ignores a delayed old identity directory result (%s) after account switch', async (status) => {
    const h = await startDirectoryRunHarness();
    const oldActor = h.run(WORKSPACE_ID);
    let release!: () => void;
    let arrived!: () => void;
    const requested = new Promise<void>((resolve) => { arrived = resolve; });
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    h.directory.status = status;
    h.directory.items = [directoryItem('personal')];
    h.directory.beforeResponse = async () => { arrived(); await responseGate; };
    const pending = h.directoryBroker.fresh();
    await requested;
    try {
      await h.signIn('another-user');
      const currentActor = h.run(WORKSPACE_ID, 'another-user');
      release();
      await pending;
      expect(oldActor.status).toBe('running');
      expect(currentActor.status).toBe('running');
    } finally {
      release();
      await pending;
    }
  });

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

function directoryItem(workspaceId: string) {
  return {
    workspaceId,
    workspaceName: workspaceId === WORKSPACE_ID ? 'Verified team' : 'Personal',
    workspaceType: workspaceId === WORKSPACE_ID ? 'team' : 'personal',
    workspaceMemberId: workspaceId === WORKSPACE_ID ? MEMBER_ID : 'personal-member',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  };
}

async function startDirectoryRunHarness() {
  scratch = await mkdtemp(join(tmpdir(), 'od-directory-revoked-runs-'));
  const directory: {
    status: number;
    items: ReturnType<typeof directoryItem>[];
    body?: unknown;
    beforeResponse?: () => Promise<void>;
  } = { status: 200, items: [directoryItem(WORKSPACE_ID), directoryItem('personal')] };
  const authorityUrl = await startAuthority({ onDirectory: () => undefined, directory });
  const amrHome = join(scratch, 'amr');
  await mkdir(amrHome);
  const signIn = async (userId: string, revision = '') => {
    await writeFile(join(amrHome, 'config.json'), JSON.stringify({
      profiles: { local: {
        runtimeKey: `test-runtime-${userId}-${revision}`,
        controlKey: `test-control-${userId}-${revision}`,
        apiUrl: authorityUrl,
        linkUrl: authorityUrl,
        user: { id: userId, email: `${userId}@example.test`, name: userId },
      } },
    }));
  };
  await signIn('member-user');
  setEnv({
    AMR_HOME: amrHome,
    OPEN_DESIGN_AMR_PROFILE: 'local',
    OD_COLLAB_TRANSPORT: 'off',
    OD_DATA_DIR: join(scratch, 'data'),
    OD_RESOURCE_TRANSPORT: 'off',
    OD_TEAM_PROJECTS_TRANSPORT: 'off',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
    VELA_API_URL: authorityUrl,
    VELA_BIN: await writeVelaStub(scratch),
  });
  vi.resetModules();
  const directoryModule = await import('../src/collab/vela-workspace-context.js');
  const runsModule = await import('../src/runtimes/runs.js');
  const cancellationModule = await import('../src/services/cancel-revoked-workspace-runs.js');
  // These spies call through unchanged. Capture the real composition objects,
  // not substitute authority or cancellation implementations. Run launch/child
  // teardown is covered separately; this case witnesses the server wiring gap.
  const directoryFactory = vi.spyOn(directoryModule, 'createWorkspaceDirectoryAuthorityBroker');
  const runsFactory = vi.spyOn(runsModule, 'createChatRunService');
  const cancellationFactory = vi.spyOn(cancellationModule, 'createRevokedWorkspaceRunCancellation');
  const { startServer } = await import('../src/server.js') as unknown as {
    startServer(options: { port: number; returnServer: true }): Promise<StartedServer>;
  };
  daemon = await startServer({ port: 0, returnServer: true });
  const directoryBroker = directoryFactory.mock.results[0]!.value as ReturnType<typeof directoryModule.createWorkspaceDirectoryAuthorityBroker>;
  const runs = runsFactory.mock.results[0]!.value as ReturnType<typeof runsModule.createChatRunService>;
  const cancellation = cancellationFactory.mock.results[0]!.value as ReturnType<typeof cancellationModule.createRevokedWorkspaceRunCancellation>;
  expect(directoryBroker).toBeDefined();
  expect(runs).toBeDefined();
  expect(cancellation).toBeDefined();
  expect((await directoryBroker.fresh()).ok).toBe(true);
  const actorKey = (userId: string) => cancellationModule.workspaceRunActorKey({
    login: { loggedIn: true, profile: 'local', user: { id: userId } },
    control: { profile: 'local', apiUrl: authorityUrl, user: { id: userId } },
    credentialOverrides: false,
  });
  return {
    directory, directoryBroker, signIn,
    pin(run: ReturnType<typeof runs.create>, userId = 'member-user') {
      return cancellation.pin(run, actorKey(userId));
    },
    run(workspaceId: string, userId = 'member-user', pin = true) {
      const run = runs.create({ agentId: 'amr', workspaceScope: { workspaceId, workspaceMemberId: 'different-project-creator' } });
      run.status = 'running';
      cancellation.begin(run);
      if (pin) expect(cancellation.pin(run, actorKey(userId))).toBe(true);
      return run;
    },
  };
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
  directory?: {
    status: number;
    items: ReturnType<typeof directoryItem>[];
    body?: unknown;
    beforeResponse?: () => Promise<void>;
  };
}): Promise<string> {
  authority = createServer((req, res) => {
    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      callbacks.onDirectory();
      if (callbacks.directory) {
        const { status, items, body, beforeResponse } = callbacks.directory;
        void Promise.resolve(beforeResponse?.()).then(() => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body ?? { items }));
        });
        return;
      }
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
    const pathname = new URL(req.url ?? '/', 'http://authority.test').pathname;
    if (pathname === '/api/v1/collab/events' && req.method === 'GET') {
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
