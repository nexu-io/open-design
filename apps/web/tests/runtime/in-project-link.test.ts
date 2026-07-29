// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  asInProjectFilePath,
  isPathLikeChatHref,
  resolveChatFileLink,
} from '../../src/runtime/in-project-link';

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

describe('resolveChatFileLink (issue: chatpane file links opening a home-page window)', () => {
  describe('current-project targets (delegates to asInProjectFilePath)', () => {
    it('resolves a bare relative filename to a workspace file', () => {
      expect(resolveChatFileLink('template.html', undefined, 'project-1')).toEqual({
        kind: 'workspace-file',
        filePath: 'template.html',
      });
    });

    it('resolves a matching-route raw URL to a workspace file', () => {
      expect(
        resolveChatFileLink('/api/projects/project-1/raw/mutuals-v2.html', undefined, 'project-1'),
      ).toEqual({ kind: 'workspace-file', filePath: 'mutuals-v2.html' });
    });

    it('prefers the current project when a disk path names the current project', () => {
      // The `/projects/<seg>/` segment IS the current project id, so the
      // file opens in the current workspace — regardless of whether the
      // basename also appears in `projectFileNames`.
      expect(
        resolveChatFileLink(
          '/Users/mac/open-design/data/projects/project-1/index.html',
          new Set(['index.html']),
          'project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'index.html' });
    });

    it('still matches non-managed absolute paths against known project files', () => {
      // Absolute paths WITHOUT a `/projects/<seg>/` boundary keep the
      // known-file basename fallback (imported-folder projects reference
      // current-project files by external absolute path).
      expect(
        resolveChatFileLink(
          '/Users/mac/my-workspace/site/index.html',
          new Set(['index.html']),
          'project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'index.html' });
    });
  });

  describe('cross-project targets (the 0.14.1 acceptance scenario)', () => {
    it('resolves a workspace file route for another project instead of falling through', () => {
      expect(
        resolveChatFileLink('/projects/other-project/files/index.html', new Set(['index.html']), 'project-1'),
      ).toEqual({ kind: 'project-file', projectId: 'other-project', filePath: 'index.html' });
    });

    it('resolves a raw API route for another project instead of falling through', () => {
      expect(
        resolveChatFileLink('/api/projects/other-project/raw/deck-outline.md', undefined, 'project-1'),
      ).toEqual({ kind: 'project-file', projectId: 'other-project', filePath: 'deck-outline.md' });
    });

    it('prefers a current-project file match over a colliding UNPROVEN disk path', () => {
      // `index.html` exists in the current project AND the disk path names a
      // `/projects/<seg>/` boundary — but without `projectResolvedDir` the
      // client cannot positively prove the segment is another project (it is
      // just as likely a legacy name-keyed or imported-folder directory —
      // the maintained contract in e2e/ui/project-file-link-routing.test.ts),
      // so the current-project basename fallback wins.
      expect(
        resolveChatFileLink(
          '/Users/mac/.open-design/data/projects/other-project/index.html',
          new Set(['index.html']),
          'project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'index.html' });
    });

    it('routes a colliding disk path to its PROVEN owning project when resolvedDir reveals the managed root', () => {
      // With the current project's daemon-resolved dir known, a sibling
      // directory under the same managed projects root provably belongs to
      // that other project — proof outranks the basename fallback, so the
      // same-named current-project file no longer captures the click.
      expect(
        resolveChatFileLink(
          '/Users/mac/.open-design/data/projects/other-project/index.html',
          new Set(['index.html']),
          'project-1',
          '/Users/mac/.open-design/data/projects/project-1',
        ),
      ).toEqual({ kind: 'project-file', projectId: 'other-project', filePath: 'index.html' });
    });

    it('keeps the legacy name-keyed e2e fixture shape on the current project (regression for e2e/ui/project-file-link-routing.test.ts)', () => {
      // Exact shape the maintained Playwright contract seeds: a 0.10.x
      // preview data dir keyed by project NAME, linking a file that exists
      // in the current project. The click must reopen the current project's
      // tab, never navigate to `/projects/File Link Routing/…`.
      expect(
        resolveChatFileLink(
          '/Users/mac/open-design/open-design-preview-0.10.0/projects/File%20Link%20Routing/index.html',
          new Set(['index.html']),
          'file-link-routing-1752480000000-abc123',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'index.html' });
    });

    it('keeps the legacy fixture on the current project even when resolvedDir points at a DIFFERENT data root', () => {
      // Runtime reality of the e2e contract: the live daemon's managed root
      // has nothing to do with the stale 0.10.x path baked into old chat
      // history, so the proof-based branches stay silent and the basename
      // fallback still reopens the current project's tab.
      expect(
        resolveChatFileLink(
          '/Users/mac/open-design/open-design-preview-0.10.0/projects/File%20Link%20Routing/index.html',
          new Set(['index.html']),
          'file-link-routing-1752480000000-abc123',
          '/tmp/od-e2e-data/projects/file-link-routing-1752480000000-abc123',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'index.html' });
    });

    it('resolves an absolute managed-projects disk path to the PROVEN owning project', () => {
      // The daemon tells the agent to reference @-mentioned projects by
      // absolute path (`chat-run-context.ts`), so chat links to their files
      // arrive as `<data-root>/projects/<projectId>/<file>` — siblings of
      // the current project's resolvedDir under the same managed root.
      expect(
        resolveChatFileLink(
          '/Users/mac/.open-design/data/projects/04d5e136-0cf2-4bf4/deck-outline.md',
          new Set(['unrelated.html']),
          'project-1',
          '/Users/mac/.open-design/data/projects/project-1',
        ),
      ).toEqual({
        kind: 'project-file',
        projectId: '04d5e136-0cf2-4bf4',
        filePath: 'deck-outline.md',
      });
    });

    it('does NOT infer an owning project from a /projects/<seg>/ boundary alone', () => {
      // Same href, but no resolvedDir proof: the path could just as well be
      // a legacy name-keyed dir or an imported folder, so it must not
      // navigate anywhere (the click-layer swallow keeps it inert).
      expect(
        resolveChatFileLink(
          '/Users/mac/.open-design/data/projects/04d5e136-0cf2-4bf4/deck-outline.md',
          new Set(['unrelated.html']),
          'project-1',
        ),
      ).toBeNull();
    });

    it('decodes percent-encoded segments in disk paths', () => {
      expect(
        resolveChatFileLink(
          '/Users/mac/data/projects/Web%20Prototype/sub%20dir/hero.html',
          undefined,
          'project-1',
          '/Users/mac/data/projects/project-1',
        ),
      ).toEqual({
        kind: 'project-file',
        projectId: 'Web Prototype',
        filePath: 'sub dir/hero.html',
      });
    });

    it('keeps nested file paths under the owning project', () => {
      expect(
        resolveChatFileLink(
          '/data/projects/p2/assets/img/logo.svg',
          undefined,
          'project-1',
          '/data/projects/project-1',
        ),
      ).toEqual({ kind: 'project-file', projectId: 'p2', filePath: 'assets/img/logo.svg' });
    });

    it('routes a disk path for the CURRENT project through the workspace opener even when the file list is stale', () => {
      expect(
        resolveChatFileLink(
          '/data/projects/project-1/new-file.md',
          new Set(['other.html']),
          'project-1',
          '/data/projects/project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'new-file.md' });
    });
  });

  describe('Windows drive-letter disk paths (resolvedDir proof works cross-platform)', () => {
    it('keeps a stale current-project file under a backslash resolvedDir on the CURRENT project', () => {
      expect(
        resolveChatFileLink(
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1\\new-file.md',
          new Set(['other.html']),
          'project-1',
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'new-file.md' });
    });

    it('navigates a managed sibling directory to its owning project', () => {
      expect(
        resolveChatFileLink(
          'C:\\Users\\me\\.open-design\\data\\projects\\other-project\\deck-outline.md',
          new Set(['unrelated.html']),
          'project-1',
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1',
        ),
      ).toEqual({
        kind: 'project-file',
        projectId: 'other-project',
        filePath: 'deck-outline.md',
      });
    });

    it('matches across mixed separators (forward-slash href, backslash resolvedDir)', () => {
      expect(
        resolveChatFileLink(
          'C:/Users/me/.open-design/data/projects/project-1/sub/hero.html',
          undefined,
          'project-1',
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'sub/hero.html' });
    });

    it('refuses traversal segments in drive-letter paths', () => {
      expect(
        resolveChatFileLink(
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1\\..\\secret.md',
          undefined,
          'project-1',
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1',
        ),
      ).toBeNull();
    });

    it('matches the current project across mixed casing — NTFS is case-insensitive', () => {
      // Same location on a normal Windows filesystem even though the
      // casing differs (#5611 review round 8).
      expect(
        resolveChatFileLink(
          'C:\\users\\ME\\.open-design\\data\\projects\\project-1\\new-file.md',
          new Set(['other.html']),
          'project-1',
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'new-file.md' });
    });

    it('navigates a mixed-case managed sibling and preserves its original casing', () => {
      expect(
        resolveChatFileLink(
          'c:/users/me/.open-design/data/projects/Other-Project/deck-outline.md',
          new Set(['unrelated.html']),
          'project-1',
          'C:\\Users\\me\\.open-design\\data\\projects\\project-1',
        ),
      ).toEqual({
        kind: 'project-file',
        projectId: 'Other-Project',
        filePath: 'deck-outline.md',
      });
    });

    it('keeps POSIX prefix proofs case-sensitive', () => {
      // Linux filesystems distinguish case; only Windows paths fold.
      expect(
        resolveChatFileLink(
          '/Data/Projects/project-1/new-file.md',
          undefined,
          'project-1',
          '/data/projects/project-1',
        ),
      ).toBeNull();
    });

    it('proves current-project ownership on UNC share workspaces (case-insensitively)', () => {
      // Network-share workspaces resolve to `\\server\share\…` paths
      // (#5611 review round 9).
      expect(
        resolveChatFileLink(
          '\\\\Server\\Share\\data\\projects\\project-1\\new-file.md',
          new Set(['other.html']),
          'project-1',
          '\\\\server\\share\\data\\projects\\project-1',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'new-file.md' });
    });

    it('navigates a UNC managed sibling to its owning project', () => {
      expect(
        resolveChatFileLink(
          '\\\\server\\share\\data\\projects\\Other-Project\\deck-outline.md',
          new Set(['unrelated.html']),
          'project-1',
          '\\\\server\\share\\data\\projects\\project-1',
        ),
      ).toEqual({
        kind: 'project-file',
        projectId: 'Other-Project',
        filePath: 'deck-outline.md',
      });
    });
  });

  describe('imported-folder current projects (resolvedDir is the baseDir)', () => {
    it('keeps just-written files under an imported baseDir containing a projects/ segment on the CURRENT project', () => {
      // The reviewer scenario on #5611: the imported workspace itself lives
      // under `…/projects/acme/`, and `new-file.md` is not in the (stale)
      // file list yet. The resolvedDir prefix proves the file is ours — it
      // must open in the current workspace, never navigate to a phantom
      // `acme` project.
      expect(
        resolveChatFileLink(
          '/Users/mac/workspace/projects/acme/new-file.md',
          new Set(['other.html']),
          'project-1',
          '/Users/mac/workspace/projects/acme',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'new-file.md' });
    });

    it('resolves nested and percent-encoded files under the imported baseDir', () => {
      expect(
        resolveChatFileLink(
          '/Users/mac/workspace/projects/acme/sub%20dir/hero.html',
          undefined,
          'project-1',
          '/Users/mac/workspace/projects/acme',
        ),
      ).toEqual({ kind: 'workspace-file', filePath: 'sub dir/hero.html' });
    });

    it('never derives a managed root from an imported baseDir', () => {
      // resolvedDir does not end with `/<projectId>`, so a sibling under the
      // same parent is NOT provably another Open Design project.
      expect(
        resolveChatFileLink(
          '/Users/mac/workspace/projects/other-folder/index.html',
          undefined,
          'project-1',
          '/Users/mac/workspace/projects/acme',
        ),
      ).toBeNull();
    });
  });

  describe('returns null (no in-app file target)', () => {
    it('external https URLs', () => {
      expect(resolveChatFileLink('https://example.com/docs', undefined, 'project-1')).toBeNull();
    });

    it('protocol-relative URLs are external, never managed-projects disk paths', () => {
      expect(
        resolveChatFileLink(
          '//example.com/projects/x/y.html',
          undefined,
          'project-1',
          '/data/projects/project-1',
        ),
      ).toBeNull();
    });

    it('absolute paths without a managed projects segment', () => {
      expect(resolveChatFileLink('/Users/mac/code/foo/bar.ts', undefined, 'project-1')).toBeNull();
    });

    it('refuses traversal segments inside a disk-path file part', () => {
      expect(
        resolveChatFileLink(
          '/data/projects/p2/%2E%2E/secret.html',
          undefined,
          'project-1',
          '/data/projects/project-1',
        ),
      ).toBeNull();
    });

    it('fragment-only anchors', () => {
      expect(resolveChatFileLink('#intro', undefined, 'project-1')).toBeNull();
    });
  });
});

describe('isPathLikeChatHref (suppresses the detached home-window fallback)', () => {
  it('true for unresolvable absolute filesystem paths', () => {
    expect(isPathLikeChatHref('/Users/mac/code/foo/bar.ts')).toBe(true);
  });

  it('true for traversal-relative paths', () => {
    expect(isPathLikeChatHref('../sibling/file.md')).toBe(true);
  });

  it('true for malformed percent-encoded relative paths', () => {
    expect(isPathLikeChatHref('Read%this.html')).toBe(true);
  });

  it('true for same-origin app URLs (they reopen the SPA, not a document)', () => {
    expect(isPathLikeChatHref(`${window.location.origin}/deck-outline.md`)).toBe(true);
  });

  it('false for extensionless SPA routes — their default open renders real content', () => {
    expect(isPathLikeChatHref('/automations')).toBe(false);
    expect(isPathLikeChatHref('/projects/abc123')).toBe(false);
    expect(isPathLikeChatHref('/design-systems/xyz')).toBe(false);
  });

  it('false for protocol-relative external URLs', () => {
    expect(isPathLikeChatHref('//example.com/docs')).toBe(false);
    expect(isPathLikeChatHref('//example.com/file.pdf')).toBe(false);
  });

  it('true for extensionless filesystem-style paths — the router would land them on home', () => {
    // Extensionless file names are common (Dockerfile, Makefile, README,
    // bare binaries); their default `_blank` open is exactly the detached
    // home window this module suppresses (#5611 review round 5).
    expect(isPathLikeChatHref('/Users/mac/code/foo/Dockerfile')).toBe(true);
    expect(isPathLikeChatHref('/tmp/README')).toBe(true);
    expect(isPathLikeChatHref('/usr/local/bin/node')).toBe(true);
  });

  it('true for extensionless traversal-relative paths', () => {
    expect(isPathLikeChatHref('../Makefile')).toBe(true);
  });

  it('true for Windows drive-letter file paths despite matching the URI scheme grammar', () => {
    // `C:` parses as a single-letter scheme under RFC 3986, but `C:\…` /
    // `C:/…` are filesystem paths the SPA router can never serve — leaving
    // them to the default `_blank` open reproduces the detached home window
    // on Windows (#5611 review round 7).
    expect(isPathLikeChatHref('C:\\Users\\me\\repo\\Dockerfile')).toBe(true);
    expect(isPathLikeChatHref('C:/Users/me/repo/README.md')).toBe(true);
    expect(isPathLikeChatHref('c:\\temp\\deck-outline.md')).toBe(true);
  });

  it('true for unresolvable UNC share paths', () => {
    expect(isPathLikeChatHref('\\\\server\\share\\repo\\Dockerfile')).toBe(true);
  });

  it('true (and non-throwing) for app-route shapes with malformed percent-encoding', () => {
    // parseRoute throws on decodeURIComponent('%E0'); the routability check
    // must swallow that instead of crashing the click handler (#5611
    // review round 6).
    expect(isPathLikeChatHref('/projects/%E0')).toBe(true);
    expect(isPathLikeChatHref('/design-systems/%E0/extra')).toBe(true);
  });

  it('false for the root path — it renders home on purpose', () => {
    expect(isPathLikeChatHref('/')).toBe(false);
    expect(isPathLikeChatHref('/?q=1')).toBe(false);
  });

  it('false for external http(s) URLs', () => {
    expect(isPathLikeChatHref('https://example.com/docs')).toBe(false);
    expect(isPathLikeChatHref('http://example.com/x')).toBe(false);
  });

  it('false for mailto: and other schemes', () => {
    expect(isPathLikeChatHref('mailto:foo@bar.com')).toBe(false);
    expect(isPathLikeChatHref('od://app/projects/123')).toBe(false);
    expect(isPathLikeChatHref('file:///etc/passwd')).toBe(false);
  });

  it('false for fragment-only anchors and empty hrefs', () => {
    expect(isPathLikeChatHref('#intro')).toBe(false);
    expect(isPathLikeChatHref('')).toBe(false);
    expect(isPathLikeChatHref('   ')).toBe(false);
  });
});
