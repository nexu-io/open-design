import type { Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { register } from 'prom-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceBillingResponse } from '@open-design/contracts';

const velaCommands = vi.hoisted(() => ({ pending: new Set<Promise<string>>() }));

// Keep the real CLI invocation and profile behavior, but own its completion.
// Hub catch-up can still be finishing a command when the HTTP server closes.
vi.mock('../src/integrations/vela-command.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/integrations/vela-command.js')>();
  return {
    ...actual,
    runVelaCommand: (...args: Parameters<typeof actual.runVelaCommand>) => {
      const command = actual.runVelaCommand(...args);
      velaCommands.pending.add(command);
      const settled = () => { velaCommands.pending.delete(command); };
      void command.then(settled, settled);
      return command;
    },
  };
});

async function drainVelaCommands(): Promise<void> {
  while (velaCommands.pending.size > 0) {
    await Promise.allSettled([...velaCommands.pending]);
  }
}

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
  'OPEN_DESIGN_AMR_PROFILE',
  'VELA_API_URL',
  'VELA_BIN',
  'VELA_CONTROL_KEY',
  'OD_TEST_VELA_LOG',
  'OD_TEST_VELA_SNAPSHOT_STDERR',
  'OD_TEST_VELA_SNAPSHOT',
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
  // Do not delete the executable/log directory or restore its environment
  // until every owned child has exited; otherwise a late append recreates it.
  await drainVelaCommands();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = null;
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
  // Each test re-imports the server module graph, which re-registers its
  // metrics on the process-wide prom-client registry.
  register.clear();
  vi.resetModules();
}, 30_000);

