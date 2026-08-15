import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
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
  headers: http.IncomingHttpHeaders;
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

let stub: StubServer | null = null;
let tempRoot = '';

afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

async function startProjectStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const captured: CapturedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: raw,
      };
      requests.push(captured);

      res.setHeader('content-type', 'application/json');
      if (captured.method === 'POST' && captured.url === '/api/projects/source-project/design-system-copy') {
        res.statusCode = 201;
        res.end(JSON.stringify({
          project: { id: 'design-copy-1', name: 'Design Copy' },
          designSystemId: 'user:design-copy-1',
          conversationId: 'conversation-design-copy',
        }));
        return;
      }
      if (captured.method === 'POST' && captured.url === '/api/projects/source-project/duplicate') {
        res.statusCode = 201;
        res.end(JSON.stringify({
          project: { id: 'duplicate-1', name: 'Duplicate Copy' },
          conversationId: 'conversation-duplicate',
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/projects/project-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          project: { id: 'project-1', name: 'Project One', workspaceId: 'ws-1' },
          resolvedDir: '/tmp/projects/project-1',
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/projects/project-1/files') {
        res.statusCode = 200;
        res.end(JSON.stringify({ files: [] }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/workspaces/ws-1/projects?view=team') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          projects: [
            { id: 'project-1', name: 'Project One', visibility: 'team', resourceState: 'active' },
          ],
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/workspaces/ws-1/projects') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          projects: [
            { id: 'project-1', name: 'Project One', skillId: null },
          ],
        }));
        return;
      }
      if (captured.method === 'POST' && captured.url === '/api/workspace/invite') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          results: [{ email: 'teammate@example.com', ok: true, inviteId: 'invite-1' }],
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/workspace/projects/team') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          projects: [{ projectId: 'team-project-1', displayName: 'Team Project' }],
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/workspace/members') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          members: [{ memberId: 'member-1', displayName: 'Member One', role: 'admin' }],
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/workspace/skills/team') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ids: ['team-skill'], resources: [{ id: 'team-skill' }] }));
        return;
      }
      if (captured.method === 'POST' && captured.url === '/api/workspaces/ws-1/projects/batch-delete') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, deletedProjectIds: ['project-1', 'project-2'] }));
        return;
      }
      // Workspace directory used by `od project list` to auto-resolve the
      // signed-in workspace when no explicit --workspace/--workspace-member
      // is supplied (#6679). Mirrors the personal workspace shape returned
      // by the real daemon GET /api/workspace/directory.
      if (captured.method === 'GET' && captured.url === '/api/workspace/directory') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          items: [
            {
              workspaceId: 'ws-personal',
              workspaceName: 'Personal',
              workspaceType: 'personal',
              workspaceMemberId: 'mem-personal',
              role: 'owner',
              memberStatus: 'active',
              lifecycleState: 'active',
            },
          ],
          activeWorkspaceId: null,
        }));
        return;
      }
      if (captured.method === 'GET' && captured.url === '/api/workspaces/ws-personal/projects') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          projects: [
            { id: 'bound-project-1', name: 'Bound Project One', skillId: 'skill-1' },
            { id: 'bound-project-2', name: 'Bound Project Two', skillId: 'skill-2' },
          ],
        }));
        return;
      }
      // An unbound project catalog (no signed-in workspace / non-vela).
      if (captured.method === 'GET' && captured.url === '/api/projects') {
        res.statusCode = 200;
        res.end(JSON.stringify({ projects: [] }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'unexpected-request', message: captured.url } }));
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
    return {
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
      code: failed.code ?? 1,
    };
  }
}

