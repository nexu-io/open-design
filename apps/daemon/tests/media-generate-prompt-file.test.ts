// Gap-fill spec — `od media generate` must accept --prompt-file <path|->.
//
// AGENTS.md (Capability exposure / UI-CLI dual-track):
//   "The CLI form must ... accept long-form prompts via --prompt-file <path|->,
//    so jobs that pipe through xargs, jq, and <heredoc stay clean."
//
// Every other prompt-taking `od` action (run redesign, brand create, automation
// create, files version-create) already routes through readPromptFromFlags,
// which supports --prompt / --prompt-file / stdin. `od media generate` was the
// only prompt-taking action reading `flags.prompt` directly, so a long-form
// prompt could not be supplied from a file or a heredoc. This pins the fill.
//
// Live end-to-end: spawn the real src/cli.ts against a fake daemon that records
// the POST body, and assert the prompt reached the media/generate endpoint.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

let server: http.Server | undefined;
let baseUrl = '';
let seen: Array<{ url: string; body: string }> = [];
let tmp = '';

beforeEach(async () => {
  seen = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', body });
      if (req.method === 'POST' && (req.url ?? '').includes('/media/generate')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ taskId: 'task-1', status: 'queued' }));
        return;
      }
      if ((req.url ?? '').includes('/media/tasks/')) {
        // Immediately resolve the poll so the CLI exits cleanly.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'done', file: { name: 'out.png', size: 3 } }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-media-pf-'));
});

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
});

const LONG_PROMPT =
  'A sweeping cinematic vista of a neon city at dusk, rain-slicked streets,\n' +
  'volumetric fog, 85mm, shallow depth of field — line two of a long prompt.';

async function runCli(args: string[], input?: string): Promise<void> {
  const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', cliEntry, ...args], {
      cwd: daemonRoot,
      env: { ...process.env, OD_PROJECT_ID: 'p1' },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ code: exitCode ?? -1, stderr }));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
  // The fake daemon resolves both /media/generate and the /media/tasks poll, so
  // the CLI must run the whole flow to a clean exit. Assert exit 0 (surfacing
  // stderr) so a non-zero exit AFTER the POST — a failure during polling or
  // result handling — fails the spec instead of passing on the recorded request
  // alone.
  expect(code, `od media generate exited ${code}; stderr:\n${stderr}`).toBe(0);
}

describe('od media generate --prompt-file', () => {
  it('reads a long-form prompt from a file and posts it to media/generate', async () => {
    const promptFile = path.join(tmp, 'prompt.txt');
    await writeFile(promptFile, LONG_PROMPT, 'utf8');

    await runCli([
      'media', 'generate',
      '--surface', 'image',
      '--model', 'test-model',
      '--prompt-file', promptFile,
      '--daemon-url', baseUrl,
    ]);

    const gen = seen.find((r) => r.url.includes('/media/generate'));
    expect(gen, 'media/generate was called').toBeTruthy();
    const sent = JSON.parse(gen!.body);
    expect(sent.prompt).toBe(LONG_PROMPT);
  });

  it('reads the prompt from stdin when --prompt-file is -', async () => {
    await runCli(
      [
        'media', 'generate',
        '--surface', 'image',
        '--model', 'test-model',
        '--prompt-file', '-',
        '--daemon-url', baseUrl,
      ],
      LONG_PROMPT,
    );

    const gen = seen.find((r) => r.url.includes('/media/generate'));
    expect(gen, 'media/generate was called').toBeTruthy();
    expect(JSON.parse(gen!.body).prompt).toBe(LONG_PROMPT);
  });
});
