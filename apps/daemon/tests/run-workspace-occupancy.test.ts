import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer, __forTestLaunchProjectMetadata } from '../src/server.js';

/**
 * Red spec for the workspace collision: two automation-driven
 * Runs on the same folder-backed project were
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

/**
 * Attempt 1 stays silent so the first-output watchdog re-enters startChatRun
 * for a same-run retry; every attempt records its cwd. With
 * OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS set in the test, attempt 2's recorded
 * cwd shows whether the launch resolved the working directory from the run's
 * admission snapshot (expected) or re-read the rebound project row.
 */
const REBIND_RETRY_OPENCODE = `
if (process.argv.includes('--version')) { console.log('opencode 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('test/model'); process.exit(0); }
const fs = require('node:fs');
const ATTEMPTS = ${'__ATTEMPTS_FILE__'};
fs.appendFileSync(ATTEMPTS, process.cwd() + '\\n');
let attempts = 1;
try { attempts = fs.readFileSync(ATTEMPTS, 'utf8').trim().split('\\n').length; } catch {}
if (attempts === 1) {
  setTimeout(() => process.exit(0), 30000);
} else {
  console.log(JSON.stringify({ type: 'step_start', sessionID: 'workspace-guard-retry-session' }));
  console.log(JSON.stringify({ type: 'text', sessionID: 'workspace-guard-retry-session', part: { text: 'working' } }));
  setTimeout(() => {
    console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
    process.exit(0);
  }, 2500);
}
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

async function waitFor(
  what: string,
  read: () => Promise<number>,
  expected: number,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await read().catch(() => 0)) >= expected) return;
    await delay(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function readAttemptCwds(path: string): Promise<string[]> {
  const raw = await fsp.readFile(path, 'utf8');
  return raw.trim().length ? raw.trim().split('\n') : [];
}

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

  it("derives a live run's workspace from its captured metadata, not a rebound project row", async () => {
    const originalDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-rebind-a-'));
    const reboundDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-rebind-b-'));
    const { projectId, conversationId } = await importFolderProject('Rebind source', originalDir);
    await withFakeAgent('opencode', FAKE_SLOW_OPENCODE, async () => {
      const first = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId,
        message: 'writer on the original folder',
      });
      expect(first.status).toBe(202);
      const firstBody = await first.json() as { runId: string };

      // The working-dir route rebinds the row while the run is live; the run
      // keeps writing the directory resolved at its start.
      const rebind = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/working-dir`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseDir: reboundDir }),
        },
      );
      const rebindRaw = await rebind.text();
      expect(rebind.status, rebindRaw).toBe(200);

      // A second project importing the ORIGINAL folder must still see the
      // live run as the owner of that directory.
      const second = await importFolderProject('Rebind collision', originalDir);
      const secondRun = await postRun('/api/runs', {
        agentId: 'opencode',
        projectId: second.projectId,
        conversationId: second.conversationId,
        message: 'second writer on the abandoned folder',
      });
      const secondBody = await secondRun.json() as {
        error?: { code?: string; details?: { runId?: string } };
      };
      expect(secondRun.status, JSON.stringify(secondBody)).toBe(409);
      expect(secondBody.error?.code).toBe('WORKSPACE_RUN_ACTIVE');
      expect(secondBody.error?.details?.runId).toBe(firstBody.runId);
      await waitForQuiescence(conversationId);
      await waitForQuiescence(second.conversationId);
    });
  });

  it('launches a retried run from its admission snapshot, not a rebound project row', async () => {
    const originalFirstOutputTimeout = process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS;
    const originalDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-launch-a-'));
    const reboundDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-launch-b-'));
    const attemptsDir = await fsp.mkdtemp(join(tmpdir(), 'od-workspace-guard-attempts-'));
    const attemptsFile = join(attemptsDir, 'attempts.log');
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '1500';
    try {
      const { projectId, conversationId } = await importFolderProject('Launch snapshot', originalDir);
      await withFakeAgent(
        'opencode',
        REBIND_RETRY_OPENCODE.replace('__ATTEMPTS_FILE__', JSON.stringify(attemptsFile)),
        async () => {
          const first = await postRun('/api/runs', {
            agentId: 'opencode',
            projectId,
            message: 'launch snapshot writer',
          });
          expect(first.status).toBe(202);
          const firstBody = await first.json() as { runId: string };

          await waitFor('attempt 1 to spawn', () => readAttemptCwds(attemptsFile).then((l) => l.length), 1);

          // Rebind while attempt 1 is live: the run keeps writing the folder
          // it was admitted for, and the same-run retry must re-launch from
          // the admission snapshot rather than the rebound row.
          const rebind = await fetch(
            `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/working-dir`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ baseDir: reboundDir }),
            },
          );
          const rebindRaw = await rebind.text();
          expect(rebind.status, rebindRaw).toBe(200);

          await waitFor('the watchdog retry to spawn', () => readAttemptCwds(attemptsFile).then((l) => l.length), 2);
          const realOriginalDir = await fsp.realpath(originalDir);
          const attemptCwds = (await readAttemptCwds(attemptsFile)).map((dir) => dir.replace(/\/+$/, ''));
          expect(attemptCwds[1], `attempt 2 ran in ${attemptCwds[1]}`).toBe(realOriginalDir);

          // The folder the run actually writes stays guarded after the rebind.
          const second = await importFolderProject('Launch snapshot collision', originalDir);
          const secondRun = await postRun('/api/runs', {
            agentId: 'opencode',
            projectId: second.projectId,
            conversationId: second.conversationId,
            message: 'second writer on the written folder',
          });
          const secondBody = await secondRun.json() as {
            error?: { code?: string; details?: { runId?: string } };
          };
          expect(secondRun.status, JSON.stringify(secondBody)).toBe(409);
          expect(secondBody.error?.code).toBe('WORKSPACE_RUN_ACTIVE');
          expect(secondBody.error?.details?.runId).toBe(firstBody.runId);
          await waitForQuiescence(conversationId);
          await waitForQuiescence(second.conversationId);
        },
      );
    } finally {
      if (originalFirstOutputTimeout === undefined) delete process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS;
      else process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = originalFirstOutputTimeout;
      await fsp.rm(attemptsDir, { recursive: true, force: true });
    }
  });
});

describe('launch project metadata decision', () => {
  it('resolves the cwd basis from the admission snapshot; the row is fallback only', () => {
    // The workspace-occupancy guard attributes a run to the folder in its
    // admission snapshot; the launch cwd must come from the same snapshot,
    // or a working-dir rebind between admission and launch moves the child
    // into a directory the guard does not record for this run.
    const reboundRow = () => ({ baseDir: '/row-rebound' });
    expect(
      __forTestLaunchProjectMetadata({ projectMetadata: { baseDir: '/admitted' } }, reboundRow),
    ).toEqual({ baseDir: '/admitted' });
    expect(__forTestLaunchProjectMetadata({ projectMetadata: null }, reboundRow))
      .toEqual({ baseDir: '/row-rebound' });
    expect(__forTestLaunchProjectMetadata({}, reboundRow))
      .toEqual({ baseDir: '/row-rebound' });
    expect(__forTestLaunchProjectMetadata({}, () => null)).toBeNull();
    // A snapshot without a baseDir (od-owned at admission) stays od-owned
    // even if the row gained a folder since — the run writes OD storage.
    expect(__forTestLaunchProjectMetadata({ projectMetadata: {} }, reboundRow)).toEqual({});
  });
});
