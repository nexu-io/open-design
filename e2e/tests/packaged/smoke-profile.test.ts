import { describe, expect, it } from 'vitest';

import { resolvePackagedSmokeProfile } from '@/vitest/packaged-smoke-profile';

// The packaged smoke's coverage profile reaches `win.spec.ts` through three
// layers, and every one of them handles "nothing was chosen" differently:
//
//   1. `notify-release-feishu.yml` computes the mode with a `||` chain whose
//      last arm yields `''` for any branch its special cases do not name.
//   2. A `workflow_call` `default:` only applies when the input is *omitted*.
//      Passing `''` is not omission, so the declared `core` default never
//      fires.
//   3. `??` falls back only on `null`/`undefined`, so an empty environment
//      variable survives it.
//
// On `release/v0.18.1` that produced `verifyCoreOnly === ('' === 'core')`,
// i.e. `false`: the run took the `full` path, demanded the updater fixture that
// only a genuine `full` request wires up, and died before the smoke started —
// on the branch-cut commit, before anything else had landed there.
// `release/v0.18.0` hid it because its branch name matched a special case that
// produced `skip`, so the smoke never ran at all.
//
// The invariant these pin: an absent value must never read as a *different*
// profile. Empty means unset means `core`; anything unrecognised is an error,
// not a silent "not core".
describe('packaged smoke profile', () => {
  it('defaults to core when the workflow passes an empty string', () => {
    expect(resolvePackagedSmokeProfile('')).toBe('core');
  });

  it('defaults to core when the variable is unset', () => {
    expect(resolvePackagedSmokeProfile(undefined)).toBe('core');
    expect(resolvePackagedSmokeProfile(null)).toBe('core');
  });

  it('defaults to core when the value is only whitespace', () => {
    expect(resolvePackagedSmokeProfile('   ')).toBe('core');
  });

  it('keeps each explicitly requested profile', () => {
    expect(resolvePackagedSmokeProfile('core')).toBe('core');
    expect(resolvePackagedSmokeProfile('full')).toBe('full');
    expect(resolvePackagedSmokeProfile('skip')).toBe('skip');
  });

  it('trims an accidentally padded value rather than treating it as unknown', () => {
    expect(resolvePackagedSmokeProfile(' full ')).toBe('full');
  });

  it('rejects an unrecognised profile instead of letting it read as not-core', () => {
    // A typo must not quietly select the updater path the way `''` did.
    expect(() => resolvePackagedSmokeProfile('fulll')).toThrow(/unsupported packaged smoke profile/);
    expect(() => resolvePackagedSmokeProfile('CORE')).toThrow(/unsupported packaged smoke profile/);
  });

  it('never resolves an empty value to something that is not core', () => {
    // The failure mode stated as an invariant: whatever emptiness looks like,
    // it must not end up selecting a profile that changes what the smoke does.
    for (const empty of ['', '  ', '\t', '\n', undefined, null]) {
      expect(resolvePackagedSmokeProfile(empty as string | undefined | null)).toBe('core');
    }
  });
});
