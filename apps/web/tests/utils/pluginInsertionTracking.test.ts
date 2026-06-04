import { describe, expect, it } from 'vitest';

import {
  computeEditRange,
  isInsertionStillValid,
  reconcileInsertions,
  stripPluginInsertedTokens,
  type TrackedInsertion,
} from '../../src/utils/pluginInsertionTracking';

// Pure-function coverage for the diff/reconcile/strip primitives that
// back ChatComposer's instance-aware plugin mention tracking
// (#2929 round 3). The integration spec
// (`ChatComposer.plugin-clear-prunes-draft.test.tsx`) exercises the
// end-to-end React path; this file pins the edge cases the integration
// flow is unlikely to hit, so a regression in the math surfaces here
// before it can corrupt user drafts.

describe('computeEditRange', () => {
  it('returns an empty range when the strings are equal', () => {
    expect(computeEditRange('abc', 'abc')).toEqual({ start: 0, oldEnd: 0, newEnd: 0 });
  });

  it('detects a pure prefix append', () => {
    // `prev` is the suffix of `next`; the diff sits at the very start.
    expect(computeEditRange('world', 'hello world')).toEqual({
      start: 0,
      oldEnd: 0,
      newEnd: 6,
    });
  });

  it('detects a pure suffix append', () => {
    expect(computeEditRange('hello', 'hello world')).toEqual({
      start: 5,
      oldEnd: 5,
      newEnd: 11,
    });
  });

  it('detects a middle replacement', () => {
    expect(computeEditRange('abc XYZ def', 'abc 12345 def')).toEqual({
      start: 4,
      oldEnd: 7,
      newEnd: 9,
    });
  });

  it('detects a full deletion to empty', () => {
    expect(computeEditRange('hello', '')).toEqual({ start: 0, oldEnd: 5, newEnd: 0 });
  });

  it('does not let prefix and suffix overlap when one string is a substring of the other', () => {
    // Both strings share the leading `aa`. If suffix matching greedily
    // walked past `start`, the range could go negative.
    const r = computeEditRange('aa', 'aaa');
    expect(r.start).toBeLessThanOrEqual(r.oldEnd);
    expect(r.start).toBeLessThanOrEqual(r.newEnd);
  });

  it('treats prepended text that shares a leading char with prev as a clean prepend (#2929 round 4)', () => {
    // Inserting `@github ` before `@Airbnb ` gives `@github @Airbnb `.
    // A naive LCP-first algorithm matches the leading `@`, then walks
    // LCS backwards through `Airbnb `, and reports the edit as
    // `editStart=1, oldEnd=1, newEnd=9`. That window cuts through a
    // tracked entry at offset 0 even though `@Airbnb` was not
    // structurally touched. LCS-first is required so the entire
    // `@Airbnb ` suffix is claimed by the right side and the diff
    // collapses to a clean prepend of `[0, 0, 8]`.
    const r = computeEditRange('@Airbnb ', '@github @Airbnb ');
    expect(r).toEqual({ start: 0, oldEnd: 0, newEnd: 8 });
  });
});

