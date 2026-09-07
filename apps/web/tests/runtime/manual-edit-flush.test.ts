import { describe, expect, it } from 'vitest';

import {
  manualEditFlushAllowsTeardown,
  manualEditFlushIsDurableFailure,
  manualEditFlushOwesUserNotice,
  type ManualEditFlushOutcome,
} from '../../src/runtime/manual-edit-flush';

/**
 * The three predicates exist to keep three separate decisions from collapsing
 * back into one boolean, so what is pinned here is that each decision reads the
 * outcome differently — a table that would be satisfied by a single `=== true`
 * would prove nothing.
 *
 * `blocked` is the outcome the type was introduced for, and it is the only one
 * that answers differently to all three questions: it must stop the teardown,
 * it still owes the user an explanation, and it must NOT be filed alongside
 * genuine failures.
 */
const ALL: ManualEditFlushOutcome[] = ['settled', 'blocked', 'reported'];

describe('manualEditFlushAllowsTeardown', () => {
  it('lets only a fully settled flush proceed', () => {
    expect(ALL.filter(manualEditFlushAllowsTeardown)).toEqual(['settled']);
  });
});

describe('manualEditFlushOwesUserNotice', () => {
  it('owes a notice only for a flush that stopped without explaining itself', () => {
    // `reported` is excluded because it has already put its own error on
    // screen; `settled` never stopped anything.
    expect(ALL.filter(manualEditFlushOwesUserNotice)).toEqual(['blocked']);
  });
});

describe('manualEditFlushIsDurableFailure', () => {
  it('treats only a real failure as a lasting witness', () => {
    expect(ALL.filter(manualEditFlushIsDurableFailure)).toEqual(['reported']);
  });

  it('does not file a blocked flush as a failure', () => {
    // Filing it is what left Manual Edit refusing to close: a second inline
    // commit arriving while the first was still on the wire was recorded as a
    // permanent failure for its element, and the exit path consults that mark
    // on every attempt.
    expect(manualEditFlushIsDurableFailure('blocked')).toBe(false);
    expect(manualEditFlushAllowsTeardown('blocked')).toBe(false);
    expect(manualEditFlushOwesUserNotice('blocked')).toBe(true);
  });
});
