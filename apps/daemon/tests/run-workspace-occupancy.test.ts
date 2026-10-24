import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

/**
 * Red spec for the 2026-10-22/23 workspace collision: two automation-driven
 * Runs on the same folder-backed project (`7a52655f` and `1e08cc94`) were
 * admitted 34 ms apart and both wrote the same directory. The daemon must
 * refuse a Run whose external workspace (folder-backed `baseDir`) is already
 * owned by a live run — naming the owner in the 409 details — while leaving
 * od-owned projects and cancel-in-flight supersessions untouched.
 *
 * Since main's conversation-level guard landed, a same-conversation second
 * turn is already refused as `RUN_IN_PROGRESS` before the workspace guard is
 * consulted, so the workspace cases here exercise the still-uncovered surface:
 * a second writer arriving through a different conversation of the same
 * workspace (how automation entries actually collide).
 */

const FAKE_SLOW_OPENCODE = `
if (process.argv.includes('--version')) { console.log('opencode 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('test/model'); process.exit(0); }
console.log(JSON.stringify({ type: 'step_start', sessionID: 'workspace-guard-session' }));
console.log(JSON.stringify({ type: 'text', sessionID: 'workspace-guard-session', part: { text: 'working' } }));
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
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-bin-'));
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

describe('workspace run occupancy guard', () => {
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

  async function importFolderProject(
    name: string,
    baseDir: string,
  ): Promise<{ projectId: string; conversationId: string }> {
    await fsp.mkdir(baseDir, { recursive: true });
    const response = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir, name }),
    });
    // Read the body exactly once: a `.text()` inside the expect message would
    // consume it and make the `.json()` below throw "Body is unusable".
    const raw = await response.text();
    expect(response.status, raw).toBe(200);
    const body = JSON.parse(raw) as { project: { id: string }; conversationId: string };
    return { projectId: body.project.id, conversationId: body.conversationId };
  }

  async function createConversation(projectId: string): Promise<string> {
    const response = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/conversations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    const raw = await response.text();
    expect(response.status, raw).toBe(200);
    const body = JSON.parse(raw) as { conversation: { id: string } };
    return body.conversation.id;
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

  it('refuses a second live run on one folder-backed workspace (409 naming the owner)', async () => {
    const baseDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-collision-'));
    const { projectId, conversationId } = await importFolderProject('Workspace guard', baseDir);
    await withFakeAgent('opencode', FAKE_SLOW_OPENCODE, async () => {
      const first = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'first writer',
      });
      expect(first.status).toBe(202);
      const firstBody = await first.json() as { runId: string };

      // Main's conversation-level guard refuses a same-conversation second
      // turn (RUN_IN_PROGRESS) before the workspace guard is consulted.
      await delay(300);
      const sameConversation = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'same-conversation second writer',
      });
      const sameConversationBody = await sameConversation.json() as {
        error?: { code?: string };
      };
      expect(sameConversation.status, JSON.stringify(sameConversationBody)).toBe(409);
      expect(sameConversationBody.error?.code).toBe('RUN_IN_PROGRESS');

      // Incident shape: the second writer reaches the same workspace through
      // a different conversation (automation entries mint their own) while
      // the first is still live.
      const secondConversation = await createConversation(projectId);
      const second = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId: secondConversation,
        message: 'second writer',
      });
      const secondBody = await second.json() as {
        runId?: string;
        error?: { code?: string; message?: string; details?: { runId?: string; workspace?: string; kind?: string } };
      };
      expect(second.status, JSON.stringify(secondBody)).toBe(409);
      expect(secondBody.error?.code).toBe('WORKSPACE_RUN_ACTIVE');
      expect(secondBody.error?.details?.kind).toBe('workspace_run_active');
      expect(secondBody.error?.details?.runId).toBe(firstBody.runId);
      expect(secondBody.error?.message).toContain(firstBody.runId);
      expect(secondBody.error?.details?.workspace).toBe(`folder:${baseDir.replace(/\/+$/, '')}`);

      // The streaming entry point shares the invariant.
      const thirdConversation = await createConversation(projectId);
      const streamed = await postRun('/api/chat', {
        agentId: 'opencode',
        projectId,
        conversationId: thirdConversation,
        message: 'third writer',
      });
      const streamedBody = await streamed.json() as {
        error?: { code?: string; details?: { runId?: string } };
      };
      expect(streamed.status, JSON.stringify(streamedBody)).toBe(409);
      expect(streamedBody.error?.code).toBe('WORKSPACE_RUN_ACTIVE');
      expect(streamedBody.error?.details?.runId).toBe(firstBody.runId);

      // Exactly one run was ever admitted for the workspace.
      const runs = [
        ...(await listRuns(conversationId)),
        ...(await listRuns(secondConversation)),
        ...(await listRuns(thirdConversation)),
      ];
      expect(runs.map((run) => run.id)).toEqual([firstBody.runId]);
      await waitForQuiescence(conversationId);
    });
  });

  it('treats two project rows importing the same folder as one workspace', async () => {
    const baseDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-shared-'));
    const firstProject = await importFolderProject('Shared folder A', baseDir);
    const secondProject = await importFolderProject('Shared folder B', baseDir);
    expect(secondProject.projectId).not.toBe(firstProject.projectId);
    await withFakeAgent('opencode', FAKE_SLOW_OPENCODE, async () => {
      const first = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId: firstProject.projectId,
        conversationId: firstProject.conversationId,
        message: 'writer via project A',
      });
      expect(first.status).toBe(202);
      await delay(300);
      const second = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId: secondProject.projectId,
        conversationId: secondProject.conversationId,
        message: 'writer via project B',
      });
      const secondBody = await second.json() as {
        error?: { code?: string; details?: { runId?: string } };
      };
      expect(second.status, JSON.stringify(secondBody)).toBe(409);
      expect(secondBody.error?.code).toBe('WORKSPACE_RUN_ACTIVE');
      expect(secondBody.error?.details?.runId)
        .toBe((await first.json() as { runId: string }).runId);
      await waitForQuiescence(firstProject.conversationId);
      await waitForQuiescence(secondProject.conversationId);
    });
  });

  it('does not gate runs whose workspace cannot be identified (od-owned project)', async () => {
    const projectId = `project_${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Workspace guard od-owned', metadata: { kind: 'prototype' } }),
    });
    expect(created.status).toBe(200);
    const { conversationId } = await created.json() as { conversationId: string };
    await withFakeAgent('opencode', FAKE_SLOW_OPENCODE, async () => {
      const first = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'od-owned turn one',
      });
      expect(first.status).toBe(202);
      await delay(300);
      // A second conversation on the same od-owned project: ordinary
      // concurrent turns are documented, tested behavior for od-owned
      // storage, and the workspace guard must not gate them either.
      const secondConversation = await createConversation(projectId);
      const second = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        conversationId: secondConversation,
        message: 'od-owned turn two',
      });
      expect(second.status).toBe(202);
      expect((await listRuns(conversationId)).length).toBe(1);
      expect((await listRuns(secondConversation)).length).toBe(1);
      await waitForQuiescence(conversationId);
      await waitForQuiescence(secondConversation);
    });
  });
});
