// @vitest-environment node

// 2026-09-14 incident, at the daemon HTTP boundary.
//
// The daemon spawned cursor-agent (`--print --force`: file edits auto-approved)
// for a new run and died of a V8 out-of-memory abort two seconds later. The
// agent led its own process group, so it survived; only the first 64 KiB of
// its prompt had reached the kernel pipe, and the transcript-first prompt was
// cut right after the conversation's FIRST request, which the orphan then
// re-executed against the project.
//
// The chosen design: an agent may outlive an abruptly dead daemon until the
// next daemon start, which terminates it. This spec replays the incident
// through the production HTTP API. A real cursor-agent run starts a fake CLI (a
// CommonJS script behind a `cursor-agent` shim placed FIRST on PATH; the spec
// checks the daemon resolved exactly that shim before it starts the run, so a
// real agent CLI is never launched). The daemon is SIGABRTed right after the
// spawn, before the agent reads its stdin, and then:
//   (a) the agent reads the COMPLETE prompt: the whole user message, whose
//       last line is the latest request, not a 64 KiB prefix;
//   (b) the agent is still running after its daemon died;
//   (c) a daemon restarted on the same data root terminates the leftover's
//       whole process group within seconds;
//   (d) the interrupted run reads back as failed, never succeeded.

import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentsResponse } from '@open-design/contracts';
import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { listMessages, saveMessage } from '@/vitest/messages';
import { readRun, startRun } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectResponse = {
  conversationId: string;
  project: { id: string };
};

type AgentMarker = { pid: number; grandchildPid: number; script: string; argv: string[] };
type StdinResult = { bytes: number; stdinIsFile: boolean };

/**
 * The fake cursor-agent. Its run invocation ignores SIGTERM (as does the
 * grandchild it starts in its process group), so only a group SIGKILL ends it.
 * It reads its stdin only once the spec says so — after the daemon is dead —
 * and never writes to stdout/stderr again: their reader is that daemon.
 */
function fakeCursorAgentSource(paths: { marker: string; go: string; result: string; body: string }): string {
  return `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('2026.09.14-fake'); process.exit(0); }
if (args[0] === '--help') { console.log('Usage: cursor-agent [options] --print --output-format <format>'); process.exit(0); }
if (args[0] === 'status') { console.log('Logged in as fake@example.test'); process.exit(0); }
if (args[0] === 'models') { console.log('auto - Auto'); process.exit(0); }
if (!args.includes('--print')) process.exit(0);
process.on('SIGTERM', () => {});
const grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' });
fs.writeFileSync(${JSON.stringify(paths.marker)}, JSON.stringify({
  pid: process.pid, grandchildPid: grandchild.pid, script: __filename, argv: args,
}));
const poll = setInterval(() => {
  if (!fs.existsSync(${JSON.stringify(paths.go)})) return;
  clearInterval(poll);
  let stdinIsFile = false;
  try { stdinIsFile = fs.fstatSync(0).isFile(); } catch {}
  let body = Buffer.alloc(0);
  try { body = fs.readFileSync(0); } catch {}
  fs.writeFileSync(${JSON.stringify(paths.body)}, body);
  fs.writeFileSync(${JSON.stringify(paths.result)}, JSON.stringify({ bytes: body.length, stdinIsFile }));
}, 50);
setInterval(() => {}, 1000);
`;
}

