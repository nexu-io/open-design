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

async function startFigmaStubServer(): Promise<StubServer> {
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
        body: raw,
      };
      requests.push(captured);

      res.setHeader('content-type', 'application/json');
      if (captured.method === 'POST' && captured.url === '/api/projects/project-1/figma/import') {
        res.end(JSON.stringify({
          label: 'Mock kit.fig',
          snapshotDir: 'figma',
          files: ['figma/tree.json'],
          inventory: {
            decoded: true,
            nodeCount: 1,
            pageCount: 1,
            frameCount: 1,
            componentCount: 0,
            colors: ['#3366ff'],
            fonts: [],
            assetCount: 0,
            hasThumbnail: false,
            warnings: [],
          },
          contextPath: 'figma/DESIGN-context.md',
          suggestedPrompt: 'Build from figma/DESIGN-context.md',
        }));
        return;
      }
      if (captured.method === 'POST' && captured.url === '/api/runs') {
        res.end(JSON.stringify({ runId: 'run-1', status: 'queued' }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
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

describe('od figma import CLI', () => {
  it('emits JSON-only stdout when --build and --json are combined', async () => {
    stub = await startFigmaStubServer();
    tempRoot = mkdtempSync(join(tmpdir(), 'od-figma-cli-'));
    const figPath = join(tempRoot, 'Mock kit.fig');
    writeFileSync(figPath, Buffer.from('fake fig bytes'));

    const result = await runCli([
      'figma',
      'import',
      '--project',
      'project-1',
      '--file',
      figPath,
      '--build',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('[figma]');
    const payload = JSON.parse(result.stdout) as { label: string; build?: { runId?: string } };
    expect(payload.label).toBe('Mock kit.fig');
    expect(payload.build?.runId).toBe('run-1');
    expect(stub.requests.map((req) => `${req.method} ${req.url}`)).toEqual([
      'POST /api/projects/project-1/figma/import',
      'POST /api/runs',
    ]);
  });
});
