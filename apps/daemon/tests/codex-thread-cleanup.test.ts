import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { waitForProcessExit } from '@open-design/platform';
import { attachCodexAppServerSession } from '../src/agent-protocol/codex-app-server/session.js';
import { cleanupClosedCodexThread } from '../src/agent-protocol/codex-app-server/thread-cleanup.js';

// A real stdio child with controlled protocol responses, no provider or service.
// It records every request before responding, so prohibited resume/list/start
// calls from the cleanup process cannot pass unnoticed.
const fixture = `
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const send = (id, result) => process.stdout.write(JSON.stringify({ id, result }) + '\\n');
const lines = createInterface({ input: process.stdin });
lines.on('line', line => {
  const frame = JSON.parse(line);
  appendFileSync(process.env.TRANSCRIPT, JSON.stringify({ pid: process.pid, cwd: process.cwd(), marker: process.env.CASE_MARKER, ...frame }) + '\\n');
  if (frame.method === 'initialize') {
    if (process.env.INIT === 'hang') return;
    if (process.env.INIT === 'invalid') { send(frame.id, []); return; }
    if (process.env.INIT === 'refuse') {
      process.stdout.write(JSON.stringify({ id: frame.id, error: { message: 'initialization refused' } }) + '\\n');
      return;
    }
    send(frame.id, { userAgent: 'codex/' + (process.env.VERSION || '0.154.0') });
  } else if (frame.method === 'thread/start') {
    send(frame.id, { thread: { id: 'owned-thread', historyMode: process.env.HISTORY_MODE || 'paginated' } });
  } else if (frame.method === 'turn/start') {
    if (process.env.SOURCE_EXIT === 'kill') process.kill(process.pid, 'SIGKILL');
    else process.exit(Number(process.env.SOURCE_EXIT || 0));
  } else if (frame.method === 'thread/archive') {
    if (process.env.ARCHIVE === 'hang') { setInterval(() => {}, 1000); return; }
    if (process.env.ARCHIVE === 'exit') process.exit(2);
    if (process.env.ARCHIVE === 'refuse') {
      process.stdout.write(JSON.stringify({ id: frame.id, error: { code: -32600, message: 'thread already has an active writer' } }) + '\\n');
    } else send(frame.id, {});
  } else if (frame.method !== 'initialized') process.exit(3);
});
`;

async function scenario(options: { sourceExit?: string; archive?: string; cleanupVersion?: string; missingCommand?: boolean; init?: string; historyMode?: 'legacy' | 'paginated' } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-close-cleanup-'));
  const transcript = path.join(root, 'requests.jsonl');
  const script = path.join(root, 'controlled-cli.ts');
  await writeFile(script, fixture);
  const invocation = {
    command: process.execPath,
    args: [script],
    cwd: root,
    env: { PATH: process.env.PATH, TRANSCRIPT: transcript, CASE_MARKER: 'same-original-context',
      SOURCE_EXIT: options.sourceExit ?? '0', ARCHIVE: options.archive ?? 'success', HISTORY_MODE: options.historyMode ?? 'paginated' },
  };
  const original = spawn(invocation.command, invocation.args, { cwd: root, env: invocation.env, stdio: 'pipe' });
  original.stderr.resume();
  const session = attachCodexAppServerSession({
    child: original, prompt: 'controlled owned prompt', cwd: root,
    sandboxMode: 'workspace-write', manageThreadVisibility: true, onAgentEvent: () => {},
  });
  try {
    expect(session.takeClosedThreadCleanup()).toBeNull();
    await once(original, 'close');
    const receipt = session.takeClosedThreadCleanup();
    expect(receipt).toMatchObject({ threadId: 'owned-thread', historyMode: options.historyMode ?? 'paginated' });
    expect(session.takeClosedThreadCleanup()).toBeNull();
    // A version change explicitly models the original executable being upgraded
    // or downgraded between exits; normal cases pass the exact original context.
    const cleanup = await cleanupClosedCodexThread({ ...invocation, receipt,
      env: { ...invocation.env, ...(options.cleanupVersion ? { VERSION: options.cleanupVersion } : {}),
        ...(options.init ? { INIT: options.init } : {}) },
      ...(options.missingCommand ? { command: path.join(root, 'missing-cli') } : {}),
    });
    const requests = (await readFile(transcript, 'utf8')).trim().split('\n')
      .map(line => JSON.parse(line) as { pid: number; cwd: string; marker: string; method: string; params?: { threadId?: string } });
    const cleanupRequests = requests.filter(request => request.pid !== original.pid);
    for (const pid of new Set(cleanupRequests.map(request => request.pid))) {
      expect(() => process.kill(pid, 0)).toThrow();
    }
    expect(cleanupRequests.every(request => request.cwd === requests[0]?.cwd)).toBe(true);
    expect(session.completedSuccessfully()).toBe(false);
    expect(cleanupRequests.every(request => request.marker === 'same-original-context')).toBe(true);
    expect(cleanupRequests.map(request => request.method)).not.toContain('thread/resume');
    expect(cleanupRequests.map(request => request.method)).not.toContain('thread/list');
    expect(cleanupRequests.map(request => request.method)).not.toContain('turn/start');
    return { cleanup, cleanupRequests };
  } finally {
    if (original.exitCode === null && original.signalCode === null) {
      original.kill('SIGKILL');
      await once(original, 'close');
    }
    await rm(root, { recursive: true, force: true });
  }
}

