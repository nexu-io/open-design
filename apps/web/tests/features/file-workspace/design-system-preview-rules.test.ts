import { describe, expect, it } from 'vitest';
import {
  baseDirForDesignSystemPreviewFile,
  escapeDesignSystemPreviewAttr,
  escapeDesignSystemPreviewCssUrl,
  isDesignSystemPreviewAppRootRef,
  readDesignSystemPreviewHtmlAttr,
  resolveDesignSystemPreviewAssetPath,
  resolveDesignSystemPreviewRelativePath,
  rewriteDesignSystemPreviewCssUrls,
  rewriteDesignSystemPreviewHtmlAssetRef,
  rewriteDesignSystemPreviewHtmlAssetUrls,
  rewriteDesignSystemPreviewInlineCssAssetUrls,
  rewriteDesignSystemPreviewSrcset,
} from '../../../src/features/file-workspace/rules';

const rawUrl = (projectId: string, filePath: string) => `/api/projects/${projectId}/raw/${filePath}`;

describe('baseDirForDesignSystemPreviewFile', () => {
  it('returns the directory prefix including the trailing slash', () => {
    expect(baseDirForDesignSystemPreviewFile('sections/index.html')).toBe('sections/');
  });

  it('returns empty string for a root-level file', () => {
    expect(baseDirForDesignSystemPreviewFile('index.html')).toBe('');
  });
});

describe('isDesignSystemPreviewAppRootRef', () => {
  it('flags app-root refs like /api, /artifacts, /frames', () => {
    expect(isDesignSystemPreviewAppRootRef('/api/foo')).toBe(true);
    expect(isDesignSystemPreviewAppRootRef('/artifacts/x.png')).toBe(true);
    expect(isDesignSystemPreviewAppRootRef('/frames/1')).toBe(true);
    expect(isDesignSystemPreviewAppRootRef('/api')).toBe(true);
  });

  it('does not flag protocol-relative or unrelated absolute paths', () => {
    expect(isDesignSystemPreviewAppRootRef('//example.com/x')).toBe(false);
    expect(isDesignSystemPreviewAppRootRef('/assets/logo.png')).toBe(false);
    expect(isDesignSystemPreviewAppRootRef('relative.png')).toBe(false);
  });
});

describe('resolveDesignSystemPreviewAssetPath / resolveDesignSystemPreviewRelativePath', () => {
  it('resolves a relative ref against the owning file directory', () => {
    expect(resolveDesignSystemPreviewAssetPath('sections/index.html', '../logo.png')).toEqual({
      filePath: 'logo.png',
      suffix: '',
    });
    expect(resolveDesignSystemPreviewRelativePath('sections/index.html', 'style.css')).toBe(
      'sections/style.css',
    );
  });

  it('preserves query/hash suffix', () => {
    expect(resolveDesignSystemPreviewAssetPath('index.html', 'sprite.svg?v=2#icon')).toEqual({
      filePath: 'sprite.svg',
      suffix: '?v=2#icon',
    });
  });

  it('returns null for absolute/data/external refs and app-root refs', () => {
    expect(resolveDesignSystemPreviewRelativePath('index.html', 'https://example.com/x.png')).toBeNull();
    expect(resolveDesignSystemPreviewRelativePath('index.html', 'data:image/png;base64,AAAA')).toBeNull();
    expect(resolveDesignSystemPreviewRelativePath('index.html', '#anchor')).toBeNull();
    expect(resolveDesignSystemPreviewRelativePath('index.html', '/api/projects/x')).toBeNull();
  });

  it('returns null for a ref that escapes the od.local origin', () => {
    expect(resolveDesignSystemPreviewRelativePath('index.html', '//example.com/x.png')).toBeNull();
  });
});

