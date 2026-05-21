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

    it('handles the exact long filename shape from the issue screenshot', () => {
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

    it('Electron od: protocol', () => {
      expect(asInProjectFilePath('od://app/projects/123')).toBeNull();
    });

    it('blob: URLs', () => {
      expect(asInProjectFilePath('blob:https://example.com/abc')).toBeNull();
    });

    it('file:// URLs (NOT in-project relative paths)', () => {
      expect(asInProjectFilePath('file:///etc/passwd')).toBeNull();
    });

    it('javascript: scheme is refused even though it matches the RFC grammar', () => {
      expect(asInProjectFilePath('javascript:alert(1)')).toBeNull();
    });
  });

  describe('passes through (returns null) — non-link or unsafe shapes', () => {
    it('null', () => {
      expect(asInProjectFilePath(null)).toBeNull();
    });

    it('undefined', () => {
      expect(asInProjectFilePath(undefined)).toBeNull();
    });

    it('empty string', () => {
      expect(asInProjectFilePath('')).toBeNull();
    });

    it('whitespace-only string', () => {
      expect(asInProjectFilePath('   ')).toBeNull();
    });

    it('#fragment-only — anchor within the same document', () => {
      expect(asInProjectFilePath('#section')).toBeNull();
    });

    it('absolute path starting with / — could mean filesystem root in Electron', () => {
      expect(asInProjectFilePath('/abs/path.html')).toBeNull();
    });

    it('parent-traversal `..` — refuses to climb out of the project root', () => {
      expect(asInProjectFilePath('..')).toBeNull();
    });

    it('relative path that walks up via .. — refused', () => {
      expect(asInProjectFilePath('../sibling.html')).toBeNull();
    });

    it('mid-path .. segment is still refused', () => {
      expect(asInProjectFilePath('a/../b.html')).toBeNull();
    });
  });
});
