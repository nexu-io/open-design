import type http from 'node:http';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('/api/chat', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalPath = process.env.PATH;
  const originalAgentHome = process.env.OD_AGENT_HOME;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    if (originalPath == null) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalAgentHome == null) {
      delete process.env.OD_AGENT_HOME;
    } else {
      process.env.OD_AGENT_HOME = originalAgentHome;
    }
  });

  afterAll(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (!server) return;
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('does not reference an out-of-scope response while starting a run', async () => {
    process.env.PATH = '';
    const emptyAgentHome = mkdtempSync(join(tmpdir(), 'od-empty-agent-home-'));
    tempDirs.push(emptyAgentHome);
    process.env.OD_AGENT_HOME = emptyAgentHome;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        message: 'hello',
      }),
    });
    const body = await response.text();

    expect(response.ok).toBe(true);
    expect(body).not.toContain('res is not defined');
    expect(body).toContain('AGENT_UNAVAILABLE');
  });

  it('surfaces Qoder assistant error records through the SSE error channel', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'od-qoder-bin-'));
    tempDirs.push(binDir);
    const qoderBin = join(binDir, 'qodercli');
    const qoderErrorLine = JSON.stringify({
      type: 'assistant',
      message: { content: [] },
      error: { message: 'Qoder authentication expired' },
    });
    writeFileSync(
      qoderBin,
      `#!/bin/sh\nprintf '%s\\n' '${qoderErrorLine}'\nexit 0\n`,
      'utf8',
    );
    chmodSync(qoderBin, 0o755);
    process.env.PATH = binDir;

    const createResponse = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'qoder',
        message: 'hello',
      }),
    });
    expect(createResponse.status).toBe(202);
    const { runId } = await createResponse.json() as { runId: string };

    const eventsController = new AbortController();
    const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
      signal: eventsController.signal,
    });
    const eventsBody = await readSseUntil(eventsResponse, 'event: error');
    eventsController.abort();
    const statusBody = await waitForRunStatus(baseUrl, runId);

    expect(eventsBody).toContain('event: error');
    expect(eventsBody).toContain('Qoder authentication expired');
    expect(eventsBody).not.toContain('event: agent\\ndata: {"type":"error"');
    expect(statusBody.status).toBe('failed');
  });
});

async function readSseUntil(response: Response, marker: string): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { done, value } = await reader.read();
    if (done) return body;
    body += decoder.decode(value, { stream: true });
    if (body.includes(marker)) return body;
  }
  return body;
}

async function waitForRunStatus(baseUrl: string, runId: string): Promise<{ status: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const statusResponse = await fetch(`${baseUrl}/api/runs/${runId}`);
    const statusBody = await statusResponse.json() as { status: string };
    if (statusBody.status !== 'queued' && statusBody.status !== 'running') return statusBody;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('run did not finish');
}