describe('server workspace billing runtime wiring', () => {
  it('loads an exact active Personal workspace projection without Team-only filtering', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'od-personal-billing-wiring-'));
    const authorityUrl = await startAuthority();
    const velaBin = await writeVelaStub(scratch);
    const dataDir = join(scratch, 'data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'app-config.json'), JSON.stringify({
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'test' },
      },
    }), 'utf8');
    setEnv({
      AMR_HOME: join(scratch, 'empty-amr-home'),
      OD_COLLAB_TRANSPORT: 'off',
      OD_DATA_DIR: dataDir,
      OD_RESOURCE_TRANSPORT: 'off',
      OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OPEN_DESIGN_AMR_PROFILE: 'prod',
      VELA_API_URL: authorityUrl,
      VELA_BIN: velaBin,
      VELA_CONTROL_KEY: 'billing-wiring-control-key',
      OD_TEST_VELA_LOG: join(scratch, 'vela-calls.log'),
    });

    vi.resetModules();
    const serverModule = (await import('../src/server.js')) as unknown as {
      startServer(options: { port: number; returnServer: true }): Promise<StartedServer>;
    };
    // RUNTIME_DATA_DIR is resolved during module startup. Later Vela commands
    // must receive the selected settings explicitly instead of depending on
    // the launcher-only OD_DATA_DIR environment variable.
    delete process.env.OD_DATA_DIR;
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
    expect(commandLog).toContain('profile=test billing workspace-snapshot');
  }, 60_000);

  it('keeps workspace directory/context caches when a billing projection is forbidden (OPEND-3553)', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'od-billing-forbidden-wiring-'));
    const authorityUrl = await startAuthority();
    const velaBin = await writeVelaStub(scratch);
    const dataDir = join(scratch, 'data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'app-config.json'), JSON.stringify({
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'test' },
      },
    }), 'utf8');
    setEnv({
      AMR_HOME: join(scratch, 'empty-amr-home'),
      OD_COLLAB_TRANSPORT: 'off',
      OD_DATA_DIR: dataDir,
      OD_RESOURCE_TRANSPORT: 'off',
      OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OPEN_DESIGN_AMR_PROFILE: 'prod',
      VELA_API_URL: authorityUrl,
      VELA_BIN: velaBin,
      VELA_CONTROL_KEY: 'billing-forbidden-control-key',
      OD_TEST_VELA_LOG: join(scratch, 'vela-calls.log'),
      // Vela maps internal billing failures to 403 as well; a billing
      // projection rejection is not a membership revocation.
      OD_TEST_VELA_SNAPSHOT_STDERR:
        'API request failed with status 403: {"error":"workspace_billing_scope_forbidden"}',
    });

    vi.resetModules();
    const serverModule = (await import('../src/server.js')) as unknown as {
      startServer(options: { port: number; returnServer: true }): Promise<StartedServer>;
    };
    const metrics = await import('../src/metrics/workspace-authority.js');
    metrics.__resetWorkspaceAuthorityMetricsForTests();
    delete process.env.OD_DATA_DIR;
    daemon = await serverModule.startServer({ port: 0, returnServer: true });

    const billingUrl =
      `${daemon.url}/api/workspace/billing?scope=workspace&workspaceId=${PERSONAL.workspaceId}`;
    const response = await fetch(billingUrl, { headers: workspaceHeaders() });
    expect(response.status).toBe(200);
    await response.json();
    // The projection fetch may settle after the response; wait for it.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const log = await readFile(process.env.OD_TEST_VELA_LOG!, 'utf8').catch(() => '');
      if (log.includes('billing workspace-snapshot')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    const authRejects = (await metrics.workspaceAuthorityInvalidationsTotal.get()).values
      .filter((value) => value.labels.reason === 'auth_reject')
      .reduce((sum, value) => sum + value.value, 0);
    expect(authRejects).toBe(0);
  }, 60_000);
  it('keeps the same renderer at the latest wallet across real Hub/SSE disorder, recovery and daemon restart', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'od-billing-order-wiring-'));
    const upstreamStreams = new Set<ServerResponse>();
    let connections = 0;
    authority = createServer((req, res) => {
      if (req.url === '/api/v1/workspaces') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ items: [PERSONAL] }));
      } else if (new URL(req.url ?? '/', 'http://127.0.0.1').pathname === '/api/v1/collab/events') {
        expect(req.headers['x-vela-workspace-id']).toBe(PERSONAL.workspaceId);
        connections++;
        upstreamStreams.add(res);
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`event: ready\ndata: ${JSON.stringify({
          workspaceId: PERSONAL.workspaceId,
          capabilities: ['billing-revision-clocks-v1', 'coding-plan-usage-events-v1'],
        })}\n\n`);
        res.on('close', () => upstreamStreams.delete(res));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => authority!.listen(0, '127.0.0.1', resolve));
    const address = authority.address();
    if (!address || typeof address === 'string') throw Error('missing owned authority port');
    const dataDir = join(scratch, 'data');
    const snapshotFile = join(scratch, 'snapshot.json');
    await mkdir(dataDir);
    await writeFile(join(dataDir, 'app-config.json'), JSON.stringify({
      agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
    }));
    const putSnapshot = async (balanceUsd: string, counter: string, remainingCredits = '100') => writeFile(
      snapshotFile,
      JSON.stringify({
        schemaVersion: 1,
        workspaceId: PERSONAL.workspaceId,
        workspaceMemberId: PERSONAL.workspaceMemberId,
        billingScopeVersion: 2,
        billing: { billingState: 'free', planId: null },
        wallet: { balanceUsd, expiresAt: null, updatedAt: '2026-10-21T00:00:00Z' },
        designPlanWindows: [{ kind: '7d', windowStart: null, resetsAt: null, remainingCredits, limitCredits: '100' }],
        revisions: { billing: '1', wallet: counter },
        revisionClocks: {
          billing: { epoch: 'billing-fixed', counter: '1' },
          wallet: { epoch: 'wallet-fixed', counter },
        },
      }),
    );
    await putSnapshot('100.00', '1');
    setEnv({
      AMR_HOME: join(scratch, 'empty-amr-home'),
      OD_COLLAB_TRANSPORT: 'off', OD_DATA_DIR: dataDir,
      OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OPEN_DESIGN_AMR_PROFILE: 'test',
      VELA_API_URL: `http://127.0.0.1:${address.port}`,
      VELA_BIN: await writeVelaStub(scratch), VELA_CONTROL_KEY: 'owned-order-fixture',
      OD_TEST_VELA_LOG: join(scratch, 'vela-calls.log'),
      OD_TEST_VELA_SNAPSHOT: snapshotFile,
    });
    const start = async () => {
      register.clear();
      process.env.OD_DATA_DIR = dataDir;
      vi.resetModules();
      const serverModule = await import('../src/server.js');
      daemon = await serverModule.startServer({ port: 0, returnServer: true }) as StartedServer;
      delete process.env.OD_DATA_DIR;
    };
    const read = async (fresh = false, status = 200) => {
      const response = await fetch(
        `${daemon!.url}/api/workspace/billing?scope=workspace&workspaceId=${PERSONAL.workspaceId}${fresh ? '&freshness=authoritative' : ''}`,
        { headers: {
          ...workspaceHeaders(),
          'x-od-workspace-runtime-client-id': 'same-renderer',
          'x-od-workspace-runtime-generation': '1',
        } },
      );
      expect(response.status).toBe(status);
      return response.json();
    };
    const send = (counter: string) => {
      const event = {
        type: 'wallet-balance-changed', workspaceId: PERSONAL.workspaceId,
        workspaceMemberId: PERSONAL.workspaceMemberId, revision: counter,
        revisionClock: { epoch: 'wallet-fixed', counter },
      };
      for (const res of upstreamStreams)
        res.write(`event: workspace-event\ndata: ${JSON.stringify(event)}\n\n`);
    };
    await start();
    expect(await read()).toMatchObject({ workspaceBalance: { balanceUsd: '100.00' } });
    const renderer = new AbortController();
    const received: { type: string; revision?: string; eventId?: string }[] = [];
    const streamResponse = await fetch(
      `${daemon!.url}/api/workspace/events?workspaceId=${PERSONAL.workspaceId}&workspaceMemberId=${PERSONAL.workspaceMemberId}`,
      { signal: renderer.signal },
    );
    expect(streamResponse.status).toBe(200);
    const reader = streamResponse.body!.getReader();
    const consume = (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) return;
          buffer += decoder.decode(next.value, { stream: true });
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const data = frame.split('\n').find((line) => line.startsWith('data: '));
            if (data) {
              const value = JSON.parse(data.slice(6));
              if (typeof value.type === 'string') received.push(value);
            }
          }
        }
      } catch (error) {
        if (!renderer.signal.aborted) throw error;
      }
    })();
    try {
      await vi.waitFor(() => expect(connections).toBe(1));
      expect(await read()).toMatchObject({
        workspaceSnapshot: { designPlanWindows: [{ remainingCredits: '100' }] },
      });
      // DP usage changes without a wallet or subscription clock change. The
      // real Hub -> server -> local SSE path must invalidate its snapshot too.
      await putSnapshot('100.00', '1', '98');
      for (const res of upstreamStreams) res.write(`event: workspace-event\ndata: ${JSON.stringify({
        type: 'coding-plan-usage-changed', workspaceId: PERSONAL.workspaceId,
        workspaceMemberId: PERSONAL.workspaceMemberId, eventId: '1',
      })}\n\n`);
      await vi.waitFor(() => expect(received.some((event) => event.eventId === '1')).toBe(true));
      const quotaRead = await read() as WorkspaceBillingResponse;
      expect(quotaRead).toMatchObject({
        workspaceBalance: { balanceUsd: '100.00' },
        workspaceSnapshot: {
          designPlanWindows: [{ remainingCredits: '98' }],
          revisionClocks: {
            billing: { epoch: 'billing-fixed', counter: '1' },
            wallet: { epoch: 'wallet-fixed', counter: '1' },
          },
        },
      });
      await vi.waitFor(() => expect(received.some((event) => event.revision === `runtime:${quotaRead.workspaceRuntime?.revision}`)).toBe(true));
      const beforeWalletEvent = received.length;
      await putSnapshot('70.00', '2');
      send('2');
      await vi.waitFor(() => expect(received.some((e) => e.revision === '2')).toBe(true));
      // The production display window is five seconds. Await its terminal SSE
      // completion signal, rather than sleeping or repeatedly reading billing.
      await vi.waitFor(() => expect(received.slice(beforeWalletEvent).some((event) => event.revision?.startsWith('runtime:'))).toBe(true), { timeout: 6_000 });
      expect(await read()).toMatchObject({ workspaceBalance: { balanceUsd: '70.00' } });
      const afterNewEventLog = await readFile(process.env.OD_TEST_VELA_LOG!, 'utf8');
      const snapshotReadsAfterNew = afterNewEventLog.split('billing workspace-snapshot').length - 1;
      await putSnapshot('100.00', '1');
      send('1');
      await vi.waitFor(() => expect(received.some((e) => e.revision === '1')).toBe(true));
      expect(await read()).toMatchObject({ workspaceBalance: { balanceUsd: '70.00' } });
      const afterOldEventLog = await readFile(process.env.OD_TEST_VELA_LOG!, 'utf8');
      expect(afterOldEventLog.split('billing workspace-snapshot').length - 1)
        .toBe(snapshotReadsAfterNew);
      // A fresh response from a lagging upstream also cannot undo the clock.
      expect(await read(true, 503)).toMatchObject({ error: 'workspace_billing_revision_not_caught_up' });
      expect(await read()).toMatchObject({
        workspaceBalance: { balanceUsd: '70.00' },
        workspaceRuntime: { status: 'error', errorCode: 'workspace_billing_revision_not_caught_up' },
      });
      await putSnapshot('70.00', '2');
      send('1');
      expect(await read(true)).toMatchObject({ workspaceBalance: { balanceUsd: '70.00' } });
      const beforeReconnect = connections;
      for (const stream of upstreamStreams) stream.end();
      await vi.waitFor(() => expect(connections).toBeGreaterThan(beforeReconnect), { timeout: 5000 });
      expect(await read()).toMatchObject({ workspaceBalance: { balanceUsd: '70.00' } });
    } finally {
      renderer.abort();
      await consume;
    }
    await daemon!.shutdown?.();
    daemon!.server.closeAllConnections();
    if (daemon!.server.listening)
      await new Promise<void>((resolve) => daemon!.server.close(() => resolve()));
    daemon = null;
    await drainVelaCommands();
    await start();
    expect(await read()).toMatchObject({ workspaceBalance: { balanceUsd: '70.00' } });
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
    `import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.OD_TEST_VELA_LOG, 'profile=' + (process.env.OPEN_DESIGN_AMR_PROFILE || '') + ' ' + args.join(' ') + '\\n');
if (args[0] !== 'billing') process.exit(1);
if (process.env.OD_TEST_VELA_SNAPSHOT_STDERR && args[1] === 'workspace-snapshot') {
  process.stderr.write(process.env.OD_TEST_VELA_SNAPSHOT_STDERR + '\\n');
  process.exit(1);
}
if (process.env.OPEN_DESIGN_AMR_PROFILE !== 'test' && args[1] === 'workspace-snapshot') {
  process.stderr.write('API request failed with status 403: workspace_not_authorized\\n');
  process.exit(1);
}
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
  if (process.env.OD_TEST_VELA_SNAPSHOT) {
    process.stdout.write(readFileSync(process.env.OD_TEST_VELA_SNAPSHOT, 'utf8'));
    process.exit(0);
  }
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
