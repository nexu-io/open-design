import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
let server: http.Server;
let baseUrl: string;
let requests: Array<{ method: string; url: string; body: string }>;
const masked = { providers: { 'custom-image': {
  configured: true, source: 'stored', apiKeyTail: '1234', baseUrl: 'https://relay.example',
  format: 'gemini-native',
} }, aliases: { effective: {}, env: {}, stored: {} } };

beforeEach(async () => {
  requests = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method!, url: req.url!, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(masked));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function runCli(args: string[], input = '') {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, 'media', 'config',
      ...args, '--daemon-url', baseUrl, '--json'], {
      cwd: daemonRoot, env: { ...process.env, OD_TOOL_TOKEN: '' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

describe('od media config', () => {
  it('reads masked configuration from the same endpoint as Settings', async () => {
    const result = await runCli(['get']);
    expect(result, result.stderr).toMatchObject({ code: 0 });
    expect(requests).toEqual([{ method: 'GET', url: '/api/media/config', body: '' }]);
    expect(JSON.parse(result.stdout)).toEqual(masked);
  });

  it('writes formats and explicit deletions from stdin without echoing credentials', async () => {
    const body = { providers: {
      'custom-image': { apiKey: 'private-cli-key', baseUrl: 'https://relay.example', model: 'image-model', format: 'gemini-native' },
      openai: { deleted: true },
    } };
    const result = await runCli(['set', '--file', '-'], JSON.stringify(body));
    expect(result, result.stderr).toMatchObject({ code: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'PUT', url: '/api/media/config' });
    expect(JSON.parse(requests[0]!.body)).toEqual(body);
    expect(result.stdout).not.toContain('private-cli-key');
    expect(JSON.parse(result.stdout)).toEqual(masked);
  });

  it('rejects a missing provider map before contacting the daemon', async () => {
    const result = await runCli(['set', '--file', '-'], '{}');
    expect(result.code).not.toBe(0);
    expect(requests).toEqual([]);
  });
});
