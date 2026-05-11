import { describe, expect, it } from 'vitest';
import { asInProjectFilePath } from '../../src/runtime/in-project-link';

describe('asInProjectFilePath', () => {
  describe('intercepts (returns normalized path)', () => {
    it('bare filename → unchanged', () => {
      expect(asInProjectFilePath('template.html')).toBe('template.html');
    });

    it('strips a leading ./ prefix', () => {
      expect(asInProjectFilePath('./template.html')).toBe('template.html');
    });

    it('keeps subdirectory paths intact', () => {
      expect(asInProjectFilePath('subdir/hero.html')).toBe('subdir/hero.html');
    });

    it('strips ./ in front of a subdirectory path', () => {
      expect(asInProjectFilePath('./subdir/hero.html')).toBe('subdir/hero.html');
    });

    it('drops a trailing query string', () => {
      expect(asInProjectFilePath('template.html?v=2')).toBe('template.html');
    });

    it('drops a trailing fragment', () => {
      expect(asInProjectFilePath('template.html#section')).toBe('template.html');
    });

    it('drops both query and fragment together', () => {
      expect(asInProjectFilePath('template.html?v=2#section')).toBe('template.html');
    });

    it('trims surrounding whitespace from the href', () => {
      expect(asInProjectFilePath('  template.html  ')).toBe('template.html');
    });

    it('handles long, real-world chat output filenames', () => {
      // The exact shape shown in the issue screenshot.
      expect(asInProjectFilePath('orbit-daily-digest-general-2026-05-11.html'))
        .toBe('orbit-daily-digest-general-2026-05-11.html');
    });
  });

  describe('passes through (returns null) — external schemes', () => {
    it('http://', () => {
      expect(asInProjectFilePath('http://example.com/x')).toBeNull();
    });

    it('https://', () => {
      expect(asInProjectFilePath('https://example.com/x')).toBeNull();
    });

    it('mailto:', () => {
      expect(asInProjectFilePath('mailto:foo@bar.com')).toBeNull();
    });

    it('the Electron od: protocol', () => {
      expect(asInProjectFilePath('od://app/projects/123')).toBeNull();
    });

    it('blob: URLs', () => {
      expect(asInProjectFilePath('blob:https://example.com/abc')).toBeNull();
    });

    it('file: URLs (these are NOT in-project relative paths)', () => {
      expect(asInProjectFilePath('file:///etc/passwd')).toBeNull();
    });

    it('hyphen-and-digit schemes still match the RFC 3986 grammar', () => {
      // e.g. some custom protocol like `web+tel:` — anything matching
      // `^[a-z][a-z0-9+.-]*:` per the RFC. The point is to be safe,
      // not to enumerate every scheme.
      expect(asInProjectFilePath('web+tel:123')).toBeNull();
    });
  });

  describe('passes through (returns null) — non-link or unsafe shapes', () => {
    it('null / undefined / non-string', () => {
      expect(asInProjectFilePath(null)).toBeNull();
      expect(asInProjectFilePath(undefined)).toBeNull();
      // @ts-expect-error — intentional bad input to verify runtime guard
      expect(asInProjectFilePath(42)).toBeNull();
    });

    it('empty / whitespace-only', () => {
      expect(asInProjectFilePath('')).toBeNull();
      expect(asInProjectFilePath('   ')).toBeNull();
    });

    it('pure fragment (intra-page anchor)', () => {
      expect(asInProjectFilePath('#section')).toBeNull();
    });

    it('absolute path starting with /', () => {
      // Could mean filesystem root in Electron and is not what the
      // assistant means when it writes a chat file link; default
      // browser behavior is the safer fallback.
      expect(asInProjectFilePath('/etc/passwd')).toBeNull();
      expect(asInProjectFilePath('/some/file.html')).toBeNull();
    });

    it('a path with .. traversal anywhere', () => {
      expect(asInProjectFilePath('..')).toBeNull();
      expect(asInProjectFilePath('../sibling.html')).toBeNull();
      expect(asInProjectFilePath('subdir/../escape.html')).toBeNull();
      expect(asInProjectFilePath('a/b/../c.html')).toBeNull();
    });

    it('href that strips to empty after query/fragment removal', () => {
      // Pathological but possible — a chat message with `[label](?foo)`.
      expect(asInProjectFilePath('?foo')).toBeNull();
      expect(asInProjectFilePath('#')).toBeNull();
    });
  });
});
