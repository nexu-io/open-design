import { describe, expect, it } from 'vitest';

import { inlineRelativeAssets } from '../src/inline-assets.js';

// ---------------------------------------------------------------------------
// Unit — inlineRelativeAssets pure helper
// ---------------------------------------------------------------------------
//
// These tests pin the behavior contract documented in
// `~/.claude/plans/declarative-roaming-gosling.md` §2.3. The helper is a
// server-side port of the web-client logic at `apps/web/src/components/
// FileViewer.tsx:5248-5354` (@ base SHA 5bd97631); the divergence from
// `FileViewer.tsx:5313` (replace-all vs first-match) is locked decision §3.3.

function readerFrom(files: Record<string, string>) {
  return async (relPath: string): Promise<string | null> => {
    return Object.prototype.hasOwnProperty.call(files, relPath) ? files[relPath] : null;
  };
}

describe('inlineRelativeAssets', () => {
  it('inlines a single <link rel=stylesheet> with verbatim CSS body', async () => {
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body></body></html>';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'a.css': 'body{color:red}' }));
    expect(out).toContain('<style data-od-inline-asset="a.css">');
    expect(out).toContain('body{color:red}');
    expect(out).not.toContain('<link rel="stylesheet" href="a.css">');
  });

  it('inlines a <script src> preserving non-src attrs (type=module, defer, crossorigin)', async () => {
    const html =
      '<html><head><script type="module" defer crossorigin src="x.js"></script></head></html>';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'x.js': 'console.log(1)' }));
    expect(out).toMatch(/<script[^>]*type="module"[^>]*>/);
    expect(out).toMatch(/<script[^>]*\bdefer\b[^>]*>/);
    expect(out).toMatch(/<script[^>]*\bcrossorigin\b[^>]*>/);
    expect(out).toContain('console.log(1)');
    expect(out).not.toContain('src="x.js"');
  });

  it('resolves relative paths for both nested and root owners', async () => {
    const nestedOut = await inlineRelativeAssets(
      '<script src="../shared/util.js"></script>',
      'pages/index.html',
      readerFrom({ 'shared/util.js': 'export const x = 1;' }),
    );
    expect(nestedOut).toContain('export const x = 1;');

    const rootOut = await inlineRelativeAssets(
      '<link rel="stylesheet" href="a.css">',
      'index.html',
      readerFrom({ 'a.css': '.root{}' }),
    );
    expect(rootOut).toContain('.root{}');
  });

  it('handles self-closing <link …/> form', async () => {
    const html = '<link rel="stylesheet" href="a.css" />';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'a.css': '/*ok*/' }));
    expect(out).toContain('/*ok*/');
    expect(out).not.toContain('href="a.css"');
  });

  it("accepts single-quoted attrs (href='a.css')", async () => {
    const html = `<link rel='stylesheet' href='a.css'>`;
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'a.css': '/*single*/' }));
    expect(out).toContain('/*single*/');
  });

  it('does NOT rewrite a <link> tag without a rel attribute', async () => {
    const html = '<link href="a.css">';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'a.css': '.x{}' }));
    expect(out).toBe(html);
  });

  it('does NOT rewrite <link rel="preload"> (only rel=stylesheet)', async () => {
    const html = '<link rel="preload" href="x.css">';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'x.css': '.x{}' }));
    expect(out).toBe(html);
  });

  it('does NOT rewrite absolute / data / blob / mailto / tel / anchor / leading-slash refs', async () => {
    const cases = [
      '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
      '<link rel="stylesheet" href="http://cdn.example.com/x.css">',
      '<link rel="stylesheet" href="data:text/css,body{}">',
      '<link rel="stylesheet" href="blob:abc">',
      '<link rel="stylesheet" href="/abs/path.css">',
      '<script src="https://cdn.example.com/x.js"></script>',
      '<script src="data:text/javascript,1+1"></script>',
      '<script src="/abs/x.js"></script>',
    ];
    const reader = readerFrom({}); // never called
    for (const html of cases) {
      const out = await inlineRelativeAssets(html, 'index.html', reader);
      expect(out).toBe(html);
    }
  });

  it('escapes </style inside CSS body to <\\/style', async () => {
    const css = 'body::before{content:"</style>"}';
    const out = await inlineRelativeAssets(
      '<link rel="stylesheet" href="a.css">',
      'index.html',
      readerFrom({ 'a.css': css }),
    );
    expect(out).toContain('<\\/style');
    expect(out).not.toMatch(/<\/style[^>]*?>\s*<\/style>/);
    expect(out.match(/<\/style>/g)?.length).toBe(1);
  });

  it('escapes </script inside JS body to <\\/script', async () => {
    const js = 'const x = "</script>"';
    const out = await inlineRelativeAssets(
      '<script src="x.js"></script>',
      'index.html',
      readerFrom({ 'x.js': js }),
    );
    expect(out).toContain('<\\/script');
    expect(out.match(/<\/script>/g)?.length).toBe(1);
  });

  it('leaves tag intact when fileReader returns null, but still inlines other assets', async () => {
    const html =
      '<link rel="stylesheet" href="missing.css"><script src="present.js"></script>';
    const out = await inlineRelativeAssets(
      html,
      'index.html',
      readerFrom({ 'present.js': 'ok' }),
    );
    expect(out).toContain('<link rel="stylesheet" href="missing.css">');
    expect(out).toContain('ok');
    expect(out).not.toContain('src="present.js"');
  });

  it('replaces ALL occurrences of identical duplicate tags (diverges from FileViewer.tsx:5313)', async () => {
    // The web client uses `.replace(from, () => to)` which only replaces the
    // first match. Locked decision §3.3: the server helper replaces all.
    const html = '<script src="x.js"></script>\n<script src="x.js"></script>';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'x.js': 'BODY' }));
    expect(out.match(/src="x\.js"/g) ?? []).toEqual([]);
    expect(out.match(/BODY/g)?.length).toBe(2);
  });

  it('HTML-escapes the href value in data-od-inline-asset attr', async () => {
    const href = 'weird&name<x>.css';
    const html = `<link rel="stylesheet" href="${href}">`;
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ [href]: '.x{}' }));
    expect(out).toContain('data-od-inline-asset="weird&amp;name&lt;x&gt;.css"');
    expect(out).not.toContain(`data-od-inline-asset="${href}"`);
  });

  it('resolves deep-nested owner (a/b/c/index.html + ../../shared/util.js)', async () => {
    const out = await inlineRelativeAssets(
      '<script src="../../shared/util.js"></script>',
      'a/b/c/index.html',
      readerFrom({ 'a/shared/util.js': 'DEEP' }),
    );
    expect(out).toContain('DEEP');
    expect(out).not.toContain('src="../../shared/util.js"');
  });
});