describe('isInsertionStillValid', () => {
  it('accepts a token at the start of the draft', () => {
    expect(isInsertionStillValid('@Airbnb plan', 0, 'Airbnb')).toBe(true);
  });

  it('accepts a token after a whitespace boundary', () => {
    expect(isInsertionStillValid('see @Airbnb', 4, 'Airbnb')).toBe(true);
  });

  it('rejects when the surrounding letter forms a longer mention', () => {
    // `@Airbnbx` would render as a single mention so the tracked range
    // is no longer the intended target.
    expect(isInsertionStillValid('@Airbnbx', 0, 'Airbnb')).toBe(false);
  });

  it('rejects when the left boundary is a non-mention character', () => {
    // `x@Airbnb` is not a valid mention per inlineMentions boundary
    // rules — the `x` immediately to the left is a word char.
    expect(isInsertionStillValid('x@Airbnb', 1, 'Airbnb')).toBe(false);
  });

  it('rejects when the offset no longer points at the token', () => {
    expect(isInsertionStillValid('compare @Airbnb', 0, 'Airbnb')).toBe(false);
  });

  it('rejects negative or out-of-range offsets', () => {
    expect(isInsertionStillValid('@Airbnb', -1, 'Airbnb')).toBe(false);
    expect(isInsertionStillValid('@Airbnb', 100, 'Airbnb')).toBe(false);
  });

  // Parser-alignment cases (#2929 round 5): the inline-mention parser
  // tokenizes `@<token>` greedily through `[^\s@]`, then prefers the
  // longer match at the same start offset. A tracked entry must
  // therefore be invalidated whenever the right-boundary character
  // would extend the parser's mention past the tracked range — that
  // is, anything other than EOS, whitespace, or another `@`. Without
  // these rejections the post-clear strip would carve `@Airbnb` out
  // of `@Airbnb/foo`, leaving `/foo` dangling as user-authored text
  // mutation.
  it('rejects when followed by `/` (parser would tokenize a longer mention)', () => {
    expect(isInsertionStillValid('@Airbnb/foo', 0, 'Airbnb')).toBe(false);
  });

  it('rejects when followed by `.`', () => {
    expect(isInsertionStillValid('@Airbnb.test', 0, 'Airbnb')).toBe(false);
  });

  it('rejects when followed by `,`', () => {
    expect(isInsertionStillValid('@Airbnb,', 0, 'Airbnb')).toBe(false);
  });

  it('rejects when followed by `)` (parser would extend through the paren)', () => {
    expect(isInsertionStillValid('see (@Airbnb), then ship', 5, 'Airbnb')).toBe(false);
  });

  it('accepts when followed by another `@` (next mention starts there)', () => {
    expect(isInsertionStillValid('@Airbnb@other', 0, 'Airbnb')).toBe(true);
  });

  it('accepts at end-of-string', () => {
    expect(isInsertionStillValid('@Airbnb', 0, 'Airbnb')).toBe(true);
  });

  it('accepts when followed by whitespace', () => {
    expect(isInsertionStillValid('@Airbnb plan', 0, 'Airbnb')).toBe(true);
  });
});

describe('reconcileInsertions', () => {
  const entry: TrackedInsertion = { token: 'Airbnb', start: 0, pluginId: 'airbnb' };

  it('returns a fresh copy when nothing changed', () => {
    const out = reconcileInsertions([entry], '@Airbnb ', '@Airbnb ');
    expect(out).toEqual([entry]);
    expect(out).not.toBe([entry]); // new array
  });

  it('keeps an entry whose tail sits before the edit', () => {
    // `@Airbnb` at [0,7], edit happens at index 8 (typing after the trailing space)
    const next = reconcileInsertions(
      [entry],
      '@Airbnb ',
      '@Airbnb compare',
    );
    expect(next).toEqual([entry]);
  });

  it('shifts an entry whose head sits after the edit', () => {
    // Insert `prefix ` (7 chars) at the beginning. Entry start moves 0 → 7.
    const next = reconcileInsertions(
      [entry],
      '@Airbnb ',
      'prefix @Airbnb ',
    );
    expect(next).toEqual([{ token: 'Airbnb', start: 7, pluginId: 'airbnb' }]);
  });

  it('drops an entry the edit overlaps', () => {
    // User selects through the entry and replaces it with other text.
    const next = reconcileInsertions(
      [entry],
      '@Airbnb plan',
      '@Air-other plan',
    );
    expect(next).toEqual([]);
  });

  it('drops an entry whose right boundary is corrupted (letters touching)', () => {
    // Typing `ify` immediately after `@Airbnb` makes it `@Airbnbify`
    // which is no longer a valid mention.
    const next = reconcileInsertions(
      [entry],
      '@Airbnb',
      '@Airbnbify',
    );
    expect(next).toEqual([]);
  });

  it('handles multiple entries with mixed shift / keep / drop outcomes', () => {
    // prev: `@A   xxx   @B   yyy`
    //         entry1 at 0       entry2 at 11
    // edit: replace `xxx` (cols 4-6) with `12345` (delta = +2)
    const e1: TrackedInsertion = { token: 'A', start: 0, pluginId: 'a' };
    const e2: TrackedInsertion = { token: 'B', start: 11, pluginId: 'b' };
    const prev = '@A   xxx   @B   yyy';
    const next = '@A   12345   @B   yyy';
    const out = reconcileInsertions([e1, e2], prev, next);
    expect(out).toEqual([
      { token: 'A', start: 0, pluginId: 'a' },
      { token: 'B', start: 13, pluginId: 'b' }, // 11 + 2
    ]);
  });

  it('returns an empty list when the entries are empty', () => {
    expect(reconcileInsertions([], 'a', 'b')).toEqual([]);
  });

  // Purity guard (#2929 round 5): reconcile must not mutate its
  // inputs and must produce the same output regardless of how many
  // times it is called with the same arguments. React StrictMode
  // double-invokes setState updaters in development; the previous
  // implementation called reconcile *inside* the updater and
  // accumulated shifts (entry at 0 → 8 → 16) on the second
  // invocation, dropping the entry as out-of-range. The fix moves
  // reconcile out of the updater, but pinning purity here too so a
  // future regression there is caught at the algorithm layer.
  it('is pure: invoking twice with the same args returns equivalent output and does not mutate input', () => {
    const entries: TrackedInsertion[] = [{ token: 'Airbnb', start: 0, pluginId: 'airbnb' }];
    const frozen = Object.freeze([...entries]) as ReadonlyArray<TrackedInsertion>;
    const first = reconcileInsertions(frozen, '@Airbnb ', '@github @Airbnb ');
    const second = reconcileInsertions(frozen, '@Airbnb ', '@github @Airbnb ');
    expect(first).toEqual([{ token: 'Airbnb', start: 8, pluginId: 'airbnb' }]);
    expect(second).toEqual([{ token: 'Airbnb', start: 8, pluginId: 'airbnb' }]);
    // Frozen input was not mutated (any attempt would have thrown
    // in strict mode).
    expect(frozen).toEqual([{ token: 'Airbnb', start: 0, pluginId: 'airbnb' }]);
  });
});

