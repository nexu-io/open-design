import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join as joinPath, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const daemonRoot = pathResolve(currentDir, '..');
const repoRoot = pathResolve(currentDir, '../../..');
const cliSource = pathResolve(currentDir, '../src/cli.ts');
const tsxCli = pathResolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
  headers: http.IncomingHttpHeaders;
}

describe('od skill CLI', () => {
  const requests: CapturedRequest[] = [];
  const completeSkill = {
    id: 'complete-skill',
    name: 'complete-skill',
    body: '# Complete skill\n\n1. Reuse existing inputs.\n2. Fetch missing inputs.\n\n```text\nFinal section stays intact.\n```\n',
  };
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({
          method: req.method ?? '',
          url: req.url ?? '',
          body,
          headers: req.headers,
        });
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET') {
          if (req.url === '/api/skills') {
            res.end(JSON.stringify({ skills: [completeSkill] }));
          } else if (req.url === `/api/skills/${completeSkill.id}`) {
            res.end(JSON.stringify(completeSkill));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'skill not found' }));
          }
          return;
        }
        if (req.url === '/api/skills/import-batch') {
          const skills = JSON.parse(body)?.skills ?? [];
          res.end(JSON.stringify({
            results: skills.map((skill: { fallbackName: string }) => ({
              name: skill.fallbackName,
              status: 'imported',
            })),
          }));
          return;
        }
        res.end(JSON.stringify({
          skill: {
            id: 'remote-skill',
            name: 'remote-skill',
            source: 'user',
          },
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('stub server has no address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    requests.length = 0;
  });

  async function runCli(args: string[]) {
    try {
      const { stdout, stderr } = await execFileP(
        process.execPath,
        [tsxCli, cliSource, ...args],
        {
          cwd: daemonRoot,
          env: { ...process.env, NODE_OPTIONS: undefined },
          timeout: 15_000,
        },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return {
        code: failed.code ?? 1,
        stdout: failed.stdout ?? '',
        stderr: failed.stderr ?? '',
      };
    }
  }

  it.each(['skill', 'skills'])('%s show reads the complete body with one targeted GET', async (command) => {
    const result = await runCli([
      command,
      'show',
      completeSkill.id,
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'GET',
      url: `/api/skills/${completeSkill.id}`,
      body: '',
    });
    expect(JSON.parse(result.stdout)).toEqual(completeSkill);
  });

  it('fails when show cannot find the requested skill', async () => {
    const result = await runCli([
      'skill',
      'show',
      'missing-skill',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).not.toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/skills/missing-skill',
      body: '',
    });
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { message: 'skill not found' },
    });
  });

  it('POSTs the plugin-compatible source and prints the response as JSON', async () => {
    const result = await runCli([
      'skill',
      'install',
      'github:owner/skill-repo',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/skills/install',
      body: JSON.stringify({ source: 'github:owner/skill-repo' }),
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      skill: { id: 'remote-skill' },
    });
  });

  it('passes a browser GitHub repository URL to the shared daemon installer', async () => {
    const result = await runCli([
      'skill',
      'install',
      'https://github.com/leonxlnx/taste-skill',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/skills/install',
      body: JSON.stringify({ source: 'https://github.com/leonxlnx/taste-skill' }),
    });
  });

  it.each([
    ['list', ['list']],
    ['show', ['show', 'complete-skill']],
    ['install', ['install', 'github:owner/skill-repo']],
    ['uninstall', ['uninstall', 'remote-skill']],
  ])('sends the exact workspace pair for skill %s', async (_label, command) => {
    const result = await runCli([
      'skill',
      ...command,
      '--workspace',
      'workspace-a',
      '--workspace-member',
      'member-a',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toMatchObject({
      'x-od-workspace-id': 'workspace-a',
      'x-od-workspace-member-id': 'member-a',
    });
  });

  it.each([
    ['list', ['list']],
    ['show', ['show', 'complete-skill']],
    ['install', ['install', 'github:owner/skill-repo']],
    ['uninstall', ['uninstall', 'remote-skill']],
  ])('rejects an incomplete workspace pair before skill %s', async (_label, command) => {
    const result = await runCli([
      'skill',
      ...command,
      '--workspace',
      'workspace-a',
      '--daemon-url',
      baseUrl,
      '--json',
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--workspace-member');
    expect(requests).toHaveLength(0);
  });

  it('skill import batch-posts every skill folder with its original SKILL.md and side files', async () => {
    const parent = mkdtempSync(joinPath(tmpdir(), 'od-skill-import-'));
    try {
      mkdirSync(joinPath(parent, 'alpha', 'references'), { recursive: true });
      writeFileSync(
        joinPath(parent, 'alpha', 'SKILL.md'),
        '---\nname: alpha-skill\ndescription: |\n  Block scalar kept verbatim.\n---\n\n# Alpha\n',
      );
      writeFileSync(joinPath(parent, 'alpha', 'references', 'api.md'), '# API\n');
      writeFileSync(joinPath(parent, 'alpha', '.DS_Store'), 'junk');
      mkdirSync(joinPath(parent, 'beta'));
      writeFileSync(joinPath(parent, 'beta', 'SKILL.md'), '# Beta has no frontmatter\n');
      mkdirSync(joinPath(parent, 'not-a-skill'));

      const result = await runCli([
        'skill',
        'import',
        parent,
        '--daemon-url',
        baseUrl,
        '--json',
      ]);

      expect(result.code).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ method: 'POST', url: '/api/skills/import-batch' });
      const sent = JSON.parse(requests[0]!.body);
      expect(sent.skills).toHaveLength(2);
      // The original SKILL.md travels verbatim — the daemon materializes it
      // instead of rebuilding it from parsed fields (mrcfps PR #8754 review).
      expect(sent.skills[0]).toMatchObject({ fallbackName: 'alpha' });
      expect(sent.skills[0].skillMd).toBe(
        '---\nname: alpha-skill\ndescription: |\n  Block scalar kept verbatim.\n---\n\n# Alpha\n',
      );
      expect(sent.skills[0].files).toEqual([
        {
          path: 'references/api.md',
          contentBase64: Buffer.from('# API\n').toString('base64'),
        },
      ]);
      expect(sent.skills[1]).toMatchObject({
        fallbackName: 'beta',
        skillMd: '# Beta has no frontmatter\n',
        files: [],
      });
      const printed = JSON.parse(result.stdout);
      expect(printed.results).toEqual([
        { name: 'alpha', status: 'imported' },
        { name: 'beta', status: 'imported' },
      ]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
