import { execFile } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

const TEAM_WORKSPACE_ID = 'team-workspace';
const CREATOR_MEMBER_ID = 'creator-member';
const OTHER_MEMBER_ID = 'other-member';

type RequestRecord = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

let server: http.Server;
let baseUrl = '';
let outputDir = '';
let requests: RequestRecord[] = [];

function projectForRequest(request: RequestRecord): 'bound' | 'unbound' {
  if (
    request.url.includes('unbound-project')
    || request.url.includes('run-unbound')
    || request.url.includes('task-unbound')
  ) {
    return 'unbound';
  }
  if (request.url === '/api/runs' && request.body) {
    const body = JSON.parse(request.body) as { projectId?: string };
    return body.projectId === 'unbound-project' ? 'unbound' : 'bound';
  }
  if (request.url.includes('/api/library/assets/') && request.body) {
    const body = JSON.parse(request.body) as { projectId?: string };
    return body.projectId === 'unbound-project' ? 'unbound' : 'bound';
  }
  return 'bound';
}

function authorizeProjectRequest(request: RequestRecord): {
  status: number;
  code?: string;
} {
  if (request.headers.authorization === 'Bearer tool-proof') return { status: 200 };
  if (projectForRequest(request) === 'unbound') return { status: 200 };
  const workspaceId = request.headers['x-od-workspace-id'];
  const memberId = request.headers['x-od-workspace-member-id'];
  if (!workspaceId || !memberId) {
    return { status: 401, code: 'WORKSPACE_CONTEXT_REQUIRED' };
  }
  if (workspaceId !== TEAM_WORKSPACE_ID || memberId !== CREATOR_MEMBER_ID) {
    return { status: 403, code: 'PROJECT_WRITE_FORBIDDEN' };
  }
  return { status: 200 };
}

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  outputDir = await mkdtemp(path.join(os.tmpdir(), 'od-cli-project-scope-'));
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const request: RequestRecord = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body,
      };
      requests.push(request);
      const authority = authorizeProjectRequest(request);
      if (authority.status !== 200) {
        json(res, authority.status, {
          error: {
            code: authority.code,
            message: authority.code,
          },
        });
        return;
      }
      if (request.url.includes('/export/')) {
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename="artifact.png"',
        });
        res.end('png');
        return;
      }
      if (request.url.endsWith('/media/generate')) {
        json(res, 200, {
          taskId: projectForRequest(request) === 'unbound'
            ? 'task-unbound'
            : 'task-bound',
          status: 'queued',
        });
        return;
      }
      if (request.url.includes('/api/media/tasks/')) {
        json(res, 200, {
          status: 'done',
          file: { name: 'generated.png', size: 3 },
        });
        return;
      }
      if (request.url.includes('/genui')) {
        json(res, 200, request.method === 'POST'
          ? { surface: { id: 'surface-row', surfaceId: 'surface-1' } }
          : { surfaces: [] });
        return;
      }
      if (request.url.endsWith('/deploy')) {
        json(res, 200, {
          id: 'deployment-1',
          status: 'ready',
          url: 'https://example.invalid',
        });
        return;
      }
      if (request.url.includes('/api/library/assets/')) {
        json(res, 200, { relPath: 'library/asset.png' });
        return;
      }
      if (request.url === '/api/runs' && request.method === 'POST') {
        json(res, 200, { runId: 'run-1' });
        return;
      }
      json(res, 404, { error: { code: 'NOT_FOUND', message: request.url } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing fixture address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(outputDir, { recursive: true, force: true });
});

