/**
 * Independent coverage for every Critique Theater i18n key that the
 * critique-coverage walker (Phase 13.2) requires the test corpus to
 * mention at least once.
 *
 * The walker's intent: rename drift between contract / reducer / i18n /
 * CSS gets caught BEFORE it ships. For string-level rename catching to
 * work, an INDEPENDENT test (not the walker file itself, which was
 * previously satisfying its own assertions, see lefarcen P2 on PR #1318)
 * has to reference each watched symbol. Component tests like
 * `TheaterStage.test.tsx` and `TheaterCollapsed.test.tsx` exercise the
 * rendered output of those keys via `getByText('Shipped at round 1')`,
 * but they don't mention the key STRING (`critiqueTheater.shippedSummary`),
 * so the walker would not see them.
 *
 * This file closes that gap: every critiqueTheater.* key the walker
 * watches is named here and asserted to resolve through the dict to a
 * non-empty translated value. That makes the walker's TEST_CORPUS
 * assertion provable AND independently catches the case where a
 * production rename leaves the dict pointing at a stale key.
 */

import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/locales/en';

// Typed against the en dictionary so a renamed/removed key fails the
// type check immediately. lefarcen P1 on PR #1318: the previous broad
// `as Record<string, string>` cast tripped CI's TS2352 because `Dict`
// has no string index signature.
const WATCHED_KEYS: readonly (keyof typeof en)[] = [
  'critiqueTheater.userFacingName',
  'critiqueTheater.roundLabel',
  'critiqueTheater.composite',
  'critiqueTheater.threshold',
  'critiqueTheater.interrupt',
  'critiqueTheater.interrupted',
  'critiqueTheater.degradedHeading',
  'critiqueTheater.shippedSummary',
  'critiqueTheater.interruptedSummary',
];

describe('Critique Theater i18n key coverage (Phase 13.2 walker support)', () => {
  for (const key of WATCHED_KEYS) {
    it(`exposes ${key} on the en dictionary as a non-empty string`, () => {
      const value = en[key];
      expect(typeof value).toBe('string');
      expect((value ?? '').length).toBeGreaterThan(0);
    });
  }
});
