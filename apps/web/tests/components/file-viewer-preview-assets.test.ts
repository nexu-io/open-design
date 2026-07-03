import { describe, expect, it } from 'vitest';

import {
  htmlHasRootRelativeProjectAssetRefs,
  normalizeRootRelativeProjectAssetRefs,
  ownerRelativeAssetPath,
  resolveRelativeAssetPath,
  rewriteInlinedCssAssetRefs,
  rewriteInlinedScriptAssetRefs,
  rootRelativeProjectAssetPath,
} from '../../src/components/file-viewer-preview-assets';

const toRawUrl = (path: string) => `/api/projects/p1/raw/${path}`;

describe('rootRelativeProjectAssetPath', () => {
  const files = new Set(['reference-assets/main.css', 'icon/font 01.otf', 'zh/index.html']);

  it('confirms a root-relative ref against the file list, ignoring query/hash', () => {
    expect(rootRelativeProjectAssetPath('/reference-assets/main.css', files)).toBe(
      'reference-assets/main.css',
    );
    expect(rootRelativeProjectAssetPath('/reference-assets/main.css?v=3#top', files)).toBe(
      'reference-assets/main.css',
    );
  });

  it('decodes escaped path segments before matching', () => {
    expect(rootRelativeProjectAssetPath('/icon/font%2001.otf', files)).toBe('icon/font 01.otf');
  });

  it('rejects refs whose path is not in the file list', () => {
    expect(rootRelativeProjectAssetPath('/api/projects/p1/raw/x.css', files)).toBeNull();
    expect(rootRelativeProjectAssetPath('/missing.css', files)).toBeNull();
  });

  it('rejects non-root-relative and traversal refs', () => {
    expect(rootRelativeProjectAssetPath('//cdn.example.com/a.css', files)).toBeNull();
    expect(rootRelativeProjectAssetPath('https://x.test/a.css', files)).toBeNull();
    expect(rootRelativeProjectAssetPath('relative/a.css', files)).toBeNull();
    expect(rootRelativeProjectAssetPath('/a/../../../etc/passwd', files)).toBeNull();
    expect(rootRelativeProjectAssetPath('/', files)).toBeNull();
    expect(rootRelativeProjectAssetPath('/dir/', files)).toBeNull();
  });

  it('answers in candidate mode while the file list is still loading', () => {
    expect(rootRelativeProjectAssetPath('/reference-assets/main.css', null)).toBe(
      'reference-assets/main.css',
    );
    expect(rootRelativeProjectAssetPath('//cdn.example.com/a.css', null)).toBeNull();
  });
});

describe('htmlHasRootRelativeProjectAssetRefs', () => {
  const files = new Set(['reference-assets/main.css', 'images/hero.png', 'js/app.js']);

  it('detects confirmed refs in subresource positions', () => {
    expect(
      htmlHasRootRelativeProjectAssetRefs(
        '<link rel="stylesheet" href="/reference-assets/main.css">',
        files,
      ),
    ).toBe(true);
    expect(
      htmlHasRootRelativeProjectAssetRefs('<img src="/images/hero.png" alt="">', files),
    ).toBe(true);
    expect(
      htmlHasRootRelativeProjectAssetRefs('<script src="/js/app.js"></script>', files),
    ).toBe(true);
    expect(
      htmlHasRootRelativeProjectAssetRefs(
        '<img srcset="/images/hero.png 2x, other.png 1x" src="other.png">',
        files,
      ),
    ).toBe(true);
    expect(
      htmlHasRootRelativeProjectAssetRefs(
        '<style>body { background: url(/images/hero.png); }</style>',
        files,
      ),
    ).toBe(true);
  });

  it('ignores navigation links and unconfirmed paths', () => {
    // Anchor hrefs are navigation, not assets — they must not force srcDoc.
    expect(
      htmlHasRootRelativeProjectAssetRefs('<a href="/reference-assets/main.css">x</a>', files),
    ).toBe(false);
    expect(htmlHasRootRelativeProjectAssetRefs('<img src="/not-here.png">', files)).toBe(false);
    expect(htmlHasRootRelativeProjectAssetRefs('<img src="images/hero.png">', files)).toBe(false);
  });
});

describe('ownerRelativeAssetPath', () => {
  it('walks up from a nested owner to a sibling tree', () => {
    expect(ownerRelativeAssetPath('zh/index.html', 'reference-assets/main.css')).toBe(
      '../reference-assets/main.css',
    );
  });

  it('stays flat for a root-level owner', () => {
    expect(ownerRelativeAssetPath('index.html', 'reference-assets/main.css')).toBe(
      'reference-assets/main.css',
    );
  });

  it('shares common prefixes', () => {
    expect(ownerRelativeAssetPath('zh/pages/about.html', 'zh/assets/a.css')).toBe(
      '../assets/a.css',
    );
  });
});

describe('resolveRelativeAssetPath', () => {
  it('resolves against the owner directory', () => {
    expect(resolveRelativeAssetPath('reference-assets/main.css', 'fonts/x.otf')).toBe(
      'reference-assets/fonts/x.otf',
    );
    expect(resolveRelativeAssetPath('reference-assets/main.css', '../icon/f.otf')).toBe(
      'icon/f.otf',
    );
  });

  it('rejects schemes, root-relative refs, and root escapes', () => {
    expect(resolveRelativeAssetPath('a/main.css', 'https://x.test/a.png')).toBeNull();
    expect(resolveRelativeAssetPath('a/main.css', 'data:image/png;base64,x')).toBeNull();
    expect(resolveRelativeAssetPath('a/main.css', '/root.png')).toBeNull();
    expect(resolveRelativeAssetPath('a/main.css', '../../escape.png')).toBeNull();
    expect(resolveRelativeAssetPath('a/main.css', '#frag')).toBeNull();
  });
});

