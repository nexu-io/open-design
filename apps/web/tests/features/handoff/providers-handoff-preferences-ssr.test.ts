// @vitest-environment node
//
// `readPreferredFramework` guards its localStorage read with an explicit
// `typeof window === 'undefined'` check (unreachable under jsdom, where
// `window` always exists) — this companion suite runs with no `window` global
// at all to exercise that branch for real. The other three bridge functions
// rely on try/catch (no explicit `typeof` guard); under node `window` is a
// ReferenceError on access, so their catch branches run for real here too.
import { describe, expect, it } from 'vitest';
import {
  readPreferredEditor,
  readPreferredFramework,
  writePreferredEditor,
  writePreferredFramework,
} from '../../../src/providers/handoff-preferences';

describe('handoff-preferences SSR fallbacks (no window)', () => {
  it('has no window in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  it('readPreferredFramework short-circuits to the default via the explicit typeof guard', () => {
    expect(readPreferredFramework()).toBe('react');
  });

  it('readPreferredEditor returns null instead of throwing', () => {
    expect(readPreferredEditor()).toBeNull();
  });

  it('writePreferredEditor / writePreferredFramework no-op instead of throwing', () => {
    expect(() => writePreferredEditor('cursor')).not.toThrow();
    expect(() => writePreferredFramework('vue')).not.toThrow();
  });
});
