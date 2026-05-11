import type http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inlineRelativeAssets, type InlineAssetReader } from '../src/inline-assets.js';
import { startServer } from '../src/server.js';

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
  return async (relPath: string) => {
    const value = files[relPath];
    if (typeof value !== 'string') return null;
    return {
      size: Buffer.byteLength(value, 'utf8'),
      read: async () => value,
    };
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
    // Using `&` only — the realistic case for filenames that need escaping.
    // `<`, `>`, `"` are forbidden in real filenames on most platforms and
    // additionally break the tag-matching regex (a limitation inherited
    // from the web client at FileViewer.tsx:5271). The escapeHtmlAttr fn
    // itself covers `&`, `"`, `<`, `>` by inspection.
    const href = 'weird&name.css';
    const html = `<link rel="stylesheet" href="${href}">`;
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ [href]: '.x{}' }));
    expect(out).toContain('data-od-inline-asset="weird&amp;name.css"');
    expect(out).not.toContain(`data-od-inline-asset="${href}"`);
  });

  it('does not treat "disabled" inside a quoted attribute value as the disabled boolean attr', async () => {
    // PR #1312 round-2 review (lefarcen P3): the current
    // `hasBooleanHtmlAttr` regex `\sdisabled(?=\s|=|/?>)` tests the
    // tag string with NO attr-quoting awareness, so the literal text
    // `disabled` appearing inside any quoted attribute value, followed
    // by another whitespace char, satisfies the lookahead. A source
    // tag like
    //   <link rel=stylesheet href=x.css data-note="content disabled stuff">
    // would then emit a <style disabled> block — silently disabling
    // a stylesheet the author wrote without that attr.
    const html =
      '<link rel="stylesheet" href="x.css" data-note="content disabled stuff">';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'x.css': '.x{}' }));
    expect(out).toMatch(/<style\b[^>]*data-od-inline-asset/);
    expect(out).not.toMatch(/<style\b[^>]*\bdisabled\b/);
  });

  it('still detects disabled when it is a real boolean attr (regression for the dedup fix)', async () => {
    // Counterweight to the previous case: don't over-correct and
    // start dropping the legitimate `disabled` attr.
    const html = '<link rel="stylesheet" href="x.css" disabled>';
    const out = await inlineRelativeAssets(html, 'index.html', readerFrom({ 'x.css': '.x{}' }));
    expect(out).toMatch(/<style\b[^>]*\bdisabled\b/);
  });

  it('preserves <link> attrs (media, title, disabled, nonce) on the generated <style> tag', async () => {
    // PR #1312 round-2 (lefarcen P2 @ inline-assets.ts:44): a stylesheet
    // <link> with `media="print"` was becoming a plain <style> with no
    // media query, so print-only styles applied unconditionally. Same
    // problem for `title` (alternate stylesheet sets), `disabled`
    // (initial disabled state), `nonce` (CSP nonce). All four are valid
    // attributes on both <link rel=stylesheet> and <style> per HTML
    // spec, so the inliner should copy them across.
    const html =
      '<link rel="stylesheet" href="print.css" media="print" title="Print">' +
      '<link rel="stylesheet" href="alt.css" disabled>' +
      '<link rel="stylesheet" href="csp.css" nonce="abc123">';
    const out = await inlineRelativeAssets(
      html,
      'index.html',
      readerFrom({
        'print.css': '.p{}',
        'alt.css': '.a{}',
        'csp.css': '.c{}',
      }),
    );
    expect(out).toMatch(/<style\b[^>]*\bmedia="print"[^>]*>[\s\S]*?\.p\{\}/);
    expect(out).toMatch(/<style\b[^>]*\btitle="Print"[^>]*>[\s\S]*?\.p\{\}/);
    expect(out).toMatch(/<style\b[^>]*\bdisabled\b[^>]*>[\s\S]*?\.a\{\}/);
    expect(out).toMatch(/<style\b[^>]*\bnonce="abc123"[^>]*>[\s\S]*?\.c\{\}/);
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

  // ---- Cap enforcement (PR #1312 round-3, lefarcen P2) ---------------
  // The helper accepts an InlineOptions bag (test-door per
  // feedback_test_doors_over_fake_timers.md) so the tests can exercise
  // each cap with tiny fixtures rather than 2-50 MiB on-disk writes.
  // Production callers use the module-level defaults.
  // --------------------------------------------------------------------

  it('throws InlineAssetsLimitError("owner") when the owner html exceeds maxOwnerBytes', async () => {
    const html = '<html><head>' + 'x'.repeat(500) + '</head></html>';
    await expect(
      inlineRelativeAssets(html, 'index.html', readerFrom({}), { maxOwnerBytes: 100 }),
    ).rejects.toMatchObject({
      name: 'InlineAssetsLimitError',
      limit: 'owner',
    });
  });

  it('throws InlineAssetsLimitError("candidates") when tag matches exceed maxCandidates', async () => {
    // Build HTML with 5 link tags, cap at 3.
    const html = Array.from({ length: 5 }, (_, i) =>
      `<link rel="stylesheet" href="a${i}.css">`,
    ).join('');
    await expect(
      inlineRelativeAssets(html, 'index.html', readerFrom({}), { maxCandidates: 3 }),
    ).rejects.toMatchObject({
      name: 'InlineAssetsLimitError',
      limit: 'candidates',
    });
  });

  it('leaves a tag intact (no replacement) when its asset body exceeds maxAssetBytes', async () => {
    const html =
      '<link rel="stylesheet" href="big.css"><link rel="stylesheet" href="small.css">';
    const out = await inlineRelativeAssets(
      html,
      'index.html',
      readerFrom({
        'big.css': 'a'.repeat(2000), // exceeds cap
        'small.css': '.s{}',
      }),
      { maxAssetBytes: 1000 },
    );
    // Oversized asset stays as a URL ref (graceful — the export still
    // succeeds; the consumer sees an un-inlined link instead of inflated
    // memory or a 413 for one bad asset).
    expect(out).toContain('<link rel="stylesheet" href="big.css">');
    // The small asset still inlines normally.
    expect(out).toContain('.s{}');
    expect(out).not.toContain('href="small.css"');
  });

  it('throws InlineAssetsLimitError("total") when the assembled output exceeds maxTotalBytes', async () => {
    const html =
      '<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css">';
    const big = 'x'.repeat(800);
    await expect(
      inlineRelativeAssets(
        html,
        'index.html',
        readerFrom({ 'a.css': big, 'b.css': big }),
        { maxTotalBytes: 1000 },
      ),
    ).rejects.toMatchObject({
      name: 'InlineAssetsLimitError',
      limit: 'total',
    });
  });

  it('checks maxAssetBytes via handle.size BEFORE invoking handle.read()', async () => {
    // PR #1312 round-4 (lefarcen P2): the maxAssetBytes cap must fire
    // pre-buffer. A reader whose read() throws is fine — the helper
    // must not invoke it once the stat-side size exceeds the cap.
    let readsAttempted = 0;
    const sizeOnlyReader = async (relPath: string) => ({
      size: 10_000,
      read: async (): Promise<string | null> => {
        readsAttempted += 1;
        throw new Error(`read should not happen for ${relPath}`);
      },
    });
    const html = '<link rel="stylesheet" href="big.css">';
    const out = await inlineRelativeAssets(html, 'index.html', sizeOnlyReader, {
      maxAssetBytes: 1_000,
    });
    expect(readsAttempted).toBe(0);
    expect(out).toContain('<link rel="stylesheet" href="big.css">');
  });

  it('stops dispatching reads once running total exceeds maxTotalBytes', async () => {
    // PR #1312 round-4 (lefarcen P2): the running-total guard must
    // abort the worker pool, not wait for the final concat. With a
    // tiny totalBytes cap and 20 candidates each contributing 800
    // bytes of stat-size, we expect at most a few reads to actually
    // run before the abort flag short-circuits the rest. Concurrency
    // is 1 so the abort timing is deterministic.
    let reads = 0;
    const countingReader = async (relPath: string) => ({
      size: 800,
      read: async () => {
        reads += 1;
        return `/* ${relPath} */`;
      },
    });
    const html = Array.from({ length: 20 }, (_, i) =>
      `<link rel="stylesheet" href="a${i}.css">`,
    ).join('');
    await expect(
      inlineRelativeAssets(html, 'index.html', countingReader, {
        maxTotalBytes: 1_000,
        maxReadConcurrency: 1,
      }),
    ).rejects.toMatchObject({ name: 'InlineAssetsLimitError', limit: 'total' });
    // Owner html is ~760 bytes. First asset's 800 stat-size pushes
    // running over 1000 → abort. So at most ONE read should fire.
    expect(reads).toBeLessThanOrEqual(2);
  });

  it('reconciles handle.size with actual content bytes — trips total abort post-read on stat-lying readers', async () => {
    // PR #1312 round-5 (lefarcen P3 confirmed at PR-1312#issuecomment-4424868413
    // follow-up, path-a): the helper must reconcile handle.size with the
    // actual byte length of `content` AFTER `read()`, not just trust the
    // stat-side number. A reader that under-reports size (stale stat,
    // UTF-8 expansion at decode, sparse file, deliberate lie) would
    // otherwise let many strings materialize before the concat-time
    // guard at the bottom of the helper throws — defeating the round-4
    // pre-buffer cap intent.
    //
    // Discriminator: read count. Pre-fix the helper trusts handle.size
    // (10), so both reads complete (each returning 1000 bytes) under
    // the reservation total of 56+10+10=76 < cap 500; the concat-time
    // guard then catches the 2000+-byte assembly and throws 'total'.
    // Post-fix worker 1's reconciliation trips totalAborted as soon as
    // its actualBytes (1000) is added to runningBytes, pushing running
    // over the cap; worker 2 then sees totalAborted and returns null
    // without invoking read(). One read, not two.
    //
    // Lefarcen-confirmed path-a (drop-asset + abort + throw 'total'
    // after Promise.all settles): preserves the round-2/3/4 graceful-
    // fallback pattern instead of racing throws between in-flight
    // workers.
    let reads = 0;
    const lyingReader: InlineAssetReader = async (_relPath: string) => ({
      size: 10, // stat lies — actual is 100x
      read: async () => {
        reads += 1;
        return 'x'.repeat(1000);
      },
    });
    const html = '<script src="a.js"></script><script src="b.js"></script>';
    await expect(
      inlineRelativeAssets(html, 'index.html', lyingReader, {
        maxTotalBytes: 500,
        maxReadConcurrency: 1, // sequential so the abort timing is deterministic
      }),
    ).rejects.toMatchObject({ name: 'InlineAssetsLimitError', limit: 'total' });
    // Pre-fix: 2 (helper trusts stat → both reads complete → concat catches).
    // Post-fix: 1 (worker 1 reconciles after read, trips abort; worker 2 skipped).
    expect(reads).toBe(1);
  });

  it('caps concurrent file reads at maxReadConcurrency', async () => {
    // A reader that records peak concurrency inside read(): increments
    // on entry, decrements on exit, tracks the high-water mark. The
    // size lookup is synchronous-fast so it doesn't contribute.
    let inFlight = 0;
    let peak = 0;
    const readerWithCounter = async (relPath: string) => {
      const body = `/* ${relPath} */`;
      return {
        size: Buffer.byteLength(body, 'utf8'),
        read: async () => {
          inFlight += 1;
          if (inFlight > peak) peak = inFlight;
          // Yield a microtask so other concurrent calls can interleave.
          await new Promise((r) => setImmediate(r));
          inFlight -= 1;
          return body;
        },
      };
    };
    const html = Array.from({ length: 20 }, (_, i) =>
      `<link rel="stylesheet" href="a${i}.css">`,
    ).join('');
    await inlineRelativeAssets(html, 'index.html', readerWithCounter, { maxReadConcurrency: 4 });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(0);
  });

  it('does not re-replace a tag literal that appears inside an already-inlined asset body', async () => {
    // Regression for nexu-io/open-design#1312 review feedback (Siri-Ray
    // looper + codex bot): the previous reduce/split-join approach
    // re-scanned the progressively mutated HTML, so a tag literal that
    // happened to appear inside an inlined asset body got the inner
    // literal also replaced — corrupting the body.
    //
    // The reproducer uses two <link rel=stylesheet> tags where a.css's
    // body contains the literal text of b.css's <link> tag (e.g. inside
    // a CSS comment or content: declaration). The </style escape on
    // CSS bodies doesn't touch <link>, so split/join over the mutated
    // HTML finds the literal inside a.css's inline body and replaces
    // it on the second pass — injecting b.css's inline body where the
    // literal comment text used to be.
    const html =
      '<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css">';
    const aCssBody = '/* see also <link rel="stylesheet" href="b.css"> */';
    const bCssBody = 'body{color:red}';
    const out = await inlineRelativeAssets(
      html,
      'index.html',
      readerFrom({ 'a.css': aCssBody, 'b.css': bCssBody }),
    );
    // The literal <link> string inside a.css's comment must survive
    // verbatim — position-based replacement only touches the original
    // outer-tag spans, not text introduced by earlier replacements.
    expect(out).toContain('/* see also <link rel="stylesheet" href="b.css"> */');
    // b.css's body is inlined exactly once, at the real outer tag's
    // position — not injected inside a.css's inline body.
    expect(out.match(/body\{color:red\}/g)?.length).toBe(1);
    // Neither original outer <link href="…"> survives as a URL ref.
    expect(out).not.toMatch(/<link\b[^>]*\bhref="a\.css"/);
    expect(out).not.toMatch(/<link\b[^>]*\bhref="b\.css"(?![^<]*\*\/)/);
  });
});

