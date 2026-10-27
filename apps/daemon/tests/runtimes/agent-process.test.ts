// Agent CLI processes that outlive the daemon that spawned them — the
// 2026-09-14 incident.
//
// The packaged daemon spawned cursor-agent (auto-approved file edits) for a new
// run and died of a V8 OOM abort 2s later. The agent leads its own process
// group, every kill path needed a live daemon, and only the first 64 KiB of
// its prompt had left daemon memory. It re-executed the conversation's FIRST
// request against the project, 44s after the daemon was gone.
//
// A leftover agent may keep running until the next daemon starts; these specs
// pin that it only ever acts on its complete prompt and that the next start
// reaps it. Each drives the daemon's real spawn path from a stand-in daemon
// subprocess and kills that subprocess the way production died. Agents here
// are always a fake CommonJS script, never a real agent CLI.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  agentProcessRecordPath,
  classifyLeftoverAgentRecord,
  openCompletePromptAsStdin,
  reapLeftoverAgentProcesses,
  spawnAgentProcess,
  writeAgentProcessRecord,
  type AgentProcessRecord,
} from '../../src/runtimes/agent-process.js';
import { interruptDurableRunAfterDaemonRestart } from '../../src/runtimes/run-restart-recovery.js';
import type { AgentProcessFixtureConfig } from './agent-process-daemon.fixture.js';
import { FAKE_AGENT_SOURCE, fixturePrompt, sha256 } from './agent-process-fixtures.js';

const daemonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureDaemon = path.join(daemonRoot, 'tests/runtimes/agent-process-daemon.fixture.ts');
// Process groups, SIGKILL and SIGABRT are POSIX; Windows keeps the pure checks.
const onWindows = process.platform === 'win32';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) {
    try { await cleanups.pop()?.(); } catch { /* best-effort */ }
  }
});

