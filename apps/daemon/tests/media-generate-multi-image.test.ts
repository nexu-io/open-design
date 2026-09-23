import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let server: http.Server | undefined;
let baseUrl = '';
let seenBodies: string[] = [];

beforeEach(async () => {
  seenBodies = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.method === 'POST' && (req.url ?? '').includes('/media/generate')) {
        seenBodies.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'task-images', status: 'queued' }));
        return;
      }
      if ((req.url ?? '').includes('/media/tasks/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'done', file: { name: 'out.png', size: 3 } }));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function runCli(images: string[]): Promise<{ code: number; stderr: string }> {
  const args = [
    '--import',
    'tsx',
    cliEntry,
    'media',
    'generate',
    '--surface',
    'image',
    '--model',
    'vela/gpt-image-2',
    '--prompt',
    'Edit the references',
    '--daemon-url',
    baseUrl,
    ...images.flatMap((image) => ['--image', image]),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: daemonRoot,
      env: { ...process.env, OD_PROJECT_ID: 'project-1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

describe('od media generate repeated --image', () => {
  it('posts all five images and preserves the legacy primary image field', async () => {
    const images = ['one.png', 'two.png', 'three.png', 'four.png', 'five.png'];
    const result = await runCli(images);

    expect(result.code, result.stderr).toBe(0);
    expect(seenBodies).toHaveLength(1);
    const body = JSON.parse(seenBodies[0]!);
    expect(body.image).toBe('one.png');
    expect(body.images).toEqual(images);
  });

  it('rejects six Vela images before making an HTTP request', async () => {
    const images = Array.from({ length: 6 }, (_, index) => `ref-${index}.png`);
    const result = await runCli(images);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('at most 5 --image values');
    expect(seenBodies).toHaveLength(0);
  });
});
