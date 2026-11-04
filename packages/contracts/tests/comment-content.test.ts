import { describe, expect, it } from 'vitest';
import { COMMENT_MAX_CHARACTERS, countCommentCharacters, normalizeCommentContent } from '../src/api/comments.js';

describe('canonical comment content', () => {
  it('normalizes CRLF and lone CR before trimming and counting', () => {
    expect(normalizeCommentContent(' \r\nfirst\r\nsecond\rthird\r ')).toBe('first\nsecond\nthird');
    expect(countCommentCharacters('a\r\nb\rc')).toBe(5);
    expect(normalizeCommentContent(' \r\n\r\t ')).toBe('');
  });
  it('preserves complete emoji graphemes and the 400/401 boundary with line endings', () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const note = '👨‍👩‍👧‍👦'.repeat(199) + eol + '👨‍👩‍👧‍👦'.repeat(200);
      expect(countCommentCharacters(' ' + note + eol)).toBe(COMMENT_MAX_CHARACTERS);
      expect(countCommentCharacters(note + '😀')).toBe(COMMENT_MAX_CHARACTERS + 1);
    }
  });
});
