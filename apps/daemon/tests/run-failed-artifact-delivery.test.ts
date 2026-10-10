import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import { startServer } from '../src/server.js';

const ARTIFACT = 'wallpaper-capybara.png';
let baseUrl: string;
let server: http.Server;

interface StoredMessage {
  id: string;
  content: string;
  runId: string;
  runStatus: string;
  producedFiles?: Array<{ name: string; kind: string; mime: string; size: number }>;
  artifactRefs?: Array<{ fileName: string; snapshotStatus: string }>;
}

async function runTurn(options: {
  prose?: boolean;
  writesArtifact?: boolean;
  exitCode?: number;
  streamError?: boolean;
  existingArtifact?: boolean;
  plainStream?: boolean;
  emptyArtifact?: boolean;
} = {}) {
  const projectId = `proj-${randomUUID()}`;
  const assistantMessageId = `assistant-${randomUUID()}`;
  const created = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Artifact delivery regression' }),
  });
  expect(created.ok).toBe(true);
  const detail = await fetch(`${baseUrl}/api/projects/${projectId}`);
  const { resolvedDir } = await detail.json() as { resolvedDir: string };
  const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
  const { conversations: [{ id: conversationId }] } = await conversations.json() as {
    conversations: [{ id: string }];
  };
  if (options.existingArtifact) {
    await fs.mkdir(resolvedDir, { recursive: true });
    await fs.writeFile(join(resolvedDir, ARTIFACT), 'existing image');
  }

  // Drive the actual child-close, filesystem diff, terminal SSE and message
  // persistence path. There is no browser PUT to repair the association.
  const script = `
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--version')) { console.log('1.0.0'); process.exit(0); }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
if (${options.writesArtifact !== false}) fs.writeFileSync(path.join(process.cwd(), '${ARTIFACT}'), ${options.emptyArtifact ? 'Buffer.alloc(0)' : 'png'});
if (${!options.plainStream}) console.log(JSON.stringify({ type: 'step_start' }));
if (${options.prose === true}) console.log(JSON.stringify({ type: 'text', part: { text: 'Image generated.' } }));
if (${options.streamError === true}) console.log(JSON.stringify({ type: 'error', error: { message: 'model not found: test-model' } }));
if (${!options.plainStream}) console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
process.exit(${options.exitCode ?? 0});
`;
  const binDir = await fs.mkdtemp(join(tmpdir(), 'od-artifact-delivery-bin-'));
  const oldPath = process.env.PATH;
  let body: string;
  const agentId = options.plainStream ? 'deepseek' : 'opencode';
  try {
    if (process.platform === 'win32') {
      const runner = join(binDir, `${agentId}-runner.cjs`);
      await fs.writeFile(runner, script);
      await fs.writeFile(join(binDir, `${agentId}.cmd`), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(binDir, agentId);
      await fs.writeFile(bin, `#!/usr/bin/env node\n${script}`, { mode: 0o755 });
    }
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ''}`;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, projectId, conversationId,
        assistantMessageId, message: 'Generate an image.' }),
    });
    expect(response.ok).toBe(true);
    body = await response.text();
  } finally {
    process.env.PATH = oldPath;
    await fs.rm(binDir, { recursive: true, force: true });
  }

  // Reading after the terminal frame must already carry the durable files.
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages`);
  const { messages } = await response.json() as { messages: StoredMessage[] };
  const message = messages.find((entry) => entry.id === assistantMessageId)!;
  expect(message).toBeTruthy();
  const statusResponse = await fetch(`${baseUrl}/api/runs/${message.runId}`);
  const status = await statusResponse.json() as ChatRunStatusResponse;
  return { message, status, body };
}

describe('artifact delivery is independent of a run failure (#8596)', () => {
  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string; server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((done) => server.close(() => done()));
  });

  it.each([false, true])('accepts an artifact-only clean exit (existing artifact: %s)', async (existingArtifact) => {
    const { message, status, body } = await runTurn({ existingArtifact });
    expect(status.artifactPaths).toEqual([ARTIFACT]);
    expect(status.artifactCount).toBe(1);
    expect(status.status).toBe('succeeded');
    expect(message.runStatus).toBe('succeeded');
    expect(message.content).toBe('');
    expect(message.producedFiles).toEqual([expect.objectContaining({
      name: ARTIFACT, kind: 'image', mime: 'image/png', size: expect.any(Number),
    })]);
    expect(body).not.toContain('"failureCategory":"empty_output"');
  });

  it.each([
    { exitCode: 1, prose: true, streamError: false, label: 'nonzero process exit' },
    { exitCode: 0, prose: false, streamError: true, label: 'explicit stream error with exit zero' },
  ])('keeps the artifact and the failure for a $label', async (options) => {
    const { message, status } = await runTurn(options);
    expect(status.status).toBe('failed');
    expect(message.runStatus).toBe('failed');
    expect(status.artifactPaths).toEqual([ARTIFACT]);
    expect(status.artifactCount).toBe(1);
    expect(message.producedFiles?.map((file) => file.name)).toEqual([ARTIFACT]);
    expect(status.failureCategory).not.toBe('empty_output');
  });

  it('accepts a plain-stream artifact-only clean exit', async () => {
    const { message, status } = await runTurn({ plainStream: true });
    expect(status.status).toBe('succeeded');
    expect(message.content).toBe('');
    expect(message.producedFiles?.map((file) => file.name)).toEqual([ARTIFACT]);
  });

  it('does not treat an empty artifact placeholder as output', async () => {
    const { status } = await runTurn({ emptyArtifact: true });
    expect(status.status).toBe('failed');
    expect(status.failureCategory).toBe('empty_output');
  });

  it.each([false, true])('still fails an empty run without any artifact writes (existing file: %s)', async (existingArtifact) => {
    const { message, status } = await runTurn({ writesArtifact: false, existingArtifact });
    expect(status.status).toBe('failed');
    expect(status.failureCategory).toBe('empty_output');
    expect(status.artifactCount).toBe(0);
    expect(status.artifactPaths).toEqual([]);
    expect(message.producedFiles ?? []).toEqual([]);
  });
});
