import { describe, expect, it } from 'vitest';
import type { RoleWeights } from '@open-design/contracts/critique';
import { computeComposite, type RoleScores } from '../../src/critique/scoreboard.js';

// Default weights mirror defaultCritiqueConfig() in packages/contracts/src/critique.ts:
// designer 0, critic 0.4, brand 0.2, a11y 0.2, copy 0.2. The composite formula
// redistributes weight proportionally across roles that actually provided a
// score, so absent panelists never silently anchor the composite to zero.
const DEFAULT_WEIGHTS: RoleWeights = {
  designer: 0,
  critic: 0.4,
  brand: 0.2,
  a11y: 0.2,
  copy: 0.2,
};

describe('computeComposite', () => {
  it('returns 0 when no role has a score', () => {
    // Spec § Composite score formula: empty input degenerates to zero so the
    // round's mustFix gate still has a numeric composite to compare against.
    expect(computeComposite({}, DEFAULT_WEIGHTS)).toBe(0);
  });

  it('weights all present roles per the configured RoleWeights map', () => {
    // designer is weighted at 0, so its score drops out entirely even when
    // present. critic/brand/a11y/copy together carry the full weight.
    const scores: RoleScores = { designer: 10, critic: 8, brand: 6, a11y: 9, copy: 7 };
    // 0.4*8 + 0.2*6 + 0.2*9 + 0.2*7 = 3.2 + 1.2 + 1.8 + 1.4 = 7.6
    expect(computeComposite(scores, DEFAULT_WEIGHTS)).toBeCloseTo(7.6, 9);
  });

  it('redistributes weight proportionally when only a subset of roles scored', () => {
    // Only critic and brand reported. Their nominal weights sum to 0.6, so
    // each contribution is scaled by its share of that 0.6, not the full 1.0.
    // (0.4/0.6)*9 + (0.2/0.6)*6 = 6 + 2 = 8.
    const scores: RoleScores = { critic: 9, brand: 6 };
    expect(computeComposite(scores, DEFAULT_WEIGHTS)).toBeCloseTo(8, 9);
  });

  it('returns the raw score when a single role with non-zero weight scored', () => {
    // Single present role with non-zero weight: redistribution collapses to
    // weight/weight=1, so the composite equals the raw score.
    expect(computeComposite({ critic: 7 }, DEFAULT_WEIGHTS)).toBeCloseTo(7, 9);
  });

  it('returns 0 when the only present role has zero configured weight', () => {
    // designer carries weight 0 in the default config. If designer is the
    // only panelist that scored, totalWeight collapses to ~0 and the function
    // returns 0 rather than dividing by zero.
    expect(computeComposite({ designer: 9 }, DEFAULT_WEIGHTS)).toBe(0);
  });

  it('handles fractional weights and fractional scores without precision drift', () => {
    // Custom weights that are deliberately not round fractions, paired with
    // fractional scores, to guard against accumulated rounding error in the
    // weighted-sum reducer.
    const weights: RoleWeights = {
      designer: 0.1,
      critic: 0.35,
      brand: 0.15,
      a11y: 0.25,
      copy: 0.15,
    };
    const scores: RoleScores = { designer: 8.5, critic: 7.25, brand: 9.1, a11y: 6.4, copy: 8.0 };
    // Sum: 0.1*8.5 + 0.35*7.25 + 0.15*9.1 + 0.25*6.4 + 0.15*8.0
    //    = 0.85 + 2.5375 + 1.365 + 1.6 + 1.2 = 7.5525
    expect(computeComposite(scores, weights)).toBeCloseTo(7.5525, 9);
  });
});