function alive(pid: number | null | undefined): boolean {
  if (typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function groupAlive(pgid: number): boolean {
  return alive(-pgid);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  probe: () => T | null | undefined | false,
  timeoutMs: number,
  what: string | (() => string),
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() >= deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${typeof what === 'function' ? what() : what}`);
    }
    await sleep(25);
  }
}

/** Poll until `pids` are all dead (or the deadline passes); returns survivors. */
async function survivorsAfter(pids: number[], groups: number[], timeoutMs: number): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const survivors = [
      ...pids.filter(alive).map((pid) => `pid ${pid}`),
      ...groups.filter(groupAlive).map((pgid) => `group ${pgid}`),
    ];
    if (survivors.length === 0 || Date.now() >= deadline) return survivors;
    await sleep(25);
  }
}

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-agent-process-'));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeFakeAgent(root: string): string {
  const script = path.join(root, 'fake-agent.cjs');
  fs.writeFileSync(script, FAKE_AGENT_SOURCE, 'utf8');
  return script;
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

type FixtureReport = { daemonPid: number; agentPid: number };

/**
 * Start the stand-in daemon. `ulimit -c 0` keeps SIGABRT from leaving core
 * files; `exec` keeps the shell's PID as the daemon's PID.
 */
function startFixtureDaemon(config: AgentProcessFixtureConfig): {
  daemon: ChildProcess;
  stderrTail: () => string;
  report: () => FixtureReport | null;
} {
  const daemon = spawn(
    '/bin/sh',
    ['-c', 'ulimit -c 0; exec "$@"', 'sh', process.execPath, '--import', 'tsx', fixtureDaemon],
    {
      cwd: daemonRoot,
      env: { ...process.env, OD_AGENT_PROCESS_FIXTURE_CONFIG: JSON.stringify(config) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stderr = '';
  let stdout = '';
  daemon.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  daemon.stdout?.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-4000); });
  cleanups.push(() => {
    if (alive(daemon.pid)) process.kill(daemon.pid!, 'SIGKILL');
  });
  const report = (): FixtureReport | null => {
    const line = stdout.split('\n').find((entry) => entry.startsWith('{'));
    if (!line || !stdout.includes('\n')) return null;
    try {
      return JSON.parse(line) as FixtureReport;
    } catch {
      return null;
    }
  };
  return { daemon, stderrTail: () => stderr, report };
}

type AgentMarker = { pid: number; grandchildPid: number | null };

/** Register the agent group for forced cleanup even if a spec fails. */
function trackAgent(marker: AgentMarker): void {
  cleanups.push(() => {
    try { process.kill(-marker.pid, 'SIGKILL'); } catch { /* gone */ }
    if (marker.grandchildPid) {
      try { process.kill(marker.grandchildPid, 'SIGKILL'); } catch { /* gone */ }
    }
  });
}

async function spawnAgentUnderFixtureDaemon(options: {
  root: string;
  runId: string;
  extraEnv?: Record<string, string>;
  promptBytes?: number;
  abortAfterMs?: number;
}): Promise<{ daemon: ChildProcess; marker: AgentMarker; runDir: string }> {
  const agentScript = writeFakeAgent(options.root);
  const runDir = path.join(options.root, 'runs', options.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const markerPath = path.join(options.root, `${options.runId}.marker.json`);
  const { daemon, stderrTail, report } = startFixtureDaemon({
    agentScript,
    runDir,
    runId: options.runId,
    env: { FAKE_AGENT_MARKER: markerPath, ...options.extraEnv },
    ...(options.promptBytes === undefined ? {} : { promptBytes: options.promptBytes }),
    ...(options.abortAfterMs === undefined ? {} : { abortAfterMs: options.abortAfterMs }),
  });
  const marker = await waitFor(
    () => readJson<AgentMarker>(markerPath),
    20_000,
    () => `the fake agent to start (daemon stderr: ${stderrTail()})`,
  );
  trackAgent(marker);
  // The daemon kills below model a death AFTER spawnAgentProcess returned —
  // the invariant's scope. (A kill racing the spawn call itself is the
  // synchronous window between spawn() and the record write.)
  await waitFor(report, 20_000, () => `the stand-in daemon's spawn report (stderr: ${stderrTail()})`);
  return { daemon, marker, runDir };
}

describe.skipIf(onWindows)('an agent receives the complete prompt or nothing', () => {
  it('delivers the whole prompt to an agent that starts reading 3s after its daemon aborted', async () => {
    const root = tempRoot();
    const promptBytes = 288 * 1024;
    const resultPath = path.join(root, 'stdin-result.json');
    const { daemon, marker, runDir } = await spawnAgentUnderFixtureDaemon({
      root,
      runId: 'run-prompt',
      promptBytes,
      abortAfterMs: 1_000,
      extraEnv: { FAKE_AGENT_RESULT: resultPath, FAKE_AGENT_READ_DELAY_MS: '3000' },
    });
    await waitFor(() => !alive(daemon.pid), 10_000, 'the stand-in daemon to abort');

    const result = await waitFor(
      () => readJson<{ bytes: number; sha256: string; stdinIsFile: boolean }>(resultPath),
      15_000,
      `the agent (pid ${marker.pid}) to report what it read from stdin`,
    );
    const expected = fixturePrompt(promptBytes);
    expect(result.bytes, 'bytes the agent read from stdin').toBe(Buffer.byteLength(expected));
    expect(result.sha256).toBe(sha256(expected));
    // The staged prompt never outlives its hand-over.
    expect(fs.readdirSync(runDir).filter((name) => name.endsWith('.prompt'))).toEqual([]);
  }, 40_000);

  it('stages the prompt 0600 and removes it from the run directory', () => {
    const root = tempRoot();
    const runDir = path.join(root, 'runs', 'run-stage');
    const staged = openCompletePromptAsStdin(runDir, 'hello prompt');
    try {
      expect(path.dirname(staged.filePath)).toBe(runDir);
      expect(fs.statSync(staged.filePath).mode & 0o777).toBe(0o600);
      expect(fs.readFileSync(staged.filePath, 'utf8')).toBe('hello prompt');
    } finally {
      staged.releaseAfterSpawn();
    }
    expect(fs.existsSync(staged.filePath)).toBe(false);
  });
});

describe.skipIf(onWindows)('every running agent is on record for the next daemon start', () => {
  it('kills an agent it cannot record and fails the spawn', async () => {
    const root = tempRoot();
    const agentScript = writeFakeAgent(root);
    // The run directory cannot exist: its parent is a regular file.
    const blocker = path.join(root, 'not-a-directory');
    fs.writeFileSync(blocker, '');
    let failure: unknown = null;
    try {
      const { child } = spawnAgentProcess({
        command: process.execPath,
        args: [agentScript],
        env: { ...process.env },
        cwd: root,
        stdin: 'ignore',
        runDir: path.join(blocker, 'run-unrecordable'),
        runId: 'run-unrecordable',
      });
      // Reached only when the unrecorded agent was (wrongly) left running.
      if (typeof child.pid === 'number') trackAgent({ pid: child.pid, grandchildPid: null });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const pid = Number((failure as Error).message.match(/could not record agent process (\d+)/)?.[1]);
    expect(Number.isSafeInteger(pid) && pid > 0, `spawn failure names the agent: ${String(failure)}`).toBe(true);
    trackAgent({ pid, grandchildPid: null });
    expect(await survivorsAfter([pid], [pid], 5_000), 'an agent no later daemon could find kept running').toEqual([]);
  }, 20_000);
});

describe.skipIf(onWindows)('startup reconciliation reaps leftovers', () => {
  it('terminates a recorded agent that outlived its daemon, even once its run was reconciled as failed', async () => {
    const root = tempRoot();
    const { daemon, marker, runDir } = await spawnAgentUnderFixtureDaemon({
      root,
      runId: 'run-leftover',
      extraEnv: { FAKE_AGENT_GRANDCHILD: '1', FAKE_AGENT_IGNORE_SIGTERM: '1' },
    });
    process.kill(daemon.pid!, 'SIGKILL');
    await waitFor(() => !alive(daemon.pid), 5_000, 'the stand-in daemon to die');
    await sleep(300);
    // Nothing stops an agent whose daemon is gone until the next start.
    expect(alive(marker.pid), 'precondition: the orphaned agent survived its daemon').toBe(true);
    // An earlier start already interrupted the run (it could not verify the
    // agent then); the record, not the run's status, decides the reap.
    const runState = { id: 'run-leftover', status: 'running', updatedAt: Date.now() };
    interruptDurableRunAfterDaemonRestart(runState);
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify(runState));

    // The next daemon starts.
    const result = await reapLeftoverAgentProcesses({
      runsLogDir: path.join(root, 'runs'),
      termGraceMs: 300,
      killGraceMs: 1_000,
    });

    const survivors = await survivorsAfter([marker.pid, marker.grandchildPid ?? marker.pid], [marker.pid], 5_000);
    expect(survivors, 'leftover agent processes after startup reconciliation').toEqual([]);
    expect(result.reaped.map((entry) => entry.pid)).toEqual([marker.pid]);
    expect(fs.existsSync(agentProcessRecordPath(runDir, marker.pid))).toBe(false);
  }, 40_000);

  it('leaves a live process alone when the recorded identity does not match it (PID reuse)', async () => {
    const root = tempRoot();
    const runDir = path.join(root, 'runs', 'run-lookalike');
    // An unrelated process that happens to hold the recorded PID: its own
    // group leader, like an agent would be, but created at a different time.
    const lookalike = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      detached: true,
      stdio: 'ignore',
    });
    const lookalikePid = lookalike.pid!;
    cleanups.push(() => { try { process.kill(-lookalikePid, 'SIGKILL'); } catch { /* gone */ } });
    await waitFor(() => alive(lookalikePid), 5_000, 'the lookalike to start');
    const exited = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
    await new Promise((resolve) => exited.once('exit', resolve));
    const now = Date.now();
    const record: AgentProcessRecord = {
      schemaVersion: 1,
      runId: 'run-lookalike',
      pid: lookalikePid,
      processGroupId: lookalikePid,
      spawnedAtMs: now - 3_600_000,
      spawnReturnedAtMs: now - 3_600_000 + 5,
      launchPath: '/fake/cursor-agent',
      ownerPid: exited.pid!,
      ownerStartedAtMs: now - 3_600_000 - 60_000,
    };
    writeAgentProcessRecord(runDir, record);

    const result = await reapLeftoverAgentProcesses({ runsLogDir: path.join(root, 'runs'), termGraceMs: 300 });

    await sleep(500);
    expect(alive(lookalikePid), 'an unrelated process was killed on a stale record').toBe(true);
    expect(result.reaped).toEqual([]);
    expect(result.skipped).toEqual([{ runId: 'run-lookalike', pid: lookalikePid, verdict: 'identity_mismatch' }]);
    expect(fs.existsSync(agentProcessRecordPath(runDir, lookalikePid))).toBe(false);
  }, 20_000);

  it('keeps the agents of a daemon that is still running on the same data root', async () => {
    const root = tempRoot();
    const { marker, runDir } = await spawnAgentUnderFixtureDaemon({
      root,
      runId: 'run-live-owner',
    });

    const result = await reapLeftoverAgentProcesses({ runsLogDir: path.join(root, 'runs'), termGraceMs: 300 });

    expect(result.reaped).toEqual([]);
    expect(result.skipped).toEqual([{ runId: 'run-live-owner', pid: marker.pid, verdict: 'owner_alive' }]);
    await sleep(300);
    expect(alive(marker.pid)).toBe(true);
    expect(fs.existsSync(agentProcessRecordPath(runDir, marker.pid))).toBe(true);
  }, 40_000);

  it('removes prompts a previous daemon staged but never handed over', async () => {
    const root = tempRoot();
    const runDir = path.join(root, 'runs', 'run-staged');
    fs.mkdirSync(runDir, { recursive: true });
    const stale = path.join(runDir, 'agent-stdin-stale.prompt');
    const fresh = path.join(runDir, 'agent-stdin-fresh.prompt');
    fs.writeFileSync(stale, 'old prompt', { mode: 0o600 });
    fs.writeFileSync(fresh, 'new prompt', { mode: 0o600 });
    const daemonStartedAtMs = Date.now();
    fs.utimesSync(stale, new Date(daemonStartedAtMs - 60_000), new Date(daemonStartedAtMs - 60_000));
    fs.utimesSync(fresh, new Date(daemonStartedAtMs + 60_000), new Date(daemonStartedAtMs + 60_000));

    const result = await reapLeftoverAgentProcesses({ runsLogDir: path.join(root, 'runs'), daemonStartedAtMs });

    expect(result.stagedPromptsRemoved).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });
});