function alive(pid: number | undefined): boolean {
  if (typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function leftoverProcesses(marker: AgentMarker): string[] {
  return [
    ...(alive(marker.pid) ? [`agent ${marker.pid}`] : []),
    ...(alive(marker.grandchildPid) ? [`grandchild ${marker.grandchildPid}`] : []),
    ...(alive(-marker.pid) ? [`group ${marker.pid}`] : []),
  ];
}

async function waitFor<T>(probe: () => Promise<T | null> | T | null, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

describe.skipIf(process.platform === 'win32')('leftover agent after a daemon abort', () => {
  test('the agent only ever sees the complete prompt, and the next daemon start reaps it', async () => {
    // Canonical path: the fake reports its own `__filename`, which Node resolves.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'od-leftover-agent-reap-e2e-')));
    const sharedDataDir = join(root, 'daemon-data');
    const fakeBinDir = join(root, 'bin');
    await mkdir(fakeBinDir, { recursive: true });
    const paths = {
      body: join(root, 'stdin-body.txt'),
      go: join(root, 'read-stdin-now'),
      marker: join(root, 'marker.json'),
      result: join(root, 'stdin-result.json'),
    };
    const script = join(root, 'fake-cursor-agent.cjs');
    await writeFile(script, fakeCursorAgentSource(paths), 'utf8');
    const bin = join(fakeBinDir, 'cursor-agent');
    await writeFile(bin, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`, 'utf8');
    await chmod(bin, 0o755);

    // A long request whose LAST line is the sentinel: a prompt cut at the
    // 64 KiB pipe buffer cannot contain it.
    const sentinel = `LATEST-REQUEST-SENTINEL-${randomUUID()}`;
    const filler = Array.from({ length: 4_000 }, (_, index) =>
      `context line ${String(index).padStart(5, '0')}: earlier discussion that must not be replayed`).join('\n');
    const message = `${filler}\n${sentinel}`;

    const spawned: { marker: AgentMarker | null } = { marker: null };
    let runId = '';
    let projectId = '';
    let conversationId = '';
    let assistantMessageId = '';
    const observed: {
      stdin: { bytes: number; wholeMessage: boolean; stdinIsFile: boolean } | null;
      runningAfterDaemonDied: string[];
      runningAtRestart: string[];
      runningAfterRestart: string[];
      run: { status: string; errorCode: string | null; messageRunStatus: string | null } | null;
    } = { stdin: null, runningAfterDaemonDied: [], runningAtRestart: [], runningAfterRestart: [], run: null };

    try {
      const first = await createSmokeSuite('leftover-agent-reap-first', { dataDir: sharedDataDir });
      await first.with.pathEntry(fakeBinDir, () => first.with.toolsDev(async ({ start, status }) => {
        const daemonUrl = start.daemon?.status.url;
        const daemonPid = status.apps?.daemon?.pid;
        expect(daemonUrl).toMatch(/^http:\/\//);
        expect(daemonPid).toBeTypeOf('number');

        await requestJson(daemonUrl!, '/api/app-config', {
          body: {
            agentId: 'cursor-agent',
            agentModels: { 'cursor-agent': { model: 'default', reasoning: 'default' } },
            designSystemId: null,
            onboardingCompleted: true,
            skillId: null,
            telemetry: { artifactManifest: false, content: false, metrics: false },
          },
          method: 'PUT',
        });
        // Precondition: the daemon resolves cursor-agent to the fake, never to
        // a real CLI installed on this machine.
        const agents = await requestJson<AgentsResponse>(daemonUrl!, '/api/agents');
        const cursorAgent = agents.agents.find((agent) => agent.id === 'cursor-agent');
        expect(cursorAgent?.available, 'the fake cursor-agent is detected').toBe(true);
        expect(realpathSync(cursorAgent?.path ?? '/nonexistent-cursor-agent'), 'resolved cursor-agent binary')
          .toBe(bin);

        const project = await requestJson<ProjectResponse>(daemonUrl!, '/api/projects', {
          body: {
            designSystemId: null,
            id: randomUUID(),
            metadata: { kind: 'prototype' },
            name: 'Leftover agent reap',
            pendingPrompt: null,
            skillId: null,
          },
        });
        projectId = project.project.id;
        conversationId = project.conversationId;
        const startedAt = Date.now();
        const userMessageId = `user-leftover-${startedAt}`;
        assistantMessageId = `assistant-leftover-${startedAt}`;
        await saveMessage(daemonUrl!, projectId, conversationId, {
          content: message,
          createdAt: startedAt,
          id: userMessageId,
          role: 'user',
        });
        await saveMessage(daemonUrl!, projectId, conversationId, {
          agentId: 'cursor-agent',
          agentName: 'Cursor Agent',
          content: '',
          createdAt: startedAt,
          events: [],
          id: assistantMessageId,
          role: 'assistant',
          runStatus: 'running',
          startedAt,
        });
        ({ runId } = await startRun(daemonUrl!, {
          agentId: 'cursor-agent',
          assistantMessageId,
          clientRequestId: `req-leftover-${startedAt}`,
          conversationId,
          designSystemId: null,
          message,
          model: 'default',
          projectId,
          reasoning: 'default',
          skillId: null,
          userMessageId,
        }));

        const marker = await waitFor(() => readJsonFile<AgentMarker>(paths.marker), 60_000, 'the fake cursor-agent run invocation');
        spawned.marker = marker;
        // The daemon launched OUR fake through the cursor-agent runtime.
        expect(marker.script).toBe(script);
        expect(marker.argv).toContain('--print');

        // The daemon dies the way it did in production: abort, no JS handlers.
        process.kill(daemonPid!, 'SIGABRT');
        await waitFor(() => (alive(daemonPid) ? null : true), 10_000, 'the daemon to die');

        // Only now does the agent read its stdin, like the incident's orphan.
        await writeFile(paths.go, '1', 'utf8');
        const result = await waitFor(() => readJsonFile<StdinResult>(paths.result), 10_000, 'the agent stdin report');
        const body = await readFile(paths.body, 'utf8');
        observed.stdin = { bytes: result.bytes, wholeMessage: body.includes(message), stdinIsFile: result.stdinIsFile };
        console.info('[leftover-agent-reap e2e] agent stdin report', observed.stdin);
        observed.runningAfterDaemonDied = leftoverProcesses(marker);
      }, { skipFatalLogCheck: true }));

      const leftover = spawned.marker;
      if (!leftover) throw new Error('the fake cursor-agent never started');
      observed.runningAtRestart = leftoverProcesses(leftover);

      const restarted = await createSmokeSuite('leftover-agent-reap-restarted', { dataDir: sharedDataDir });
      await restarted.with.pathEntry(fakeBinDir, () => restarted.with.toolsDev(async ({ logs, start }) => {
        const daemonUrl = start.daemon?.status.url;
        expect(daemonUrl).toMatch(/^http:\/\//);
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && leftoverProcesses(leftover).length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        observed.runningAfterRestart = leftoverProcesses(leftover);
        const logLines = Object.values(await logs()).flatMap((entry) => entry.lines);
        const reapAt = logLines.findIndex((line) => line.includes('leftover agent'));
        const reapLog = reapAt < 0 ? [] : logLines.slice(reapAt, reapAt + 12);
        console.info('[leftover-agent-reap e2e] restarted daemon', { reapLog, runningAfterRestart: observed.runningAfterRestart });

        const run = await readRun(daemonUrl!, runId);
        const assistant = await waitFor(async () => {
          const messages = await listMessages(daemonUrl!, projectId, conversationId);
          const row = messages.find((entry) => entry.id === assistantMessageId);
          return row && row.runStatus !== 'running' && row.runStatus !== 'queued' ? row : null;
        }, 10_000, 'the interrupted assistant message to be reconciled');
        observed.run = {
          status: run.status,
          errorCode: run.errorCode ?? null,
          messageRunStatus: assistant.runStatus ?? null,
        };
      }));
    } finally {
      // Never leave the fake behind, whatever the outcome.
      if (spawned.marker) {
        try { process.kill(-spawned.marker.pid, 'SIGKILL'); } catch { /* gone */ }
        try { process.kill(spawned.marker.grandchildPid, 'SIGKILL'); } catch { /* gone */ }
      }
      await rm(root, { force: true, recursive: true });
    }

    const { pid, grandchildPid } = spawned.marker!;
    const wholeAgentGroup = [`agent ${pid}`, `grandchild ${grandchildPid}`, `group ${pid}`];
    expect({
      // (a) all of it; a prompt cut at the pipe buffer is 65536 bytes.
      wholePromptReceived: observed.stdin?.wholeMessage,
      // (b) by design nothing stops a leftover before the next daemon start.
      runningAfterDaemonDied: observed.runningAfterDaemonDied,
      runningAtRestart: observed.runningAtRestart,
      // (c)
      runningAfterRestart: observed.runningAfterRestart,
      // (d)
      run: observed.run,
    }, `agent read ${observed.stdin?.bytes ?? 'no'} bytes from stdin (file-backed: ${observed.stdin?.stdinIsFile})`).toEqual({
      wholePromptReceived: true,
      runningAfterDaemonDied: wholeAgentGroup,
      runningAtRestart: wholeAgentGroup,
      runningAfterRestart: [],
      run: { status: 'failed', errorCode: 'DAEMON_RESTARTED', messageRunStatus: 'failed' },
    });
  }, 480_000);
});
