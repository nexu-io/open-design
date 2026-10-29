import { describe, expect, it } from 'vitest';

import {
  interruptDurableRunAfterDaemonRestart,
  lastRecordedRunActivityAt,
  type RestartRecoverableDurableRunState,
} from '../../src/runtimes/run-restart-recovery.js';

// P0-24 N1: a Run cut off by a crash or force-quit ended when it last did
// anything, not when the daemon next started.
describe('interruptDurableRunAfterDaemonRestart', () => {
  it('ends the run at its last recorded activity instead of the restart time', () => {
    const state: RestartRecoverableDurableRunState = { status: 'running', updatedAt: 2_000 };
    const restartAt = 50_000_000;
    const last = lastRecordedRunActivityAt(state, [{ timestamp: 1_500 }, { timestamp: 3_200 }, {}]);

    expect(last).toBe(3_200);
    expect(interruptDurableRunAfterDaemonRestart(state, restartAt, last)).toBe(true);
    // Q5: stopped, not failed; the reason stays on the record.
    expect(state).toMatchObject({
      status: 'canceled', updatedAt: 3_200, terminalAt: 3_200,
      errorCode: 'DAEMON_RESTARTED', terminalTrigger: 'daemon_restart', error: null,
    });
  });

  it('falls back to the last persisted update when the log has no timestamps', () => {
    const state: RestartRecoverableDurableRunState = { status: 'queued', updatedAt: 4_000 };
    const last = lastRecordedRunActivityAt(state, [{}, { timestamp: 'x' }]);

    interruptDurableRunAfterDaemonRestart(state, 9_000, last);
    expect(state.terminalAt).toBe(4_000);
  });

  it('keeps the restart time when no usable activity time is known', () => {
    const state: RestartRecoverableDurableRunState = { status: 'running', updatedAt: Number.NaN };
    interruptDurableRunAfterDaemonRestart(state, 9_000, lastRecordedRunActivityAt(state, []));
    expect(state.terminalAt).toBe(9_000);
  });

  it('never ends a run after the restart time', () => {
    const state: RestartRecoverableDurableRunState = { status: 'running', updatedAt: 1_000 };
    interruptDurableRunAfterDaemonRestart(state, 9_000, 12_000);
    expect(state.terminalAt).toBe(9_000);
  });

  it('leaves a terminal run untouched', () => {
    const state: RestartRecoverableDurableRunState = { status: 'succeeded', updatedAt: 1_000, terminalAt: 1_000 };
    expect(interruptDurableRunAfterDaemonRestart(state, 9_000, 1_000)).toBe(false);
    expect(state).toMatchObject({ status: 'succeeded', terminalAt: 1_000 });
  });
});
