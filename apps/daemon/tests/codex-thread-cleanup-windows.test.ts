import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ metadata: '', calls: 0, failRefresh: false, failInitial: false, stopped: [] as number[][] }));
vi.mock('@open-design/platform', async (load) => {
  const actual = await load<typeof import('@open-design/platform')>();
  return { ...actual,
    captureProcessSnapshot: async (options: { timeoutMs?: number }) => {
      expect(options.timeoutMs).toBe(500);
      state.calls++;
      if (state.failInitial || (state.calls > 1 && state.failRefresh)) throw new Error('controlled CIM timeout');
      const pids = JSON.parse(await readFile(state.metadata, 'utf8')) as { wrapper: number; descendant: number };
      return [
        { pid: pids.wrapper, ppid: process.pid, command: 'controlled wrapper', startedAtMs: 100 },
        { pid: pids.descendant, ppid: pids.wrapper, command: 'controlled child', startedAtMs: 101 },
      ].filter(entry => Number.isSafeInteger(entry.pid) && entry.pid > 0 && actual.isProcessAlive(entry.pid));
    },
    stopProcesses: async (pids: number[], options: { termGraceMs: number; killGraceMs: number }) => {
      if (!pids.every(pid => Number.isSafeInteger(pid) && pid > 0)) throw new Error('unsafe PID in controlled fixture');
      state.stopped.push(pids);
      return actual.stopProcesses(pids, options);
    },
  };
});
import { attachCodexAppServerSession } from '../src/agent-protocol/codex-app-server/session.js';
import { cleanupClosedCodexThread } from '../src/agent-protocol/codex-app-server/thread-cleanup.js';
import { captureProcessSnapshot, isProcessAlive, stopProcesses, waitForProcessExit } from '@open-design/platform';

async function receipt() {
  let ready!: () => void;
  const readyPromise = new Promise<void>(resolve => { ready = resolve; });
  const source = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stdin: {
    write: (line: string) => {
      const request = JSON.parse(line) as { id: number; method: string };
      if (request.method === 'initialize' || request.method === 'thread/start') queueMicrotask(() => {
        source.stdout.emit('data', JSON.stringify({ id: request.id, result: request.method === 'initialize'
          ? { userAgent: 'codex/0.154.0' } : { thread: { id: 'owned-thread', historyMode: 'paginated' } } }) + '\n');
      });
    }, end: () => {},
  } });
  const session = attachCodexAppServerSession({ child: source, cwd: '/', prompt: 'owned', sandboxMode: 'workspace-write',
    manageThreadVisibility: true, onAgentEvent: () => {}, onSessionReady: ready });
  await readyPromise; source.emit('close');
  return session.takeClosedThreadCleanup();
}

