import { execFile } from 'node:child_process';
import http from 'node:http';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
  headers: http.IncomingHttpHeaders;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

let stub: StubServer | null = null;

afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
});

// Mirrors the daemon's collab presence + sync routes so the CLI exercises the
// real SUBCOMMAND_MAP dispatch and request shaping against a live socket.
async function startCollabStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw,
        headers: req.headers,
      });
      res.setHeader('content-type', 'application/json');
      const { method, url } = { method: req.method ?? '', url: req.url ?? '' };
      if (method === 'GET' && url === '/api/projects/p1/presence') {
        res.end(JSON.stringify({ present: [{ memberId: 'm-42', name: 'Ma Shu', role: 'member' }] }));
        return;
      }
      if (method === 'POST' && url === '/api/projects/p1/presence/heartbeat') {
        res.end(JSON.stringify({ present: [{ memberId: 'm-42', name: 'Ma Shu', role: 'member' }] }));
        return;
      }
      if (method === 'POST' && url === '/api/projects/p1/presence/leave') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (method === 'GET' && url === '/api/projects/p1/collab/status') {
        res.end(JSON.stringify({
          publishedVersion: 7,
          materializedVersion: 6,
          syncState: 'synced',
        }));
        return;
      }
      if (method === 'POST' && url === '/api/projects/p1/collab/publish') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (method === 'POST' && url === '/api/projects/p1/collab/sync-intent') {
        res.end(JSON.stringify({ ok: true, syncState: 'pending_upload' }));
        return;
      }
      if (method === 'POST' && url === '/api/projects/p1/collab/pull') {
        res.end(JSON.stringify({ ok: true, version: 3 }));
        return;
      }
      if (
        method === 'GET' &&
        url === '/api/workspace/billing?scope=workspace&workspaceId=personal-1'
      ) {
        res.end(JSON.stringify({
          summary: { membershipTier: 'plus', subscriptionStatus: 'active' },
          workspaceBalance: {
            workspaceId: 'personal-1',
            workspaceMemberId: 'personal-owner',
            balanceUsd: '12.34',
            billingScopeVersion: 2,
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'unexpected-request', message: url } }));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    requests,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const failed = err as { stdout?: string; stderr?: string; code?: number | null };
    return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? '', code: failed.code ?? 1 };
  }
}

describe('od collab CLI', () => {
  it('reads Personal billing through an explicit Workspace id', async () => {
    stub = await startCollabStubServer();
    const result = await runCli([
      'workspace', 'billing',
      '--workspace-type', 'personal',
      '--workspace', 'personal-1',
      '--json',
      '--daemon-url', stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      workspaceBalance: {
        workspaceId: 'personal-1',
        balanceUsd: '12.34',
      },
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspace/billing?scope=workspace&workspaceId=personal-1',
    });
  });

  it('lists the present member set as JSON', async () => {
    stub = await startCollabStubServer();
    const result = await runCli([
      'collab', 'presence', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--json', '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      present: [{ memberId: 'm-42', name: 'Ma Shu', role: 'member' }],
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'GET', url: '/api/projects/p1/presence' });
    expect(stub.requests[0]?.headers).toMatchObject({
      'x-od-workspace-id': 'team-1',
      'x-od-workspace-member-id': 'm-42',
    });
  });

  it('sends a heartbeat with the member identity in the body', async () => {
    stub = await startCollabStubServer();
    const result = await runCli([
      'collab', 'heartbeat', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--member', 'm-42', '--name', 'Ma Shu', '--role', 'member',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'POST', url: '/api/projects/p1/presence/heartbeat' });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({ memberId: 'm-42', name: 'Ma Shu', role: 'member' });
  });

  it('sends monotonic session fields for a fenced heartbeat and leave', async () => {
    stub = await startCollabStubServer();
    const sharedArgs = [
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--member', 'm-42', '--client-id', 'cli-session',
      '--daemon-url', stub.baseUrl,
    ];

    const heartbeat = await runCli([
      'collab', 'heartbeat', 'p1', ...sharedArgs, '--sequence', '1',
    ]);
    const leave = await runCli([
      'collab', 'leave', 'p1', ...sharedArgs, '--sequence', '2',
    ]);

    expect(heartbeat.code).toBe(0);
    expect(leave.code).toBe(0);
    expect(stub.requests.map((request) => ({
      method: request.method,
      url: request.url,
      body: JSON.parse(request.body),
    }))).toEqual([
      {
        method: 'POST',
        url: '/api/projects/p1/presence/heartbeat',
        body: { memberId: 'm-42', clientId: 'cli-session', sequence: 1 },
      },
      {
        method: 'POST',
        url: '/api/projects/p1/presence/leave',
        body: { memberId: 'm-42', clientId: 'cli-session', sequence: 2 },
      },
    ]);
  });

  it('requests a publish and prints the published version', async () => {
    stub = await startCollabStubServer();
    const publish = await runCli([
      'collab', 'publish', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--json', '--daemon-url', stub.baseUrl,
    ]);
    expect(publish.code).toBe(0);
    expect(JSON.parse(publish.stdout)).toEqual({ ok: true });

    const status = await runCli([
      'collab', 'status', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain('publishedVersion\t7');
    expect(status.stdout).toContain('materializedVersion\t6');
    expect(stub.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST /api/projects/p1/collab/publish',
      'GET /api/projects/p1/collab/status',
    ]);
    for (const request of stub.requests) {
      expect(request?.headers).toMatchObject({
        'x-od-workspace-id': 'team-1',
        'x-od-workspace-member-id': 'm-42',
      });
    }
  });

  it('pulls through the explicitly scoped project route', async () => {
    stub = await startCollabStubServer();

    const result = await runCli([
      'collab',
      'pull',
      'p1',
      '--workspace',
      'team-1',
      '--workspace-member',
      'm-42',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, version: 3 });
    expect(stub.requests.map((request) =>
      `${request.method} ${request.url}`)).toEqual([
      'POST /api/projects/p1/collab/pull',
    ]);
    expect(stub.requests[0]?.headers).toMatchObject({
      'x-od-workspace-id': 'team-1',
      'x-od-workspace-member-id': 'm-42',
    });
  });

  it('sends the visibility-to-sync team-share intent and reports the sync state', async () => {
    stub = await startCollabStubServer();
    const share = await runCli([
      'collab', 'share', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--json', '--daemon-url', stub.baseUrl,
    ]);
    expect(share.code).toBe(0);
    expect(JSON.parse(share.stdout)).toEqual({ ok: true, syncState: 'pending_upload' });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'POST', url: '/api/projects/p1/collab/sync-intent' });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({
      event: 'project_team_share_requested',
      projectId: 'p1',
    });
  });

  it('surfaces the sync state in status output', async () => {
    stub = await startCollabStubServer();
    const status = await runCli([
      'collab', 'status', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain('synced');
  });

  it('rejects a heartbeat with no --member', async () => {
    stub = await startCollabStubServer();
    const result = await runCli([
      'collab', 'heartbeat', 'p1',
      '--workspace', 'team-1', '--workspace-member', 'm-42',
      '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--member');
    expect(stub.requests).toHaveLength(0);
  });

  it('rejects project collaboration without explicit workspace identity', async () => {
    stub = await startCollabStubServer();
    const result = await runCli([
      'collab', 'status', 'p1', '--daemon-url', stub.baseUrl,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--workspace <id> and --workspace-member <id>');
    expect(stub.requests).toHaveLength(0);
  });
});
