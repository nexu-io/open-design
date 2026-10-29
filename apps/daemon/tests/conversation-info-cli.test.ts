// #6116: `od conversation info` fetched an unscoped /api/conversations/:cid the
// daemon never served, so it 404'd for every conversation, and the CLI reported
// that 404 as `daemon-not-running` although the daemon had answered.

import { execFile } from 'node:child_process';
import type http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

const execFileP = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

type StartedServer = { url: string; server: http.Server; shutdown?: () => Promise<void> | void };

let started: StartedServer;

beforeAll(async () => {
  started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
});

afterAll(async () => {
  await Promise.resolve(started?.shutdown?.());
  await new Promise<void>((resolve) => started.server.close(() => resolve()));
});

async function createProject(name: string): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `conv_info_${randomUUID()}`;
  const response = await fetch(`${started.url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: projectId, name, metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [tsxCli, cliEntry, ...args, '--daemon-url', started.url],
      { cwd: daemonRoot, env: { ...process.env, NODE_OPTIONS: '' }, timeout: 30_000 },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('GET /api/projects/:id/conversations/:cid', () => {
  it('returns a conversation the project owns', async () => {
    const { projectId, conversationId } = await createProject('Conversation info owner');
    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      conversation: { id: conversationId, projectId },
    });
  });

  it('does not return a conversation another project owns', async () => {
    const owner = await createProject('Conversation info owner');
    const other = await createProject('Conversation info other');
    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(other.projectId)}/conversations/${encodeURIComponent(owner.conversationId)}`,
    );
    expect(response.status).toBe(404);
  });

  it('404s for a conversation that does not exist', async () => {
    const { projectId } = await createProject('Conversation info missing');
    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations/missing-${randomUUID()}`,
    );
    expect(response.status).toBe(404);
  });
});

describe('od conversation info', () => {
  it('prints the conversation through its project', async () => {
    const { projectId, conversationId } = await createProject('CLI conversation info');
    const result = await runCli(['conversation', 'info', conversationId, '--project', projectId, '--json']);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      conversation: { id: conversationId, projectId },
    });
  });

  it('reports a missing conversation as not-found, not daemon-not-running', async () => {
    const { projectId } = await createProject('CLI conversation info missing');
    const result = await runCli([
      'conversation', 'info', `missing-${randomUUID()}`, '--project', projectId, '--json',
    ]);
    expect(result.code).not.toBe(0);
    // 64 is the daemon-not-running exit code; the daemon answered here.
    expect(result.code).not.toBe(64);
    const envelope = JSON.parse(result.stderr.trim().split('\n').at(-1) ?? '{}') as {
      error?: { code?: string };
    };
    expect(envelope.error?.code).toBe('not-found');
  });

  it('requires --project', async () => {
    const result = await runCli(['conversation', 'info', `conv-${randomUUID()}`, '--json']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--project');
  });
});