async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [tsxCli, cliEntry, ...args],
      {
        cwd: daemonRoot,
        env: { ...process.env, ...env, NODE_OPTIONS: '' },
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

type ConsumerFixture = {
  label: string;
  args: (projectId: string, outputPath: string) => string[];
};

const consumers: ConsumerFixture[] = [
  {
    label: 'export',
    args: (projectId, outputPath) => [
      'export',
      'index.html',
      '--project',
      projectId,
      '--format',
      'image',
      '--out',
      outputPath,
    ],
  },
  {
    label: 'media generate and wait',
    args: (projectId) => [
      'media',
      'generate',
      '--project',
      projectId,
      '--surface',
      'image',
      '--model',
      'fixture-model',
      '--prompt',
      'fixture prompt',
    ],
  },
  {
    label: 'project GenUI read',
    args: (projectId) => ['ui', 'list', '--project', projectId, '--json'],
  },
  {
    label: 'run GenUI read',
    args: (projectId) => [
      'ui',
      'list',
      '--run',
      projectId === 'unbound-project' ? 'run-unbound' : 'run-bound',
      '--json',
    ],
  },
  {
    label: 'project GenUI write',
    args: (projectId) => [
      'ui',
      'revoke',
      '--project',
      projectId,
      'surface-1',
      '--json',
    ],
  },
  {
    label: 'run GenUI write',
    args: (projectId) => [
      'ui',
      'respond',
      '--run',
      projectId === 'unbound-project' ? 'run-unbound' : 'run-bound',
      'surface-1',
      '--value',
      'approved',
      '--json',
    ],
  },
  {
    label: 'deploy',
    args: (projectId) => ['deploy', projectId, '--file', 'index.html', '--json'],
  },
  {
    label: 'library apply',
    args: (projectId) => [
      'library',
      'apply',
      'asset-1',
      '--project',
      projectId,
      '--json',
    ],
  },
  {
    label: 'run start',
    args: (projectId) => [
      'run',
      'start',
      '--project',
      projectId,
      '--json',
    ],
  },
];

function workspaceFlags(memberId: string): string[] {
  return [
    '--workspace',
    TEAM_WORKSPACE_ID,
    '--workspace-member',
    memberId,
  ];
}

describe('project consumer CLI explicit Workspace fixture matrix', () => {
  for (const consumer of consumers) {
    it(`${consumer.label}: allows the bound project creator`, async () => {
      requests = [];
      const result = await runCli([
        ...consumer.args(
          'bound-project',
          path.join(outputDir, `${consumer.label}-creator.out`),
        ),
        ...workspaceFlags(CREATOR_MEMBER_ID),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code, result.stderr).toBe(0);
      expect(requests.length).toBeGreaterThan(0);
      for (const request of requests) {
        expect(request.headers['x-od-workspace-id']).toBe(TEAM_WORKSPACE_ID);
        expect(request.headers['x-od-workspace-member-id']).toBe(CREATOR_MEMBER_ID);
      }
    });

    it(`${consumer.label}: preserves the non-creator denial`, async () => {
      requests = [];
      const result = await runCli([
        ...consumer.args(
          'bound-project',
          path.join(outputDir, `${consumer.label}-noncreator.out`),
        ),
        ...workspaceFlags(OTHER_MEMBER_ID),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code).not.toBe(0);
      expect(requests[0]?.headers['x-od-workspace-member-id']).toBe(OTHER_MEMBER_ID);
    });

    it(`${consumer.label}: lets the daemon reject missing bound-project scope`, async () => {
      requests = [];
      const result = await runCli([
        ...consumer.args(
          'bound-project',
          path.join(outputDir, `${consumer.label}-missing.out`),
        ),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code).not.toBe(0);
      expect(requests[0]?.headers['x-od-workspace-id']).toBeUndefined();
      expect(requests[0]?.headers['x-od-workspace-member-id']).toBeUndefined();
    });

    it(`${consumer.label}: keeps a historical unbound project headerless`, async () => {
      requests = [];
      const result = await runCli([
        ...consumer.args(
          'unbound-project',
          path.join(outputDir, `${consumer.label}-unbound.out`),
        ),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code, result.stderr).toBe(0);
      expect(requests.length).toBeGreaterThan(0);
      for (const request of requests) {
        expect(request.headers['x-od-workspace-id']).toBeUndefined();
        expect(request.headers['x-od-workspace-member-id']).toBeUndefined();
      }
    });
  }

  it('retains the authorized tool token through media polling', async () => {
    requests = [];
    const result = await runCli(
      [
        'media',
        'generate',
        '--surface',
        'image',
        '--model',
        'fixture-model',
        '--prompt',
        'fixture prompt',
        '--daemon-url',
        baseUrl,
      ],
      {
        OD_PROJECT_ID: 'bound-project',
        OD_TOOL_TOKEN: 'tool-proof',
      },
    );

    expect(result.code, result.stderr).toBe(0);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      'Bearer tool-proof',
      'Bearer tool-proof',
    ]);
  });
});