describe('readDesignSystemPreviewHtmlAttr', () => {
  it('reads a quoted attribute value from a tag', () => {
    expect(readDesignSystemPreviewHtmlAttr('<link rel="stylesheet" href="style.css">', 'href')).toBe('style.css');
    expect(readDesignSystemPreviewHtmlAttr("<img src='a.png'>", 'src')).toBe('a.png');
  });

  it('returns null when the attribute is absent', () => {
    expect(readDesignSystemPreviewHtmlAttr('<img>', 'src')).toBeNull();
  });
});

describe('escapeDesignSystemPreviewAttr / escapeDesignSystemPreviewCssUrl', () => {
  it('escapes HTML attribute-unsafe characters', () => {
    expect(escapeDesignSystemPreviewAttr(`a & b <c> "d"`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot;');
  });

  it('escapes CSS url()-unsafe characters', () => {
    expect(escapeDesignSystemPreviewCssUrl('a\\b"c\nd')).toBe('a\\\\b\\"c\\a d');
  });
});

describe('rewriteDesignSystemPreviewCssUrls', () => {
  it('rewrites a relative url() to the project raw-file URL', () => {
    const css = `.bg { background: url(../images/bg.png); }`;
    expect(rewriteDesignSystemPreviewCssUrls(css, 'proj1', 'sections/style.css', rawUrl)).toBe(
      `.bg { background: url("/api/projects/proj1/raw/images/bg.png"); }`,
    );
  });

  it('leaves an unresolvable url() untouched', () => {
    const css = `.bg { background: url(https://example.com/bg.png); }`;
    expect(rewriteDesignSystemPreviewCssUrls(css, 'proj1', 'style.css', rawUrl)).toBe(css);
  });
});

describe('rewriteDesignSystemPreviewHtmlAssetRef / rewriteDesignSystemPreviewSrcset', () => {
  it('rewrites a resolvable direct ref', () => {
    expect(rewriteDesignSystemPreviewHtmlAssetRef('logo.png', 'proj1', 'sections/index.html', rawUrl)).toBe(
      '/api/projects/proj1/raw/sections/logo.png',
    );
  });

  it('leaves an unresolvable ref untouched', () => {
    expect(rewriteDesignSystemPreviewHtmlAssetRef('data:image/png;base64,AAAA', 'proj1', 'index.html', rawUrl)).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  it('rewrites each candidate in a srcset list', () => {
    const srcset = 'small.png 1x, large.png 2x';
    expect(rewriteDesignSystemPreviewSrcset(srcset, 'proj1', 'index.html', rawUrl)).toBe(
      '/api/projects/proj1/raw/small.png 1x, /api/projects/proj1/raw/large.png 2x',
    );
  });

  it('leaves a data-URI srcset untouched', () => {
    const srcset = 'data:image/png;base64,AAAA 1x';
    expect(rewriteDesignSystemPreviewSrcset(srcset, 'proj1', 'index.html', rawUrl)).toBe(srcset);
  });
});

describe('rewriteDesignSystemPreviewHtmlAssetUrls', () => {
  it('rewrites direct-attribute asset refs and srcset lists', () => {
    const html = `<img src="a.png"><img srcset="b.png 1x, c.png 2x">`;
    expect(rewriteDesignSystemPreviewHtmlAssetUrls(html, 'proj1', 'index.html', rawUrl)).toBe(
      `<img src="/api/projects/proj1/raw/a.png">` +
        `<img srcset="/api/projects/proj1/raw/b.png 1x, /api/projects/proj1/raw/c.png 2x">`,
    );
  });
});

describe('rewriteDesignSystemPreviewInlineCssAssetUrls', () => {
  it('rewrites urls inside <style> blocks and style= attributes', () => {
    const html = `<style>.a{background:url(a.png)}</style><div style="background:url(b.png)"></div>`;
    expect(rewriteDesignSystemPreviewInlineCssAssetUrls(html, 'proj1', 'index.html', rawUrl)).toBe(
      `<style>.a{background:url("/api/projects/proj1/raw/a.png")}</style>` +
        `<div style="background:url(&quot;/api/projects/proj1/raw/b.png&quot;)"></div>`,
    );
  });
});
