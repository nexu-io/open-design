import { describe, expect, it } from 'vitest';

import {
  authorInitials,
  derivePluginSourceLinks,
} from '../../src/runtime/plugin-source';
import type { InstalledPluginRecord } from '@open-design/contracts';

type Record = Parameters<typeof derivePluginSourceLinks>[0];

function makeRecord(overrides: Partial<Record>): Record {
  return {
    source:     './local/path',
    sourceKind: 'local',
    fsPath:     '/abs/local/path',
    manifest: {
      name:    'test-plugin',
      version: '1.0.0',
    } as InstalledPluginRecord['manifest'],
    ...overrides,
  };
}

describe('derivePluginSourceLinks · github sources', () => {
  it('builds tree URL with ref + subpath when source has both', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'github',
        source:     'github:open-design/plugins@v1.2.0/make-a-deck',
      }),
    );
    expect(out.sourceUrl).toBe('https://github.com/open-design/plugins/tree/v1.2.0/make-a-deck');
    expect(out.sourceLabel).toBe('open-design/plugins @v1.2.0/make-a-deck');
    expect(out.sourceKindLabel).toBe('GitHub');
    expect(out.contributeUrl).toBe('https://github.com/open-design/plugins/issues/new');
    expect(out.contributeOnGithub).toBe(true);
  });

  it('falls back to repo-root URL when no ref / subpath', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'github',
        source:     'github:open-design/plugins',
      }),
    );
    expect(out.sourceUrl).toBe('https://github.com/open-design/plugins');
    expect(out.sourceLabel).toBe('open-design/plugins');
  });

  it('uses pinnedRef when source has no inline ref', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'github',
        source:     'github:open-design/plugins',
        pinnedRef:  'a1b2c3d4',
      }),
    );
    expect(out.sourceUrl).toBe('https://github.com/open-design/plugins/tree/a1b2c3d4');
    expect(out.sourceLabel).toBe('open-design/plugins @a1b2c3d4');
  });

  it('preserves slash-separated branch refs (release/1.0)', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'github',
        source:     'github:open-design/plugins',
        pinnedRef:  'release/1.0',
      }),
    );
    expect(out.sourceUrl).toBe('https://github.com/open-design/plugins/tree/release/1.0');
  });

  it('treats HEAD pinnedRef as no ref', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'github',
        source:     'github:open-design/plugins',
        pinnedRef:  'HEAD',
      }),
    );
    expect(out.sourceUrl).toBe('https://github.com/open-design/plugins');
  });

  it('falls back gracefully on a malformed github source', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'github',
        source:     'github:not-a-valid+source',
      }),
    );
    expect(out.sourceUrl).toBeNull();
    expect(out.sourceLabel).toBe('github:not-a-valid+source');
  });
});

describe('derivePluginSourceLinks · url + local + bundled sources', () => {
  it('uses an https tarball URL verbatim with a hostname label', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'url',
        source:     'https://example.com/plugins/make-a-deck.tgz',
      }),
    );
    expect(out.sourceUrl).toBe('https://example.com/plugins/make-a-deck.tgz');
    expect(out.sourceLabel).toBe('example.com/plugins/make-a-deck.tgz');
    expect(out.sourceKindLabel).toBe('URL');
  });

  it('drops javascript: URLs from the source URL slot', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        // eslint-disable-next-line no-script-url
        sourceKind: 'url',
        source:     'javascript:alert(1)',
      }),
    );
    expect(out.sourceUrl).toBeNull();
  });

  it('uses basename as label for local sources', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'local',
        source:     '/Users/me/work/plugins/make-a-deck',
      }),
    );
    expect(out.sourceUrl).toBeNull();
    expect(out.sourceLabel).toBe('make-a-deck');
    expect(out.sourceKindLabel).toBe('Local');
  });

  it('routes bundled official sources to the Open Design repo', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'bundled',
        source:     'plugins/_official/scenarios/od-code-migration',
      }),
    );
    expect(out.sourceUrl).toBe('https://github.com/nexu-io/open-design');
    expect(out.sourceKindLabel).toBe('Official');
    expect(out.sourceLabel).toBe('nexu-io/open-design');
    expect(out.authorProfileUrl).toBe('https://github.com/nexu-io/open-design');
    expect(out.homepageUrl).toBe('https://github.com/nexu-io/open-design');
  });
});

describe('derivePluginSourceLinks · author + contribute', () => {
  it('extracts github avatar from a profile URL', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        manifest: {
          name:    'p',
          version: '1.0.0',
          author:  { name: 'Open Design', url: 'https://github.com/nexu-io' },
        } as InstalledPluginRecord['manifest'],
      }),
    );
    expect(out.authorName).toBe('Open Design');
    expect(out.authorProfileUrl).toBe('https://github.com/nexu-io');
    expect(out.authorAvatarUrl).toBe('https://github.com/nexu-io.png?size=80');
  });

  it('extracts github avatar from a repo URL by using the owner', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        manifest: {
          name:    'p',
          version: '1.0.0',
          author:  { name: 'Author', url: 'https://github.com/owner/repo' },
        } as InstalledPluginRecord['manifest'],
      }),
    );
    expect(out.authorAvatarUrl).toBe('https://github.com/owner.png?size=80');
  });

  it('returns null avatar for non-github profile URLs', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        manifest: {
          name:    'p',
          version: '1.0.0',
          author:  { name: 'Author', url: 'https://example.com/me' },
        } as InstalledPluginRecord['manifest'],
      }),
    );
    expect(out.authorProfileUrl).toBe('https://example.com/me');
    expect(out.authorAvatarUrl).toBeNull();
  });

  it('falls back to homepage for the contribute link when source is not github', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        sourceKind: 'bundled',
        source:     'plugins/_official/scenarios/od-code-migration',
        manifest: {
          name:    'p',
          version: '1.0.0',
          homepage: 'https://github.com/nexu-io/open-design',
        } as InstalledPluginRecord['manifest'],
      }),
    );
    expect(out.contributeUrl).toBe('https://github.com/nexu-io/open-design/issues/new');
    expect(out.contributeOnGithub).toBe(true);
    expect(out.homepageUrl).toBe('https://github.com/nexu-io/open-design');
  });

  it('drops malformed homepage values', () => {
    const out = derivePluginSourceLinks(
      makeRecord({
        manifest: {
          name:    'p',
          version: '1.0.0',
          homepage: 'not a url',
        } as InstalledPluginRecord['manifest'],
      }),
    );
    expect(out.homepageUrl).toBeNull();
    expect(out.contributeUrl).toBeNull();
    expect(out.contributeOnGithub).toBe(false);
  });

  it('returns null author fields when manifest has no author', () => {
    const out = derivePluginSourceLinks(makeRecord({}));
    expect(out.authorName).toBeNull();
    expect(out.authorProfileUrl).toBeNull();
    expect(out.authorAvatarUrl).toBeNull();
  });
});

describe('authorInitials', () => {
  it('builds two-letter monograms', () => {
    expect(authorInitials('Open Design')).toBe('OD');
    expect(authorInitials('jane')).toBe('J');
    expect(authorInitials('Long Multi Word Name')).toBe('LM');
  });

  it('returns ?? for empty / null inputs', () => {
    expect(authorInitials(null)).toBe('??');
    expect(authorInitials('')).toBe('??');
    expect(authorInitials('   ')).toBe('??');
  });
});
