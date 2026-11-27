import { describe, expect, it } from 'vitest';

import { sanitizeArchiveFilename } from '../src/projects/archive-filename.js';

describe('sanitizeArchiveFilename', () => {
  it.each(['🚀', '𠀀'])('does not split %s at the filename length limit', (character) => {
    const prefix = 'a'.repeat(79);
    const filename = sanitizeArchiveFilename(prefix + character);

    expect(() => encodeURIComponent(`${filename}.zip`)).not.toThrow();
    expect(filename).toBe(prefix);
    expect(filename.length).toBeLessThanOrEqual(80);
  });

  it('replaces isolated surrogates before filename header encoding', () => {
    const filename = sanitizeArchiveFilename('bad-\ud800-middle-\udc00');

    expect(() => encodeURIComponent(`${filename}.zip`)).not.toThrow();
    expect(filename).toBe('bad-\ufffd-middle-\ufffd');
  });

  it('preserves a complete non-BMP character ending exactly at the limit', () => {
    const title = 'a'.repeat(78) + '🚀';
    const filename = sanitizeArchiveFilename(title);

    expect(filename).toBe(title);
    expect(decodeURIComponent(encodeURIComponent(filename))).toBe(title);
  });

  it('keeps complete surrogate pairs when truncating repeated characters', () => {
    expect(sanitizeArchiveFilename('🚀'.repeat(41))).toBe('🚀'.repeat(40));
  });

  it('preserves Chinese, accents, and legal punctuation', () => {
    expect(sanitizeArchiveFilename('  中文 café (v2).final  ')).toBe('中文-café-(v2).final');
  });

  it('keeps the existing forbidden-character and whitespace sanitization', () => {
    expect(sanitizeArchiveFilename('  my:/design\u0000\t file?  ')).toBe('my__design-file_');
  });

  it('keeps the ASCII length limit and empty fallback contract', () => {
    expect(sanitizeArchiveFilename('a'.repeat(100))).toBe('a'.repeat(80));
    expect(sanitizeArchiveFilename(null)).toBe('');
  });
});
