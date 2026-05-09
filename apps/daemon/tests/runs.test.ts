import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../src/runs.js';

describe('chat run service shutdown', () => {
  it('cancels active runs and terminates their child process during daemon shutdown', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });
    run.status = 'running';
    (run as any).child = child;

    const wait = runs.wait(run);
    await runs.shutdownActive({ graceMs: 10 });

    expect(child.signals).toEqual(['SIGTERM']);
    expect(run.status).toBe('canceled');
    expect(run.cancelRequested).toBe(true);
    expect(run.signal).toBe('SIGTERM');
    await expect(wait).resolves.toMatchObject({ status: 'canceled', signal: 'SIGTERM' });
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { status: 'canceled', signal: 'SIGTERM' },
    });
  });

  it('escalates to SIGKILL when a child ignores the shutdown SIGTERM grace window', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
    const run = runs.create();
    run.status = 'running';
    (run as any).child = child;

    await runs.shutdownActive({ graceMs: 1 });

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(run.status).toBe('canceled');
  });

  it('uses adapter abort before process signals for ACP-style runs', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const abort = vi.fn();
    const run = runs.create();
    run.status = 'running';
    (run as any).child = child;
    (run as any).acpSession = { abort };

    await runs.shutdownActive({ graceMs: 10 });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(child.signals).toEqual(['SIGTERM']);
    expect(run.status).toBe('canceled');
  });
});

function createRuns() {
  return createChatRunService({
    createSseResponse: () => ({
      send: vi.fn(() => true),
      end: vi.fn(),
      cleanup: vi.fn(),
    }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  killed = false;
  signals: string[] = [];

  constructor(private readonly options: { closeOn: 'SIGTERM' | 'SIGKILL' }) {
    super();
  }

  kill(signal: string): boolean {
    this.killed = true;
    this.signals.push(signal);
    if (signal === this.options.closeOn) {
      this.signalCode = signal;
      queueMicrotask(() => {
        this.emit('exit', null, signal);
        this.emit('close', null, signal);
      });
    }
    return true;
  }
}
