import { execFile } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const OTHER_WORKSPACE_ID = 'other-workspace';
const CREATOR_MEMBER_ID = 'creator-member';
const OTHER_MEMBER_ID = 'other-member';

type RequestRecord = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type CommandFixture = {
  label: string;
  args: (projectId: string) => string[];
  requests: (projectId: string) => string[];
};

let server: http.Server;
let baseUrl = '';
let tempDir = '';
let figmaFile = '';
let requests: RequestRecord[] = [];

function parseJsonBody(request: RequestRecord): Record<string, unknown> {
  if (!request.body || !request.headers['content-type']?.includes('application/json')) {
    return {};
  }
  return JSON.parse(request.body) as Record<string, unknown>;
}

function projectIdForRequest(request: RequestRecord): string {
  const pathMatch = request.url.match(/^\/api\/projects\/([^/]+)/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  if (request.url.includes('run-unbound')) return 'unbound-project';
  if (request.url.includes('run-bound')) return 'bound-project';
  const body = parseJsonBody(request);
  return typeof body.projectId === 'string' ? body.projectId : 'bound-project';
}

function requestNeedsCreator(request: RequestRecord): boolean {
  if (request.method === 'GET') return false;
  if (/^\/api\/plugins\/[^/]+\/apply$/.test(request.url)) return false;
  return true;
}

function authorize(request: RequestRecord): { status: number; code?: string } {
  if (projectIdForRequest(request) === 'unbound-project') return { status: 200 };
  const workspaceId = request.headers['x-od-workspace-id'];
  const memberId = request.headers['x-od-workspace-member-id'];
  if (!workspaceId || !memberId) {
    return { status: 401, code: 'WORKSPACE_CONTEXT_REQUIRED' };
  }
  if (workspaceId !== TEAM_WORKSPACE_ID) {
    return { status: 403, code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' };
  }
  if (requestNeedsCreator(request) && memberId !== CREATOR_MEMBER_ID) {
    return { status: 403, code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' };
  }
  return { status: 200 };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function successResponse(request: RequestRecord, res: http.ServerResponse): void {
  if (request.url === '/api/runs' && request.method === 'POST') {
    const projectId = projectIdForRequest(request);
    sendJson(res, 200, {
      runId: projectId === 'unbound-project' ? 'run-unbound' : 'run-bound',
      appliedPluginSnapshotId: 'snapshot-1',
    });
    return;
  }
  if (/^\/api\/runs\/run-(?:bound|unbound)\/events$/.test(request.url)) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    res.end('event: end\ndata: {"status":"completed"}\n\n');
    return;
  }
  if (/^\/api\/plugins\/[^/]+\/apply$/.test(request.url)) {
    sendJson(res, 200, {
      ok: true,
      appliedPlugin: { snapshotId: 'snapshot-1' },
    });
    return;
  }
  if (/\/conversations$/.test(request.url) && request.method === 'POST') {
    sendJson(res, 200, {
      conversation: {
        id: 'conversation-1',
        projectId: projectIdForRequest(request),
        sessionMode: 'design',
      },
    });
    return;
  }
  if (/\/conversations$/.test(request.url)) {
    sendJson(res, 200, { conversations: [] });
    return;
  }
  if (/\/applied-plugins$/.test(request.url)) {
    sendJson(res, 200, { snapshots: [] });
    return;
  }
  if (/\/plugin-candidates$/.test(request.url)) {
    sendJson(res, 200, { candidates: [] });
    return;
  }
  if (/\/plugin-candidates\/[^/]+\/draft$/.test(request.url)) {
    sendJson(res, 200, {
      draftPath: 'plugins/draft',
      validation: { ok: true },
    });
    return;
  }
  if (/\/plugin-candidates\/[^/]+\/dismiss$/.test(request.url)) {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (/\/figma\/import$/.test(request.url)) {
    sendJson(res, 200, {
      label: 'fixture.fig',
      snapshotDir: 'figma',
      inventory: {
        decoded: true,
        nodeCount: 1,
        pageCount: 1,
        frameCount: 1,
        componentCount: 0,
        colors: [],
        fonts: [],
        assetCount: 0,
        hasThumbnail: false,
        warnings: [],
      },
      suggestedPrompt: 'Build the fixture',
    });
    return;
  }
  sendJson(res, 404, {
    error: { code: 'NOT_FOUND', message: request.url },
  });
}

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-project-command-scope-'));
  figmaFile = path.join(tempDir, 'fixture.fig');
  await writeFile(figmaFile, Buffer.from('fixture fig bytes'));

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
      const authority = authorize(request);
      if (authority.status !== 200) {
        sendJson(res, authority.status, {
          error: {
            code: authority.code,
            message: authority.code,
          },
        });
        return;
      }
      successResponse(request, res);
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
  await rm(tempDir, { recursive: true, force: true });
});

async function runCli(args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [tsxCli, cliEntry, ...args],
      {
        cwd: daemonRoot,
        env: { ...process.env, NODE_OPTIONS: '' },
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

function workspaceFlags(
  memberId = CREATOR_MEMBER_ID,
  workspaceId = TEAM_WORKSPACE_ID,
): string[] {
  return [
    '--workspace',
    workspaceId,
    '--workspace-member',
    memberId,
  ];
}

const commandFixtures: CommandFixture[] = [
  {
    label: 'conversation new',
    args: (projectId) => ['conversation', 'new', projectId, '--json'],
    requests: (projectId) => [`POST /api/projects/${projectId}/conversations`],
  },
  {
    label: 'conversation list',
    args: (projectId) => ['conversation', 'list', projectId, '--json'],
    requests: (projectId) => [`GET /api/projects/${projectId}/conversations`],
  },
  {
    label: 'chat new',
    args: (projectId) => ['chat', 'new', '--project', projectId, '--json'],
    requests: (projectId) => [`POST /api/projects/${projectId}/conversations`],
  },
  {
    label: 'plugin run and follow',
    args: (projectId) => [
      'plugin',
      'run',
      'fixture-plugin',
      '--project',
      projectId,
      '--follow',
      '--json',
    ],
    requests: (projectId) => [
      'POST /api/plugins/fixture-plugin/apply',
      'POST /api/runs',
      `GET /api/runs/${projectId === 'unbound-project' ? 'run-unbound' : 'run-bound'}/events`,
    ],
  },
  {
    label: 'project plugin snapshots list',
    args: (projectId) => [
      'plugin',
      'snapshots',
      'list',
      '--project',
      projectId,
      '--json',
    ],
    requests: (projectId) => [`GET /api/projects/${projectId}/applied-plugins`],
  },
  {
    label: 'plugin candidates list',
    args: (projectId) => [
      'plugin',
      'candidates',
      'list',
      '--project',
      projectId,
      '--json',
    ],
    requests: (projectId) => [`GET /api/projects/${projectId}/plugin-candidates`],
  },
  {
    label: 'plugin candidate draft',
    args: (projectId) => [
      'plugin',
      'candidates',
      'draft',
      'candidate-1',
      '--project',
      projectId,
      '--json',
    ],
    requests: (projectId) => [
      `POST /api/projects/${projectId}/plugin-candidates/candidate-1/draft`,
    ],
  },
  {
    label: 'plugin candidate dismiss',
    args: (projectId) => [
      'plugin',
      'candidates',
      'dismiss',
      'candidate-1',
      '--project',
      projectId,
      '--json',
    ],
    requests: (projectId) => [
      `POST /api/projects/${projectId}/plugin-candidates/candidate-1/dismiss`,
    ],
  },
  {
    label: 'Figma URL import',
    args: (projectId) => [
      'figma',
      'import',
      '--project',
      projectId,
      '--figma-url',
      'https://figma.com/file/fixture',
      '--json',
    ],
    requests: () => ['POST /api/runs'],
  },
  {
    label: 'local Figma import',
    args: (projectId) => [
      'figma',
      'import',
      '--project',
      projectId,
      '--file',
      figmaFile,
      '--json',
    ],
    requests: (projectId) => [`POST /api/projects/${projectId}/figma/import`],
  },
  {
    label: 'local Figma import and build',
    args: (projectId) => [
      'figma',
      'import',
      '--project',
      projectId,
      '--file',
      figmaFile,
      '--build',
      '--json',
    ],
    requests: (projectId) => [
      `POST /api/projects/${projectId}/figma/import`,
      'POST /api/runs',
    ],
  },
];

const readFixtures = commandFixtures.filter((fixture) => [
  'conversation list',
  'project plugin snapshots list',
  'plugin candidates list',
].includes(fixture.label));

const writeFixtures = commandFixtures.filter((fixture) => !readFixtures.includes(fixture));

describe('project command CLI explicit Workspace scope', () => {
  for (const fixture of commandFixtures) {
    it(`${fixture.label}: forwards exact creator scope through every request`, async () => {
      requests = [];
      const result = await runCli([
        ...fixture.args('bound-project'),
        ...workspaceFlags(),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code, result.stderr).toBe(0);
      expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual(
        fixture.requests('bound-project'),
      );
      for (const request of requests) {
        expect(request.headers['x-od-workspace-id']).toBe(TEAM_WORKSPACE_ID);
        expect(request.headers['x-od-workspace-member-id']).toBe(CREATOR_MEMBER_ID);
      }
    });

    it(`${fixture.label}: preserves unbound legacy headerless behavior`, async () => {
      requests = [];
      const result = await runCli([
        ...fixture.args('unbound-project'),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code, result.stderr).toBe(0);
      expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual(
        fixture.requests('unbound-project'),
      );
      for (const request of requests) {
        expect(request.headers['x-od-workspace-id']).toBeUndefined();
        expect(request.headers['x-od-workspace-member-id']).toBeUndefined();
      }
    });
  }

  for (const fixture of readFixtures) {
    it(`${fixture.label}: keeps Team reads available to another active member`, async () => {
      requests = [];
      const result = await runCli([
        ...fixture.args('bound-project'),
        ...workspaceFlags(OTHER_MEMBER_ID),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code, result.stderr).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers['x-od-workspace-member-id']).toBe(OTHER_MEMBER_ID);
    });
  }

  for (const fixture of writeFixtures) {
    it(`${fixture.label}: preserves another member's write denial`, async () => {
      requests = [];
      const result = await runCli([
        ...fixture.args('bound-project'),
        ...workspaceFlags(OTHER_MEMBER_ID),
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code).not.toBe(0);
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.at(-1)?.headers['x-od-workspace-member-id']).toBe(OTHER_MEMBER_ID);
      expect(requests).toHaveLength(fixture.label === 'plugin run and follow' ? 2 : 1);
    });
  }

  it('forwards a conflicting Workspace for the daemon to reject', async () => {
    requests = [];
    const result = await runCli([
      'conversation',
      'list',
      'bound-project',
      ...workspaceFlags(CREATOR_MEMBER_ID, OTHER_WORKSPACE_ID),
      '--daemon-url',
      baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers['x-od-workspace-id']).toBe(OTHER_WORKSPACE_ID);
  });

  it.each([
    {
      label: 'conversation',
      args: ['conversation', 'new', 'bound-project', '--json'],
    },
    {
      label: 'chat',
      args: ['chat', 'new', '--project', 'bound-project', '--json'],
    },
    {
      label: 'plugin run',
      args: ['plugin', 'run', 'fixture-plugin', '--project', 'bound-project', '--json'],
    },
    {
      label: 'plugin snapshots',
      args: ['plugin', 'snapshots', 'list', '--project', 'bound-project', '--json'],
    },
    {
      label: 'plugin candidates',
      args: ['plugin', 'candidates', 'list', '--project', 'bound-project', '--json'],
    },
    {
      label: 'Figma',
      args: [
        'figma',
        'import',
        '--project',
        'bound-project',
        '--figma-url',
        'https://figma.com/file/fixture',
        '--json',
      ],
    },
  ])('$label rejects either partial Workspace pair before HTTP', async ({ args }) => {
    for (const partial of [
      ['--workspace', TEAM_WORKSPACE_ID],
      ['--workspace-member', CREATOR_MEMBER_ID],
    ]) {
      requests = [];
      const result = await runCli([
        ...args,
        ...partial,
        '--daemon-url',
        baseUrl,
      ]);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('workspace-context-required');
      expect(result.stderr).toContain('--workspace <id> and --workspace-member <id>');
      expect(requests).toHaveLength(0);
    }
  });

  it.each([
    ['conversation', ['conversation', 'help']],
    ['chat', ['chat', 'help']],
    ['plugin', ['plugin', 'help']],
    ['plugin snapshots', ['plugin', 'snapshots', 'help']],
    ['plugin candidates', ['plugin', 'candidates', 'help']],
    ['Figma', ['figma', 'help']],
  ])('%s help documents the explicit Workspace pair', async (_label, args) => {
    const result = await runCli(args);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('--workspace <id>');
    expect(result.stdout).toContain('--workspace-member <id>');
  });
});
