import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let server: http.Server | undefined;
let baseUrl = '';
let seen: { url: string; body: string; authorization?: string } | undefined;

beforeEach(async () => {
  seen = undefined;
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen = {
        url: req.url ?? '',
        body,
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      };
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        compositionDir: '.hyperframes-cache/launch-video',
        files: ['hyperframes.json', 'meta.json', 'index.html'],
      }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function runScaffoldCli(env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import', 'tsx', cliEntry,
      'media', 'scaffold',
      '--composition-dir', '.hyperframes-cache/launch-video',
      '--daemon-url', baseUrl,
      '--json',
    ], {
      cwd: daemonRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

describe('od media scaffold', () => {
  it('asks the daemon to create a project-scoped HyperFrames composition', async () => {
    const result = await runScaffoldCli({
      ...process.env,
      OD_PROJECT_ID: 'project-1',
      OD_TOOL_TOKEN: '',
    });

    expect(result, result.stderr).toMatchObject({ code: 0 });
    expect(seen?.url).toBe('/api/projects/project-1/media/hyperframes/scaffold');
    expect(JSON.parse(seen?.body ?? '{}')).toEqual({
      compositionDir: '.hyperframes-cache/launch-video',
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      compositionDir: '.hyperframes-cache/launch-video',
    });
  });

  it('derives project authority from the injected tool token', async () => {
    const result = await runScaffoldCli({
      ...process.env,
      OD_PROJECT_ID: '',
      OD_TOOL_TOKEN: 'token-1',
    });

    expect(result, result.stderr).toMatchObject({ code: 0 });
    expect(seen).toMatchObject({
      url: '/api/tools/media/hyperframes/scaffold',
      authorization: 'Bearer token-1',
    });
  });
});