describe('classifyLeftoverAgentRecord', () => {
  const record: AgentProcessRecord = {
    schemaVersion: 1,
    runId: 'run-1',
    pid: 4_001,
    processGroupId: process.platform === 'win32' ? null : 4_001,
    spawnedAtMs: 1_000_000,
    spawnReturnedAtMs: 1_000_010,
    launchPath: '/bin/agent',
    ownerPid: 3_001,
    ownerStartedAtMs: 900_000,
  };
  const identity = (pid: number, startedAtMs: number, processGroupId: number | null = pid) => ({
    pid,
    ppid: 1,
    processGroupId: process.platform === 'win32' ? null : processGroupId,
    startedAtMs,
    startedAtResolutionMs: 1_000,
    command: 'agent',
  });

  it('reaps only a live agent created inside its recorded spawn window', async () => {
    const readIdentities = async () => new Map([[4_001, identity(4_001, 1_000_000)]]);
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: (pid) => pid === 4_001,
      readIdentities,
    })).resolves.toBe('reap');
  });

  it('rejects a recycled PID whose creation time is outside the window', async () => {
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: (pid) => pid === 4_001,
      readIdentities: async () => new Map([[4_001, identity(4_001, 1_000_000 + 60_000)]]),
    })).resolves.toBe('identity_mismatch');
  });

  it.skipIf(onWindows)('rejects a process that no longer leads the recorded group', async () => {
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: (pid) => pid === 4_001,
      readIdentities: async () => new Map([[4_001, identity(4_001, 1_000_000, 777)]]),
    })).resolves.toBe('identity_mismatch');
  });

  it('judges a record written under a recycled copy of this daemon\'s PID like any other', async () => {
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 3_001,
      selfStartedAtMs: 950_000,
      isAlive: (pid) => pid === 3_001 || pid === 4_001,
      readIdentities: async () => new Map([[4_001, identity(4_001, 1_000_000)]]),
    })).resolves.toBe('reap');
  });

  it('never acts on records this daemon wrote, or on a live owner', async () => {
    await expect(classifyLeftoverAgentRecord(record, { selfPid: 3_001, selfStartedAtMs: 900_000 })).resolves.toBe('own');
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: () => true,
      readIdentities: async () => new Map([
        [3_001, identity(3_001, 900_000)],
        [4_001, identity(4_001, 1_000_000)],
      ]),
    })).resolves.toBe('owner_alive');
  });

  it('treats an unreadable identity as unverifiable, never as gone', async () => {
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: (pid) => pid === 4_001,
      readIdentities: async () => { throw new Error('ps unavailable'); },
    })).resolves.toBe('unverifiable');
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: (pid) => pid === 4_001,
      readIdentities: async () => new Map(),
    })).resolves.toBe('unverifiable');
  });

  it('reports gone when neither the agent nor its owner exists', async () => {
    await expect(classifyLeftoverAgentRecord(record, {
      selfPid: 1,
      isAlive: () => false,
    })).resolves.toBe('gone');
  });
});