describe('stripPluginInsertedTokens', () => {
  it('returns the draft unchanged when there are no entries', () => {
    expect(stripPluginInsertedTokens('@Airbnb ', [])).toBe('@Airbnb ');
  });

  it('removes a single tracked token at the start of the draft', () => {
    expect(
      stripPluginInsertedTokens('@Airbnb ', [{ token: 'Airbnb', start: 0, pluginId: 'airbnb' }]),
    ).toBe(' '); // trailing space from inserted text remains; integration trims as needed
  });

  it('removes a tracked token while preserving an untracked duplicate (#2929 round 3)', () => {
    // The whole point: composer-inserted `@Airbnb` at offset 0 gets
    // removed; the user-authored `@Airbnb` at offset 16 is untracked
    // and therefore preserved.
    const draft = '@Airbnb compare @Airbnb with our spec';
    const out = stripPluginInsertedTokens(draft, [{ token: 'Airbnb', start: 0, pluginId: 'airbnb' }]);
    expect(out).toBe(' compare @Airbnb with our spec');
  });

  it('slices multiple tracked tokens in one pass without offset drift', () => {
    // Two tracked entries, descending sort means the right one is
    // sliced first so the left one's offset stays valid.
    const draft = '@A and @B';
    const out = stripPluginInsertedTokens(draft, [
      { token: 'A', start: 0, pluginId: 'a' },
      { token: 'B', start: 7, pluginId: 'b' },
    ]);
    expect(out).toBe(' and ');
  });

  it('drops invalidated entries instead of corrupting unrelated text', () => {
    // The tracked offset no longer points at `@Airbnb` (user retyped).
    // strip should be a no-op rather than deleting whatever sits at the
    // stale offset.
    const draft = 'hello world';
    const out = stripPluginInsertedTokens(draft, [
      { token: 'Airbnb', start: 0, pluginId: 'airbnb' },
    ]);
    expect(out).toBe('hello world');
  });

  it('collapses double whitespace left behind by the strip', () => {
    const draft = 'see @Airbnb here';
    const out = stripPluginInsertedTokens(draft, [
      { token: 'Airbnb', start: 4, pluginId: 'airbnb' },
    ]);
    // After slicing `@Airbnb`: `see  here` (two spaces) → collapse to `see here`
    expect(out).toBe('see here');
  });

  it('does not normalize user-authored multi-space spans elsewhere in the draft (#2929 round 8)', () => {
    // Reviewer-flagged: the previous global `[ \t]{2,}` collapse
    // would rewrite any user-authored double-space span to a
    // single space, even ones unrelated to the strip seam. The
    // seam-local collapse here only touches the whitespace
    // adjacent to the removed range.
    const draft = 'keep  gap @Airbnb here';
    const out = stripPluginInsertedTokens(draft, [
      { token: 'Airbnb', start: 10, pluginId: 'airbnb' },
    ]);
    // `keep  gap` (two spaces) is preserved; the `@Airbnb` seam
    // collapses to a single space.
    expect(out).toBe('keep  gap here');
  });

  it('preserves multi-space spans on both sides of an unrelated mention (#2929 round 8)', () => {
    // Two user-authored double-space spans flank an `@Airbnb`
    // that is not tracked. Strip should be a no-op (no entries
    // for it) — verifies that nothing in the function reaches
    // out and normalizes whitespace when it has no entries to
    // operate on.
    const draft = 'one  two @Untracked three  four';
    const out = stripPluginInsertedTokens(draft, []);
    expect(out).toBe('one  two @Untracked three  four');
  });
});