describe('closed owned Codex thread cleanup over real stdio', () => {
  it.each(['0', '1', 'kill'])('archives only the captured owned ID after physical exit %s', async (sourceExit) => {
    const { cleanup, cleanupRequests } = await scenario({ sourceExit });
    expect(cleanup).toEqual({ status: 'archived' });
    expect(cleanupRequests.map(request => request.method)).toEqual(['initialize', 'initialized', 'thread/archive']);
    expect(cleanupRequests.at(-1)?.params).toEqual({ threadId: 'owned-thread' });
  });

  it('preserves another writer and reports the archive refusal without retrying', async () => {
    const { cleanup, cleanupRequests } = await scenario({ archive: 'refuse' });
    expect(cleanup).toMatchObject({ status: 'failed', message: expect.stringContaining('active writer') });
    expect(cleanupRequests.filter(request => request.method === 'thread/archive')).toHaveLength(1);
  });

  it.each(['unknown', '0.145.0'])('does not send archive when the fresh handshake cannot verify locks: %s', async (cleanupVersion) => {
    const { cleanup, cleanupRequests } = await scenario({ cleanupVersion });
    expect(cleanup).toEqual({ status: 'skipped', reason: 'unverified-writer-lock' });
    expect(cleanupRequests.map(request => request.method)).toEqual(['initialize']);
  });

  it('returns a cleanup failure when the new process exits without an archive acknowledgement', async () => {
    expect((await scenario({ archive: 'exit' })).cleanup).toMatchObject({ status: 'failed', message: expect.stringContaining('before acknowledgement') });
  });

  it('reaps its own hung cleanup process within the existing archive budget', async () => {
    // Real child I/O and actual process closure are the assertion boundary;
    // fake timers would not establish that the precise spawned PID was reaped.
    expect((await scenario({ archive: 'hang' })).cleanup).toEqual({ status: 'failed', message: 'codex thread cleanup timed out' });
  });

  it('does not archive legacy history after a downgrade to paginated-only writer protection', async () => {
    const { cleanup, cleanupRequests } = await scenario({ historyMode: 'legacy', cleanupVersion: '0.146.0' });
    expect(cleanup).toEqual({ status: 'skipped', reason: 'unverified-writer-lock' });
    expect(cleanupRequests.map(request => request.method)).toEqual(['initialize']);
  });

  it.each(['refuse', 'invalid', 'hang'])('handles initialization %s without touching the thread', async (init) => {
    const { cleanup, cleanupRequests } = await scenario({ init });
    expect(cleanup.status).toBe('failed');
    expect(cleanupRequests.map(request => request.method)).toEqual(['initialize']);
  });

  it('handles an executable disappearing after the original child exited', async () => {
    expect((await scenario({ missingCommand: true })).cleanup).toMatchObject({ status: 'failed', message: expect.stringContaining('ENOENT') });
  });

  it.skipIf(process.platform === 'win32').each([false, true])('bounds POSIX wrapper cleanup with detached descendant=%s', async (detached) => {
    // Ownership/session behavior is covered above with physical source children.
    // This test isolates the new cleanup process tree with a protocol-issued receipt.
    const source = Object.assign(new EventEmitter(), { stdout: new EventEmitter(),
      stdin: { write: (line: string) => {
        const request = JSON.parse(line) as { id: number; method: string };
        if (request.method === 'initialize' || request.method === 'thread/start') {
          queueMicrotask(() => source.stdout.emit('data', JSON.stringify({ id: request.id,
            result: request.method === 'initialize' ? { userAgent: 'codex/0.154.0' }
              : { thread: { id: 'owned-thread', historyMode: 'paginated' } } }) + '\n'));
        }
      }, end: () => {} } });
    let ready!: () => void;
    const readyPromise = new Promise<void>(resolve => { ready = resolve; });
    const session = attachCodexAppServerSession({ child: source, prompt: 'owned', cwd: '/',
      sandboxMode: 'workspace-write', manageThreadVisibility: true, onAgentEvent: () => {}, onSessionReady: ready });
    await readyPromise;
    source.emit('close');
    const receipt = session.takeClosedThreadCleanup();
    expect(receipt).not.toBeNull();
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cleanup-wrapper-'));
    const script = path.join(root, 'controlled-cli.ts');
    const wrapper = path.join(root, 'wrapper.ts');
    const metadata = path.join(root, 'owned-pids.json');
    const transcript = path.join(root, 'requests.jsonl');
    await writeFile(script, fixture);
    await writeFile(wrapper, `import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      const child = spawn(process.execPath, [process.argv[2]], { stdio: 'inherit', detached: ${detached} });
      writeFileSync(process.env.OWNED_PIDS, JSON.stringify({ wrapper: process.pid, descendant: child.pid }));
      child.on('exit', code => process.exit(code ?? 1));`);
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    const unrelatedClosed = once(unrelated, 'close');
    const cleanup = cleanupClosedCodexThread({ receipt, command: process.execPath, args: [wrapper, script], cwd: root,
      env: { PATH: process.env.PATH, OWNED_PIDS: metadata, TRANSCRIPT: transcript, ARCHIVE: 'hang' } });
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      // Real timeout is the resource behavior under test. A second bounded
      // watchdog lets the red case reach finally and reclaim the known PIDs.
      const outcome = await Promise.race([cleanup, new Promise<'still-pending'>(resolve => {
        watchdog = setTimeout(() => resolve('still-pending'), 2500);
      })]);
      expect(await readFile(transcript, 'utf8')).toContain('thread/archive');
      const owned = JSON.parse(await readFile(metadata, 'utf8')) as { wrapper: number; descendant: number };
      if (detached) {
        // The fixture alone knows this escaped process. Production must not
        // infer its identity from a PID/name scan or claim it was reaped.
        expect(outcome).toMatchObject({ status: 'failed', treeVerified: false,
          message: expect.stringContaining('inherited stdio remained open') });
        expect(() => process.kill(owned.descendant, 0)).not.toThrow();
        expect(await waitForProcessExit(owned.wrapper, 500)).toBe(true);
      } else {
        expect(outcome).toEqual({ status: 'failed', message: 'codex thread cleanup timed out' });
        expect(await waitForProcessExit(owned.descendant, 500)).toBe(true);
      }
      expect(unrelated.exitCode).toBeNull();
      expect(unrelated.signalCode).toBeNull();
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    } finally {
      clearTimeout(watchdog);
      const owned = JSON.parse(await readFile(metadata, 'utf8')) as { wrapper: number; descendant: number };
      // Never scan processes or target a name: these exact PIDs come from this
      // test-owned wrapper before any termination, including the baseline leak.
      for (const pid of [owned.descendant, owned.wrapper]) {
        try { process.kill(pid, 'SIGKILL'); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
      await cleanup;
      unrelated.kill('SIGKILL');
      await unrelatedClosed;
      for (const pid of [owned.descendant, owned.wrapper]) expect(await waitForProcessExit(pid, 500)).toBe(true);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not spawn anything without a closed ownership receipt', async () => {
    expect(await cleanupClosedCodexThread({ receipt: null, command: '/must-not-run', args: [], cwd: '/', env: {} }))
      .toEqual({ status: 'skipped', reason: 'no-owned-closed-thread' });
  });
});
