import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

/**
 * Red spec for the 2026-07-28 double-enrichment incident: one "AI Optimize"
 * affordance fired twice 383 ms apart and the daemon created TWO concurrent
 * design-system enrichment runs in the same conversation, both billed.
 * The daemon must admit at most one active enrichment run per conversation
 * while leaving ordinary chat turns untouched.
 */

const FAKE_SLOW_OPENCODE = `
if (process.argv.includes('--version')) { console.log('opencode 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('test/model'); process.exit(0); }
console.log(JSON.stringify({ type: 'step_start', sessionID: 'dedupe-session' }));
console.log(JSON.stringify({ type: 'text', sessionID: 'dedupe-session', part: { text: 'working' } }));
setTimeout(() => {
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
}, 2500);
`;

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-enrich-dedupe-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, `${binName}.cmd`), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    killProcessesUsingPath(dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function killProcessesUsingPath(pathFragment: string): void {
  if (process.platform === 'win32') return;
  let output = '';
  try {
    output = execFileSync('pgrep', ['-f', pathFragment], { encoding: 'utf8' });
  } catch {
    return;
  }
  for (const line of output.split('\n')) {
    const pid = Number(line.trim());
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('design-system enrichment run dedupe', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalPath = process.env.PATH;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    if (originalPath == null) delete process.env.PATH;
    else process.env.PATH = originalPath;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(name: string): Promise<{ projectId: string; conversationId: string }> {
    const projectId = `project_${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name, metadata: { kind: 'prototype' } }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { conversationId: string };
    return { projectId, conversationId: body.conversationId };
  }

  function postRun(
    endpoint: '/api/runs' | '/api/chat',
    body: Record<string, unknown>,
  ): Promise<Response> {
    return fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function listRuns(conversationId: string): Promise<Array<{ id: string; status: string }>> {
    const response = await fetch(
      `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { runs: Array<{ id: string; status: string }> };
    return body.runs;
  }

  async function waitForQuiescence(conversationId: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const runs = await listRuns(conversationId);
      if (runs.every((run) => ['succeeded', 'failed', 'canceled'].includes(run.status))) return;
      await delay(100);
    }
  }

  it('admits only one active enrichment run per conversation (second request is a 409, not a second billed run)', async () => {
    const { projectId, conversationId } = await createProject('Enrichment dedupe');
    await withFakeAgent('opencode', FAKE_SLOW_OPENCODE, async () => {
      const enrichment = {
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'Refine the design system',
        analyticsHints: { dsEnrichment: true },
      };
      const first = await postRun('/api/runs', enrichment);
      expect(first.status).toBe(202);
      const firstBody = await first.json() as { runId: string };

      // Incident shape: the same affordance fires again 383 ms later.
      await delay(300);
      const second = await postRun('/api/runs', enrichment);
      const secondBody = await second.json() as {
        runId?: string;
        error?: { code?: string; details?: { runId?: string } };
      };
      expect(second.status, JSON.stringify(secondBody)).toBe(409);
      expect(secondBody.error?.code).toBe('DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS');
      expect(secondBody.error?.details?.runId).toBe(firstBody.runId);

      // The streaming entry point shares the invariant.
      const streamed = await postRun('/api/chat', enrichment);
      const streamedBody = await streamed.json() as { error?: { code?: string } };
      expect(streamed.status, JSON.stringify(streamedBody)).toBe(409);
      expect(streamedBody.error?.code).toBe('DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS');

      const runs = await listRuns(conversationId);
      expect(runs.map((run) => run.id)).toEqual([firstBody.runId]);
      await waitForQuiescence(conversationId);
    });
  });

  it('leaves ordinary chat turns ungated (the composer queues those itself)', async () => {
    const { projectId, conversationId } = await createProject('Enrichment dedupe control');
    await withFakeAgent('opencode', FAKE_SLOW_OPENCODE, async () => {
      const first = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'first turn',
      });
      expect(first.status).toBe(202);
      await delay(300);
      const second = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'second turn',
      });
      expect(second.status).toBe(202);
      expect((await listRuns(conversationId)).length).toBe(2);
      await waitForQuiescence(conversationId);
    });
  });
});
