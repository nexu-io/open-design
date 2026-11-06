import { describe, expect, it } from 'vitest';

import {
  inPageResourceBudget,
  PRINTABLE_CONTENT_WAIT_TIMEOUT_MS,
} from '../../src/main/pdf-export.js';

describe('printable-content wait budget', () => {
  it('reproduces the historical 15s/10s pair exactly', () => {
    // The inner bound used to be a second hard-coded constant. Deriving it is
    // only safe if the default export still spends precisely what it always
    // did — this pins that.
    expect(PRINTABLE_CONTENT_WAIT_TIMEOUT_MS).toBe(15_000);
    expect(inPageResourceBudget(PRINTABLE_CONTENT_WAIT_TIMEOUT_MS)).toBe(10_000);
  });

  it('keeps the per-resource bound strictly under the total, at any budget', () => {
    // The invariant the two constants encoded: one stalled image must drop out
    // on its own before the whole wait gives up, or every capture on a slow
    // network pays the full outer timeout. A caller on a 5s thumbnail budget
    // needs that property just as much as a 15s export does.
    for (const budget of [3_000, 5_000, 8_000, 15_000, 60_000]) {
      expect(inPageResourceBudget(budget)).toBeLessThan(budget);
      expect(inPageResourceBudget(budget)).toBeGreaterThan(0);
    }
  });

  it('never collapses to an unusable inner bound on a tiny budget', () => {
    // A near-zero budget would otherwise round the per-resource deadline to
    // zero and abandon every resource before it could possibly load.
    expect(inPageResourceBudget(100)).toBe(1_000);
    expect(inPageResourceBudget(0)).toBe(1_000);
  });
});