// ---------------------------------------------------------------------------
// HTTP integration — GET /api/projects/:id/export/*?inline=1
// ---------------------------------------------------------------------------

describe('GET /api/projects/:id/export/*?inline=1 route', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectsRoot: string;
  const projectId = 'proj-export-inline-test';

  const cssBody = 'body{color:#0a0}';
  const jsBody = 'window.OD_EXPORT_OK = 42;';
  const nestedJsBody = 'export const N = 7;';

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const dir = path.join(projectsRoot, projectId);
    const pages = path.join(dir, 'pages');
    const shared = path.join(dir, 'shared');
    await mkdir(dir, { recursive: true });
    await mkdir(pages, { recursive: true });
    await mkdir(shared, { recursive: true });

    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><html><head>' +
        '<link rel="stylesheet" href="app.css">' +
        '<script src="app.js"></script>' +
        '</head><body><div id="root"></div></body></html>',
    );
    await writeFile(path.join(dir, 'app.css'), cssBody);
    await writeFile(path.join(dir, 'app.js'), jsBody);

    await writeFile(
      path.join(dir, 'partial.html'),
      '<!doctype html><html><head>' +
        '<link rel="stylesheet" href="missing.css">' +
        '<script src="app.js"></script>' +
        '</head><body></body></html>',
    );

    await writeFile(
      path.join(pages, 'index.html'),
      '<!doctype html><html><head>' +
        '<script src="../shared/util.js"></script>' +
        '</head></html>',
    );
    await writeFile(path.join(shared, 'util.js'), nestedJsBody);
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const exportUrl = (name: string, query = 'inline=1') =>
    `${baseUrl}/api/projects/${projectId}/export/${name}${query ? `?${query}` : ''}`;

  it('returns a self-contained HTML body when ?inline=1 on a 3-file layout', async () => {
    const res = await fetch(exportUrl('index.html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    // Wiring guard: removing the await inlineRelativeAssets(...) line in the
    // handler fails these assertions, not just the helper-internals tests.
    expect(body).toContain(cssBody);
    expect(body).toContain(jsBody);
    expect(body).not.toContain('href="app.css"');
    expect(body).not.toContain('src="app.js"');
    expect(body).toContain('<style data-od-inline-asset="app.css">');
  });

  it('returns 400 BAD_REQUEST when ?inline is missing', async () => {
    const res = await fetch(exportUrl('index.html', ''));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 for non-canonical inline values (0, false, foo)', async () => {
    for (const q of ['inline=0', 'inline=false', 'inline=foo', 'inline=']) {
      const res = await fetch(exportUrl('index.html', q));
      expect(res.status).toBe(400);
    }
  });

  it('returns 415 UNSUPPORTED_MEDIA_TYPE for non-HTML files', async () => {
    // Drift fix discovered in PR #1312 round-3: the round-1 code emitted
    // `UNSUPPORTED_FILE_TYPE` (status 400) which is not a registered
    // ApiErrorCode in packages/contracts/src/errors.ts. The canonical
    // code for "wrong content type" is UNSUPPORTED_MEDIA_TYPE with HTTP
    // 415, so the route now uses both.
    const res = await fetch(exportUrl('app.css'));
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('returns 404 FILE_NOT_FOUND for a nonexistent file', async () => {
    const res = await fetch(exportUrl('missing.html'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('returns 400 BAD_REQUEST for an invalid project id (..)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/../export/index.html?inline=1`);
    // Express normalizes `..` segments before routing, so this should not
    // reach our handler; the daemon's middleware or routing answers first.
    // Either way, the request must NOT succeed at extracting a parent
    // directory.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects null-origin requests with 403 (export is for same-origin / server-side callers only)', async () => {
    // Unlike /raw/*, the /export/* route is NOT in the daemon's null-
    // origin allowlist (server.ts _NULL_ORIGIN_SAFE_GET_RE). The export
    // consumer set is the daemon UI (same-origin) and server-side
    // screenshot tooling (no Origin header at all); sandboxed-iframe
    // srcdoc previews fetch through /raw/ instead, where each asset has
    // its own URL. This test pins the contract so a future change that
    // adds /export/ to the allowlist has to update it deliberately.
    const res = await fetch(exportUrl('index.html'), { headers: { Origin: 'null' } });
    expect(res.status).toBe(403);
  });

  it('returns 200 with the <link> tag intact when a sibling asset is missing', async () => {
    const res = await fetch(exportUrl('partial.html'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<link rel="stylesheet" href="missing.css">');
    expect(body).toContain(jsBody);
    expect(body).not.toContain('src="app.js"');
  });

  it('inlines a nested HTML entry (pages/index.html + ../shared/util.js)', async () => {
    const res = await fetch(exportUrl('pages/index.html'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(nestedJsBody);
    expect(body).not.toContain('src="../shared/util.js"');
  });

  it('sends Content-Security-Policy: sandbox allow-scripts to block daemon-origin privilege escalation', async () => {
    // PR #1312 round-2 review (lefarcen P2 @ import-export-routes.ts:423):
    // top-level browser navigation to the export URL sends no Origin
    // header, so the daemon middleware lets it through and any JS in
    // the exported document runs with daemon-origin privileges (access
    // to /api/, cookies, localStorage). CSP `sandbox allow-scripts`
    // treats the response like a sandboxed iframe with an opaque origin:
    // scripts execute (which the export needs — that's the whole point
    // of inlining JS) but cannot read cookies, hit /api/, or otherwise
    // escalate to the daemon's origin.
    const res = await fetch(exportUrl('index.html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
  });

  it('accepts inline=true / yes / on / TRUE / Yes / ON (case-insensitive accept list per decision §7)', async () => {
    // PR #1312 round-2 review (lefarcen P3 @ export-inline-route.test.ts:262):
    // PR body decision §7 promises `inline=true/yes/on` case-insensitive
    // matching parseForceInline at file-viewer-render-mode.ts:59-66, but
    // round-1 tests only exercised inline=1. Pin the full accept list.
    for (const q of ['inline=true', 'inline=yes', 'inline=on', 'inline=TRUE', 'inline=Yes', 'inline=ON']) {
      const res = await fetch(exportUrl('index.html', q));
      expect(res.status).toBe(200);
    }
  });

  it('returns 413 PAYLOAD_TOO_LARGE when the owner file blows past the candidates cap', async () => {
    // PR #1312 round-3 (lefarcen P2): the route must surface the
    // InlineAssetsLimitError as a structured 413 envelope, not let it
    // propagate as a 400 BAD_REQUEST. Generated owner has 501
    // `<link rel=stylesheet>` tags, one above the default
    // MAX_INLINE_CANDIDATES (500). The candidates cap fires after
    // matchAll, BEFORE any sibling read, so the fact that `a.css`
    // doesn't exist on disk is irrelevant.
    const dir = path.join(projectsRoot, projectId);
    const huge = '<!doctype html><html><head>' +
      '<link rel="stylesheet" href="a.css">'.repeat(501) +
      '</head></html>';
    await writeFile(path.join(dir, 'too-many-tags.html'), huge);
    const res = await fetch(exportUrl('too-many-tags.html'));
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns 413 (not 415) for an oversize non-HTML file — proves owner cap fires pre-buffer', async () => {
    // PR #1312 round-5 (lefarcen P2): the route must stat the owner with
    // resolveProjectFilePath BEFORE readProjectFile and reject sizes
    // above MAX_INLINE_OWNER_BYTES with 413 PAYLOAD_TOO_LARGE. The
    // Red→Green discriminator is the combination "oversize AND
    // non-HTML": pre-fix, the route reads the buffer first and the
    // text/plain mime check at file.mime fires → 415. Post-fix, the
    // route stats first and the size check fires before the mime
    // check → 413. Asserting "got 413, not 415" pins both the
    // pre-buffer property and the check ordering (size before mime,
    // per lefarcen's locked round-5 sequence).
    //
    // 2 MiB+1 byte fixture is acceptable in test setup; MAX_INLINE_OWNER_BYTES
    // is 2 MiB so this is the minimal fixture that exceeds the cap with the
    // production constant (no test-door needed).
    const dir = path.join(projectsRoot, projectId);
    const overCap = 2 * 1024 * 1024 + 1;
    await writeFile(path.join(dir, 'huge.txt'), Buffer.alloc(overCap, 0x61));
    const res = await fetch(exportUrl('huge.txt'));
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects an invalid project id (chars outside isSafeId char class) with 400 BAD_REQUEST', async () => {
    // PR #1312 round-2 review (lefarcen P3 @ export-inline-route.test.ts:287):
    // the previous `..` test was rejected by Express path normalization
    // before the route saw it, so it didn't actually exercise the
    // isSafeId guard. We need an id that (a) Express passes through
    // unchanged into req.params and (b) isSafeId rejects. The `!` char
    // is URL-safe (no percent-encoding needed) and not in isSafeId's
    // /^[A-Za-z0-9._-]+$/ char class, so it hits the route's first
    // checkpoint and returns the documented envelope.
    const res = await fetch(exportUrl('index.html').replace(`/${projectId}/`, '/bad!id/'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toContain('invalid project id');
  });
});
