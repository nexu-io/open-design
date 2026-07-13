// @vitest-environment jsdom

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

    it('decodes percent-encoded filenames so the workspace tab opener matches the on-disk file', () => {
      // Chat markdown frequently emits links like
      // `[Mock page](Mock%20Page.html)` because the autolink path
      // percent-encodes spaces. The workspace tab opener
      // (`requestOpenFile` → `FileWorkspace`) matches by literal
      // on-disk file name, so handing it the raw `Mock%20Page.html`
      // would silently miss the existing tab. Decode the result
      // before returning. Earlier draft PR #1255 hit this exact
      // miss in review (mrcfps / lefarcen P2).
      expect(asInProjectFilePath('Mock%20Page.html')).toBe('Mock Page.html');
    });

    it('decodes percent-encoded subdirectory paths', () => {
      expect(asInProjectFilePath('Visual%20Direction/hero%20alt.html')).toBe(
        'Visual Direction/hero alt.html',
      );
    });

    it('decodes non-ASCII (UTF-8 percent-encoded) filenames', () => {
      // Chinese / Cyrillic / accented filenames percent-encode into
      // multi-byte sequences. `decodeURIComponent` handles them
      // correctly; the catch arm below keeps malformed encodings
      // from throwing.
      expect(asInProjectFilePath('%E9%A6%96%E9%A1%B5.html')).toBe('首页.html');
    });

    it('extracts project raw file URLs produced by assistant file links', () => {
      expect(asInProjectFilePath('/api/projects/project-1/raw/mutuals-v2.html')).toBe('mutuals-v2.html');
    });

    it('extracts project raw file URLs only when the route project matches the current project', () => {
      expect(asInProjectFilePath('/api/projects/project-1/raw/mutuals-v2.html', undefined, 'project-1')).toBe(
        'mutuals-v2.html',
      );
      expect(asInProjectFilePath('/api/projects/other-project/raw/index.html', new Set(['index.html']), 'project-1'))
        .toBeNull();
    });

    it('extracts same-origin absolute project raw file URLs', () => {
      expect(asInProjectFilePath(`${window.location.origin}/api/projects/project-1/raw/mutuals-v2.html`)).toBe(
        'mutuals-v2.html',
      );
    });

    it('matches local absolute paths against known project files', () => {
      expect(
        asInProjectFilePath(
          '/Users/mac/open-design/open-design-preview-0.10.0/projects/Web%20Prototype/index.html',
          new Set(['index.html']),
        ),
      ).toBe('index.html');
    });

    it('keeps unknown local absolute paths as normal links', () => {
      expect(
        asInProjectFilePath(
          '/Users/mac/open-design/open-design-preview-0.10.0/projects/Web%20Prototype/index.html',
          new Set(['summary.html']),
        ),
      ).toBeNull();
    });

    it('extracts encoded project raw file paths with nested folders', () => {
      expect(asInProjectFilePath('/api/projects/project-1/raw/Web%20Prototype/mutuals-v2.html?v=2')).toBe(
        'Web Prototype/mutuals-v2.html',
      );
    });

    it('extracts project file routes from workspace links', () => {
      expect(asInProjectFilePath('/projects/project-1/files/mutuals-v2.html')).toBe('mutuals-v2.html');
      expect(asInProjectFilePath('/projects/project-1/conversations/conv-1/files/mutuals-v2.html')).toBe(
        'mutuals-v2.html',
      );
    });

    it('extracts workspace file routes only when the route project matches the current project', () => {
      expect(asInProjectFilePath('/projects/project-1/files/mutuals-v2.html', undefined, 'project-1')).toBe(
        'mutuals-v2.html',
      );
      expect(asInProjectFilePath('/projects/other-project/files/index.html', new Set(['index.html']), 'project-1'))
        .toBeNull();
    });

    it('returns null for malformed percent-encoding rather than throwing', () => {
      // A stray `%` (e.g. `Read%this.html` where the user meant a
      // literal percent) makes decodeURIComponent throw a URIError.
      // We never want a chat link to crash the renderer — fall
      // through to the default browser behavior instead.
      expect(asInProjectFilePath('Read%this.html')).toBeNull();
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

    it('refuses a `..` segment smuggled in via percent-encoding (`%2E%2E`)', () => {
      // Decoding happens after the literal-`..` check; without an
      // additional post-decode check a hostile chat link could
      // bypass the traversal guard by writing `%2E%2E/secret.html`
      // and the workspace opener would receive `../secret.html`.
      expect(asInProjectFilePath('%2E%2E/secret.html')).toBeNull();
      expect(asInProjectFilePath('a/%2E%2E/b.html')).toBeNull();
    });
  });
});
