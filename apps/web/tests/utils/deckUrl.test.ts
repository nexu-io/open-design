import { describe, expect, it } from 'vitest';
import { buildDeckEditUrl, isValidDeckId } from '../../src/utils/deckUrl';

// PR #568 P1 fix #2: the toolbar "Edit in Google Slides" link is
// rebuilt from result.json's `deckId` rather than trusting the
// `deckUrl` field verbatim. These tests pin the validator's
// behavior so a future refactor can't quietly relax the regex.
describe('buildDeckEditUrl / isValidDeckId', () => {
  it('accepts a Google Drive style id and emits docs.google.com URL', () => {
    const id = '1ImL0JjsQG1iXrzlNl3Fc3sok9ssF46OiLtTNRefOfyg';
    expect(isValidDeckId(id)).toBe(true);
    expect(buildDeckEditUrl(id)).toBe(
      `https://docs.google.com/presentation/d/${id}/edit`,
    );
  });

  it('accepts the underscore and hyphen characters Drive uses', () => {
    const id = 'Abc-123_DEF456';
    expect(isValidDeckId(id)).toBe(true);
    expect(buildDeckEditUrl(id)).toBe(
      `https://docs.google.com/presentation/d/${id}/edit`,
    );
  });

  // Reject vectors that the previous (raw deckUrl pass-through) code
  // would have surfaced as a clickable trusted link in the toolbar.
  it.each([
    ['javascript: scheme', 'javascript:alert(1)'],
    ['javascript: lowercase scheme via colon', 'javascript:void'],
    ['plain URL injection', 'https://attacker.example.com/phish'],
    ['relative path', '../../../etc/passwd'],
    ['path with slash', 'abc/def-ghi-jkl'],
    ['short id (< 10 chars)', 'abc'],
    ['empty string', ''],
    ['whitespace', '   '],
    ['contains colon', 'abc:def-ghi'],
    ['contains dot', 'abc.def-ghi'],
    ['contains query', 'abc?x=y-zzzzz'],
    ['contains fragment', 'abc#frag-ghij'],
    ['contains spaces', 'abc def ghi-jkl'],
  ])('rejects %s', (_label, value) => {
    expect(isValidDeckId(value)).toBe(false);
    expect(buildDeckEditUrl(value)).toBeNull();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['boolean', true],
    ['object', { id: 'abc' }],
  ])('rejects non-string %s', (_label, value) => {
    expect(isValidDeckId(value)).toBe(false);
    expect(buildDeckEditUrl(value)).toBeNull();
  });
});