// Exercise the actual Windows lifecycle branch with real wrapper/descendant
// stdio processes. Only Win32/CIM process records are controlled: this is NOT
// native Windows .cmd or CIM acceptance, which requires a Windows runner.
describe('controlled process fixture PID safety', () => {
  it.each([-1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects invalid PID %s before any OS process operation', async (pid) => {
      const root = await mkdtemp(path.join(tmpdir(), 'codex-fixture-pid-'));
      state.metadata = path.join(root, 'owned-pids.json'); state.calls = 0; state.stopped = [];
      state.failInitial = false; state.failRefresh = false;
      await writeFile(state.metadata, JSON.stringify({ wrapper: pid, descendant: pid }));
      // Even if this guard regresses, this test cannot deliver any OS signal.
      const processCalls = vi.spyOn(process, 'kill').mockReturnValue(true);
      try {
        expect(await captureProcessSnapshot({ timeoutMs: 500 })).toEqual([]);
        await expect(stopProcesses([pid as number], { termGraceMs: 0, killGraceMs: 0 }))
          .rejects.toThrow('unsafe PID in controlled fixture');
        expect(state.stopped).toEqual([]);
        expect(processCalls).not.toHaveBeenCalled();
      } finally {
        processCalls.mockRestore();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

describe('Windows owned cleanup lifecycle with controlled generation records', () => {
  it.each(['wrapper-alive', 'wrapper-exited', 'snapshot-failure', 'initial-snapshot-failure'])(
    'bounds cleanup and preserves ownership when %s', async (mode) => {
      const root = await mkdtemp(path.join(tmpdir(), 'codex-windows-tree-'));
      const wrapper = path.join(root, 'wrapper.ts');
      const descendant = path.join(root, 'descendant.ts');
      state.metadata = path.join(root, 'owned-pids.json'); state.calls = 0; state.stopped = [];
      state.failRefresh = mode === 'snapshot-failure'; state.failInitial = mode === 'initial-snapshot-failure';
      await writeFile(descendant, `import { createInterface } from 'node:readline';
        setInterval(() => {}, 1000);
        createInterface({ input: process.stdin }).on('line', line => {
          const frame = JSON.parse(line);
          if (frame.method === 'initialize') process.stdout.write(JSON.stringify({ id: frame.id, result: { userAgent: 'codex/0.154.0' } }) + '\\n');
          if (frame.method === 'thread/archive') {
            setInterval(() => {}, 1000);
            if (process.env.EXIT_WRAPPER === 'yes') process.send('exit-wrapper');
          }
        });`);
      await writeFile(wrapper, `import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
        const child = spawn(process.execPath, [process.argv[2]], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
        writeFileSync(process.env.OWNED_PIDS, JSON.stringify({ wrapper: process.pid, descendant: child.pid }));
        child.on('message', () => process.exit(0)); child.on('exit', code => process.exit(code ?? 1));`);
      const authority = await receipt();
      const sibling = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const siblingClosed = once(sibling, 'close');
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      let cleanup: ReturnType<typeof cleanupClosedCodexThread> | undefined;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      try {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
        cleanup = cleanupClosedCodexThread({ receipt: authority, command: process.execPath, args: [wrapper, descendant], cwd: root,
          env: { PATH: process.env.PATH, OWNED_PIDS: state.metadata, EXIT_WRAPPER: mode === 'wrapper-exited' ? 'yes' : 'no' } });
        const result = await Promise.race([cleanup, new Promise<'still-pending'>(resolve => {
          watchdog = setTimeout(() => resolve('still-pending'), 4000);
        })]);
        expect(result).not.toBe('still-pending');
        expect(result).toMatchObject({ status: 'failed' });
        const owned = JSON.parse(await readFile(state.metadata, 'utf8')) as { wrapper: number; descendant: number };
        expect(await waitForProcessExit(owned.wrapper, 500)).toBe(true);
        if (mode === 'initial-snapshot-failure') {
          expect(result).toMatchObject({ treeVerified: false, remainingPids: [] });
          expect(state.stopped).toEqual([]);
          expect(isProcessAlive(owned.descendant)).toBe(true);
        } else if (mode === 'snapshot-failure') {
          expect(result).toMatchObject({ treeVerified: false, remainingPids: expect.arrayContaining([owned.descendant]) });
          expect(state.stopped).toEqual([]);
          expect(isProcessAlive(owned.descendant)).toBe(true);
        } else {
          expect(result).toMatchObject({ treeVerified: true, remainingPids: [] });
          expect(await waitForProcessExit(owned.descendant, 500)).toBe(true);
          expect(state.stopped.flat()).toContain(owned.descendant);
        }
        expect(isProcessAlive(sibling.pid)).toBe(true);
      } finally {
        clearTimeout(watchdog);
        Object.defineProperty(process, 'platform', platform);
        const owned = JSON.parse(await readFile(state.metadata, 'utf8')) as { wrapper: number; descendant: number };
        for (const pid of [owned.descendant, owned.wrapper].filter(pid => Number.isSafeInteger(pid) && pid > 0)) {
          try { process.kill(pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        }
        await cleanup;
        sibling.kill('SIGKILL'); await siblingClosed;
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it.each(['known-child', 'late-unknown-child', 'known-child-snapshot-failure'])(
    'distinguishes archive acknowledgement from process cleanup for %s', async (mode) => {
      const root = await mkdtemp(path.join(tmpdir(), 'codex-windows-ack-'));
      const wrapper = path.join(root, 'wrapper.ts');
      state.metadata = path.join(root, 'owned-pids.json'); state.calls = 0; state.stopped = [];
      state.failRefresh = mode === 'known-child-snapshot-failure'; state.failInitial = false;
      await writeFile(wrapper, `import { spawn } from 'node:child_process';
        import { writeFileSync } from 'node:fs'; import { createInterface } from 'node:readline';
        let child;
        const save = () => writeFileSync(process.env.OWNED_PIDS, JSON.stringify({ wrapper: process.pid, descendant: child?.pid ?? -1 }));
        const createChild = () => { child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); save(); };
        if (process.env.CHILD_MODE !== 'late-unknown-child') createChild(); else save();
        createInterface({ input: process.stdin }).on('line', line => {
          const frame = JSON.parse(line);
          if (frame.method === 'initialize') process.stdout.write(JSON.stringify({ id: frame.id, result: { userAgent: 'codex/0.154.0' } }) + '\\n');
          if (frame.method === 'thread/archive') {
            if (!child) createChild();
            process.stdout.write(JSON.stringify({ id: frame.id, result: {} }) + '\\n', () => process.exit(0));
          }
        });`);
      const authority = await receipt();
      const sibling = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const siblingClosed = once(sibling, 'close');
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      let cleanup: ReturnType<typeof cleanupClosedCodexThread> | undefined;
      try {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
        cleanup = cleanupClosedCodexThread({ receipt: authority, command: process.execPath, args: [wrapper], cwd: root,
          env: { PATH: process.env.PATH, OWNED_PIDS: state.metadata, CHILD_MODE: mode } });
        const result = await cleanup;
        const owned = JSON.parse(await readFile(state.metadata, 'utf8')) as { wrapper: number; descendant: number };
        expect(await waitForProcessExit(owned.wrapper, 500)).toBe(true);
        if (mode === 'known-child-snapshot-failure') {
          expect(result).toMatchObject({ status: 'failed', treeVerified: false,
            message: expect.stringContaining('archive acknowledged; process cleanup failed'),
            remainingPids: expect.arrayContaining([owned.descendant]) });
          expect(isProcessAlive(owned.descendant)).toBe(true);
          expect(state.stopped).toEqual([]);
        } else if (mode === 'known-child') {
          expect(result).toMatchObject({ status: 'archived', treeVerified: false });
          expect(await waitForProcessExit(owned.descendant, 500)).toBe(true);
          expect(state.stopped.flat()).toContain(owned.descendant);
        } else {
          // It appeared only after the ownership snapshot. The dead wrapper
          // cannot prove this new process belongs to us, even with its old ppid.
          expect(result).toMatchObject({ status: 'archived', treeVerified: false });
          expect(isProcessAlive(owned.descendant)).toBe(true);
          expect(state.stopped.flat()).not.toContain(owned.descendant);
        }
        expect(isProcessAlive(sibling.pid)).toBe(true);
      } finally {
        Object.defineProperty(process, 'platform', platform);
        const stored = await readFile(state.metadata, 'utf8').catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return null;
        });
        const owned = stored ? JSON.parse(stored) as { wrapper: number; descendant: number } : null;
        for (const pid of (owned ? [owned.descendant, owned.wrapper] : []).filter(pid => Number.isSafeInteger(pid) && pid > 0)) {
          try { process.kill(pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        }
        await cleanup;
        sibling.kill('SIGKILL'); await siblingClosed;
        for (const pid of (owned ? [owned.descendant, owned.wrapper] : []).filter(pid => Number.isSafeInteger(pid) && pid > 0)) expect(await waitForProcessExit(pid, 500)).toBe(true);
        await rm(root, { recursive: true, force: true });
      }
    },
  );

});