describe('normalizeRootRelativeProjectAssetRefs', () => {
  const files = new Set([
    'reference-assets/main.css',
    'images/hero.png',
    'images/hero@2x.png',
    'js/app.js',
    'media/intro.mp4',
    'media/poster.jpg',
  ]);

  it('rewrites confirmed refs to owner-relative paths, keeping query strings', () => {
    const html = [
      '<link rel="stylesheet" href="/reference-assets/main.css?v=2">',
      '<img src="/images/hero.png" alt="hero">',
      '<script src="/js/app.js" defer></script>',
      '<video poster="/media/poster.jpg" data-src="/media/intro.mp4"></video>',
    ].join('\n');
    const out = normalizeRootRelativeProjectAssetRefs(html, 'zh/index.html', files);
    expect(out).toContain('href="../reference-assets/main.css?v=2"');
    expect(out).toContain('src="../images/hero.png"');
    expect(out).toContain('src="../js/app.js" defer');
    expect(out).toContain('poster="../media/poster.jpg"');
    expect(out).toContain('data-src="../media/intro.mp4"');
  });

  it('rewrites srcset candidates and inline css url() refs', () => {
    const html =
      '<img srcset="/images/hero.png 1x, /images/hero@2x.png 2x" src="/images/hero.png">' +
      '<style>.hero { background: url("/images/hero.png"); }</style>';
    const out = normalizeRootRelativeProjectAssetRefs(html, 'index.html', files);
    expect(out).toContain('srcset="images/hero.png 1x, images/hero@2x.png 2x"');
    expect(out).toContain('url("images/hero.png")');
  });

  it('leaves unconfirmed refs, navigation links, and external URLs untouched', () => {
    const html = [
      '<a href="/about.html">About</a>',
      '<img src="/not-in-project.png">',
      '<img src="https://cdn.example.com/x.png">',
      '<link rel="stylesheet" href="/api/projects/p1/raw/reference-assets/main.css">',
    ].join('\n');
    expect(normalizeRootRelativeProjectAssetRefs(html, 'index.html', files)).toBe(html);
  });
});

describe('rewriteInlinedCssAssetRefs', () => {
  const files = new Set(['reference-assets/fonts/x.otf', 'icon/f.otf', 'images/bg.png']);

  it('re-anchors relative url() refs to the stylesheet directory as raw URLs', () => {
    const css = '@font-face { src: url("fonts/x.otf") format("opentype"); }';
    expect(rewriteInlinedCssAssetRefs(css, 'reference-assets/main.css', files, toRawUrl)).toBe(
      '@font-face { src: url("/api/projects/p1/raw/reference-assets/fonts/x.otf") format("opentype"); }',
    );
  });

  it('rewrites confirmed root-relative url() refs and keeps suffixes', () => {
    const css = 'body { background: url(/images/bg.png?v=1); }';
    expect(rewriteInlinedCssAssetRefs(css, 'reference-assets/main.css', files, toRawUrl)).toBe(
      'body { background: url(/api/projects/p1/raw/images/bg.png?v=1); }',
    );
  });

  it('leaves external, data, and unconfirmed root refs untouched', () => {
    const css =
      'a { background: url(https://x.test/a.png); } ' +
      'b { background: url(data:image/png;base64,xx); } ' +
      'c { background: url(/missing.png); }';
    expect(rewriteInlinedCssAssetRefs(css, 'reference-assets/main.css', files, toRawUrl)).toBe(css);
  });

  it('does not touch root-relative refs while the file list is unknown', () => {
    const css = 'c { background: url(/images/bg.png); }';
    expect(rewriteInlinedCssAssetRefs(css, 'reference-assets/main.css', null, toRawUrl)).toBe(css);
  });
});

describe('rewriteInlinedScriptAssetRefs', () => {
  const files = new Set(['reference-assets/data.json', 'images/bg.png', 'js/data.json', 'js/worker.js']);

  it('rewrites confirmed root-relative string literals only', () => {
    const js = "fetch('/reference-assets/data.json').then(r => r.json());";
    expect(rewriteInlinedScriptAssetRefs(js, 'index.html', files, toRawUrl)).toBe(
      "fetch('/api/projects/p1/raw/reference-assets/data.json').then(r => r.json());",
    );
  });

  it('rebases relative sibling refs against the inlined script directory', () => {
    // js/app.js is inlined into the HTML entry; its `./data.json` and
    // `./worker.js` must resolve against js/, not the HTML root.
    const js = "fetch('./data.json'); new Worker('./worker.js');";
    expect(rewriteInlinedScriptAssetRefs(js, 'js/app.js', files, toRawUrl)).toBe(
      "fetch('/api/projects/p1/raw/js/data.json'); new Worker('/api/projects/p1/raw/js/worker.js');",
    );
  });

  it('rebases parent-relative refs and drops those that escape or miss the file list', () => {
    const js = [
      "fetch('../reference-assets/data.json');", // js/../reference-assets/... = reference-assets/data.json ✓
      "fetch('./missing.json');", // js/missing.json — not a project file
    ].join('\n');
    expect(rewriteInlinedScriptAssetRefs(js, 'js/app.js', files, toRawUrl)).toBe(
      [
        "fetch('/api/projects/p1/raw/reference-assets/data.json');",
        "fetch('./missing.json');",
      ].join('\n'),
    );
  });

  it('skips interpolated literals, route-like strings, and unknown paths', () => {
    const js = [
      'const a = `/images/${name}.png`;',
      "const b = '/api/users';",
      "const c = '/missing.json';",
    ].join('\n');
    expect(rewriteInlinedScriptAssetRefs(js, 'index.html', files, toRawUrl)).toBe(js);
  });
});
