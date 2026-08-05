import { describe, expect, it, vi } from 'vitest';
import { reconcileAssistantMessageOnRunEnd } from '../../src/runtimes/run-message-reconciliation.js';

describe('reconcileAssistantMessageOnRunEnd', () => {
  it('waits for the terminal run and updates only active message states', async () => {
    const run = { assistantMessageId: 'message-1' };
    const wait = vi.fn(async () => ({ status: 'succeeded' }));
    const execute = vi.fn();
    const db = { prepare: vi.fn(() => ({ run: execute })) };

    reconcileAssistantMessageOnRunEnd(db, { wait }, run);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith('succeeded', expect.any(Number), 'message-1'));

    expect(wait).toHaveBeenCalledWith(run);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("run_status IN ('queued', 'running')"));
  });

  it('does not wait without an assistant message and reports wait failures', async () => {
    const wait = vi.fn();
    const warn = vi.fn();
    const db = { prepare: vi.fn() };

    reconcileAssistantMessageOnRunEnd(db, { wait }, {});
    expect(wait).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();

    const failure = new Error('run unavailable');
    reconcileAssistantMessageOnRunEnd(
      db,
      { wait: vi.fn(async () => { throw failure; }) },
      { assistantMessageId: 'message-1' },
      warn,
    );
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[runs] message reconciliation failed', failure));
  });
});
