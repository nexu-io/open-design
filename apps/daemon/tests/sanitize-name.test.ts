import { describe, expect, it } from 'vitest';
import { decodeMultipartFilename, sanitizeName } from '../src/projects.js';

describe('sanitizeName', () => {
  it('keeps ASCII letters, digits, dot, dash, underscore as-is', () => {
    expect(sanitizeName('Report_v2.final-1.pdf')).toBe('Report_v2.final-1.pdf');
  });

  it('collapses whitespace runs to a single dash', () => {
    expect(sanitizeName('Hello World  page.html')).toBe('Hello-World-page.html');
  });

  it('preserves Unicode letters/digits (Chinese, Japanese, Cyrillic, accented)', () => {
    expect(sanitizeName('测试文档-中文文件名.docx')).toBe('测试文档-中文文件名.docx');
    expect(sanitizeName('資料.pdf')).toBe('資料.pdf');
    expect(sanitizeName('Cafe-naïveté.docx')).toBe('Cafe-naïveté.docx');
    expect(sanitizeName('документ.txt')).toBe('документ.txt');
  });

  it('replaces path separators with underscore', () => {
    expect(sanitizeName('a/b\\c.txt')).toBe('a_b_c.txt');
  });

  it('replaces reserved punctuation with underscore', () => {
    expect(sanitizeName('a:b*c?d.txt')).toBe('a_b_c_d.txt');
  });

  it('rewrites leading dot runs to underscore so dotfiles cannot land on disk', () => {
    expect(sanitizeName('..hidden.txt')).toBe('_hidden.txt');
  });

  it('falls back to a generated name when the input is empty after cleanup', () => {
    const out = sanitizeName('');
    expect(out).toMatch(/^file-\d+$/);
  });
});

describe('decodeMultipartFilename', () => {
  it('restores UTF-8 names that multer parsed as latin1', () => {
    // multer@1 hands callers the latin1 decoding of the multipart bytes.
    // Re-encoding 'measure' to latin1 lets us simulate that exact input.
    const utf8 = '测试文档-中文文件名.docx';
    const latin1 = Buffer.from(utf8, 'utf8').toString('latin1');
    expect(decodeMultipartFilename(latin1)).toBe(utf8);
  });

  it('leaves genuine latin1 names untouched when bytes do not form valid UTF-8', () => {
    // 0xE9 alone is not valid UTF-8 — keep the raw latin1 representation.
    const latin1Only = Buffer.from([0x43, 0x61, 0x66, 0xe9]).toString('latin1');
    expect(decodeMultipartFilename(latin1Only)).toBe(latin1Only);
  });

  it('round-trips ASCII names without modification', () => {
    expect(decodeMultipartFilename('plain.txt')).toBe('plain.txt');
  });

  it('treats empty input as a no-op', () => {
    expect(decodeMultipartFilename('')).toBe('');
  });

  it('returns input untouched when any code point exceeds 0xff', () => {
    // Simulates multer receiving an RFC 5987 `filename*` parameter and
    // decoding it to UTF-8 itself. Re-decoding would corrupt the name.
    const alreadyDecoded = '测试文档.docx';
    expect(decodeMultipartFilename(alreadyDecoded)).toBe(alreadyDecoded);
  });

  it('handles null and undefined defensively', () => {
    expect(decodeMultipartFilename(null as unknown as string)).toBe('');
    expect(decodeMultipartFilename(undefined as unknown as string)).toBe('');
  });
});