describe('od project CLI', () => {
  it('documents exact workspace identity for bound project and file commands', async () => {
    const projectHelp = await runCli(['project', 'help']);
    const filesHelp = await runCli(['files', 'help']);

    expect(projectHelp.code).toBe(0);
    expect(filesHelp.code).toBe(0);
    expect(projectHelp.stdout).toContain('--workspace <id>');
    expect(projectHelp.stdout).toContain('--workspace-member <id>');
    expect(filesHelp.stdout).toContain('--workspace <id>');
    expect(filesHelp.stdout).toContain('--workspace-member <id>');
  });

  it.each([
    ['project detail', ['project', 'info', 'project-1', '--json']],
    ['project files', ['files', 'list', 'project-1', '--json']],
  ])('sends exact workspace identity for bound %s', async (_label, command) => {
    stub = await startProjectStubServer();

    const result = await runCli([
      ...command,
      '--workspace',
      'ws-1',
      '--workspace-member',
      'member-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
    });
  });

  it('creates a design-system project with prompt-file content and JSON output', async () => {
    stub = await startProjectStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-project-cli-'));
    const promptPath = join(tempRoot, 'prompt.md');
    writeFileSync(promptPath, 'Use this workspace as the brand source.\n', 'utf8');

    const result = await runCli([
      'project',
      'create-design-system',
      'source-project',
      '--name',
      'Design Copy',
      '--prompt-file',
      promptPath,
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      project: { id: 'design-copy-1', name: 'Design Copy' },
      designSystemId: 'user:design-copy-1',
      conversationId: 'conversation-design-copy',
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/projects/source-project/design-system-copy',
    });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({
      name: 'Design Copy',
      pendingPrompt: 'Use this workspace as the brand source.\n',
    });
  });

  it('duplicates a project and prints the human-readable result', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'project',
      'duplicate',
      'source-project',
      '--name',
      'Duplicate Copy',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      '[project] duplicated source-project as duplicate-1 (conversation conversation-duplicate)\n',
    );
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/projects/source-project/duplicate',
    });
    expect(JSON.parse(stub.requests[0]!.body)).toEqual({ name: 'Duplicate Copy' });
  });

  it('lists workspace projects through the workspace-scoped API', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'workspace',
      'projects',
      'list',
      '--workspace',
      'ws-1',
      '--member',
      'member-1',
      '--role',
      'admin',
      '--view',
      'team',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      projects: [{ id: 'project-1', visibility: 'team' }],
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspaces/ws-1/projects?view=team',
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
      'x-od-workspace-role': 'admin',
    });
  });

  it('od project list without --workspace resolves the signed-in workspace automatically (#6679)', async () => {
    stub = await startProjectStubServer();

    const result = await runCli(['project', 'list', '--json', '--daemon-url', stub.baseUrl]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const data = JSON.parse(result.stdout);
    expect(data.projects).toEqual([
      { id: 'bound-project-1', name: 'Bound Project One', skillId: 'skill-1' },
      { id: 'bound-project-2', name: 'Bound Project Two', skillId: 'skill-2' },
    ]);
    // Should hit both the directory resolver and the workspace-scoped catalog.
    expect(stub.requests).toHaveLength(2);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspace/directory',
    });
    expect(stub.requests[1]).toMatchObject({
      method: 'GET',
      url: '/api/workspaces/ws-personal/projects',
    });
    expect(stub.requests[1]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-personal',
      'x-od-workspace-member-id': 'mem-personal',
    });
  });

  it('od project list with explicit --workspace routes to the workspace-scoped catalog (#6679)', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'project',
      'list',
      '--workspace',
      'ws-1',
      '--workspace-member',
      'member-1',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    // No workspace/directory call — explicit flags win, but they route to
    // the workspace-scoped catalog (/api/workspaces/:id/projects), not to
    // the unbound /api/projects catalog. Passing --workspace to /api/projects
    // does NOT scope it (#6679 repro), so the explicit path mirrors the
    // implicit signed-in path.
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspaces/ws-1/projects',
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
    });
  });

  it('od project list falls back to headerless catalog when no signed-in workspace (#6679)', async () => {
    // Custom stub whose directory endpoint returns empty (signed-out / no vela)
    // so resolveMcpWorkspaceContext returns null and the CLI falls back to the
    // headerless unbound catalog exactly as before the fix.
    const requests: CapturedRequest[] = [];
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const captured: CapturedRequest = {
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: raw,
        };
        requests.push(captured);
        res.setHeader('content-type', 'application/json');
        if (captured.method === 'GET' && captured.url === '/api/workspace/directory') {
          res.statusCode = 200;
          res.end(JSON.stringify({ items: [], activeWorkspaceId: null }));
          return;
        }
        if (captured.method === 'GET' && captured.url === '/api/projects') {
          res.statusCode = 200;
          res.end(JSON.stringify({ projects: [{ id: 'unbound-1', name: 'Unbound One' }] }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { code: 'unexpected', message: captured.url } }));
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('stub server has no address');
    const fallBaseUrl = `http://127.0.0.1:${addr.port}`;
    const fallStub = { baseUrl: fallBaseUrl, requests };
    // Replace `stub` so afterEach closes the original stub (we just closed its
    // server implicitly via the same afterEach hook on the closure name).
    stub = {
      baseUrl: fallStub.baseUrl,
      requests,
      close: () =>
        new Promise<void>((resolveClose, rejectClose) => {
          server.close((err) => (err ? rejectClose(err) : resolveClose()));
        }),
    };

    const result = await runCli(['project', 'list', '--json', '--daemon-url', fallStub.baseUrl]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const data = JSON.parse(result.stdout);
    expect(data.projects).toEqual([{ id: 'unbound-1', name: 'Unbound One' }]);
    // Fallback path fires: directory probed then unbound catalog.
    const dirReq = requests.find((r) => r.method === 'GET' && r.url === '/api/workspace/directory');
    const catalogReq = requests.find((r) => r.method === 'GET' && r.url === '/api/projects');
    expect(dirReq).toBeDefined();
    expect(catalogReq).toBeDefined();
  });

  it('creates workspace invites through the workspace invite API', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'workspace',
      'invite',
      '--email',
      'teammate@example.com',
      '--role',
      'member',
      '--workspace',
      'ws-1',
      '--member',
      'member-1',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      results: [{ email: 'teammate@example.com', ok: true, inviteId: 'invite-1' }],
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/workspace/invite',
      body: JSON.stringify({ email: 'teammate@example.com', role: 'member' }),
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
    });
  });

  it('lists team projects through the workspace discovery API', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'workspace',
      'projects',
      'team',
      '--workspace',
      'ws-1',
      '--member',
      'member-1',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      projects: [{ projectId: 'team-project-1', displayName: 'Team Project' }],
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspace/projects/team',
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
    });
  });

  it('lists workspace members through the workspace member directory API', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'workspace',
      'members',
      'list',
      '--workspace',
      'ws-1',
      '--member',
      'member-1',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      members: [{ memberId: 'member-1', displayName: 'Member One', role: 'admin' }],
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspace/members',
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
    });
  });

  it('rejects workspace directory commands without explicit workspace identity', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'workspace',
      'members',
      'list',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--workspace <id> and --workspace-member <id>');
    expect(stub.requests).toHaveLength(0);
  });

  it('sends explicit CLI workspace identity to team resource routes', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'collab',
      'team-resources',
      'skills',
      '--workspace',
      'ws-1',
      '--workspace-member',
      'member-1',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      ids: ['team-skill'],
      resources: [{ id: 'team-skill' }],
    });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/workspace/skills/team',
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
    });
  });

  it('sends repeatable project ids for workspace batch delete', async () => {
    stub = await startProjectStubServer();

    const result = await runCli([
      'workspace',
      'projects',
      'batch-delete',
      '--workspace',
      'ws-1',
      '--member',
      'member-1',
      '--role',
      'admin',
      '--project',
      'project-1',
      '--project',
      'project-2',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, deletedProjectIds: ['project-1', 'project-2'] });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/workspaces/ws-1/projects/batch-delete',
      body: JSON.stringify({ projectIds: ['project-1', 'project-2'] }),
    });
    expect(stub.requests[0]!.headers).toMatchObject({
      'x-od-workspace-id': 'ws-1',
      'x-od-workspace-member-id': 'member-1',
      'x-od-workspace-role': 'admin',
    });
  });
});
