import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  InlineAssetsLimitError,
  inlineRelativeAssets,
  type AssetHandle,
  type InlineAssetReader,
} from '../src/inline-assets.js';

// FS-backed reader that mirrors the production GET /api/projects/:id/export
// shape — stat for size, readFile for body — so this suite exercises the
// helper through the same handle contract callers use in apps/daemon/src/
// import-export-routes.ts. The in-memory-reader edge cases live in
// export-inline-route.test.ts; this file covers FS round-trip,
// top-level-vs-nested scoping, and the byte-cap surface that maps to the
// 413 PAYLOAD_TOO_LARGE envelope.

describe('inlineRelativeAssets (FS-backed)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'od-inline-assets-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, body: string | Buffer) {
    const target = path.join(root, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }

  function fsReader(): InlineAssetReader {
    return async (rel) => {
      const abs = path.join(root, rel);
      try {
        const s = await stat(abs);
        const handle: AssetHandle = {
          size: s.size,
          read: async () => {
            try {
              return await readFile(abs, 'utf8');
            } catch {
              return null;
            }
          },
        };
        return handle;
      } catch {
        return null;
      }
    };
  }

  it('inlines a top-level <link rel=stylesheet> as a <style> block', async () => {
    write('a.css', 'body{color:red}');
    const html = '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body></body></html>';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader());
    expect(out).toContain('<style data-od-inline-asset="a.css">');
    expect(out).toContain('body{color:red}');
    expect(out).not.toContain('<link rel="stylesheet" href="a.css">');
  });

  it('inlines a top-level <script src> as an inline <script> with the file body', async () => {
    write('app.js', 'window.OD_OK = 1;');
    const html = '<html><head><script src="app.js"></script></head></html>';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader());
    expect(out).toContain('window.OD_OK = 1;');
    expect(out).not.toContain('src="app.js"');
    expect(out.match(/<script[^>]*>/g)?.length).toBe(1);
  });

  it('does NOT inline a <script> that has no src attribute (already inline)', async () => {
    const html = '<html><head><script>console.log("hi")</script></head></html>';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader());
    // The matcher requires a src=… capture, so a srcless inline script is
    // left exactly as written.
    expect(out).toBe(html);
  });

  it('does NOT inline <link rel=preload> (only rel=stylesheet is in scope)', async () => {
    write('x.css', '.x{}');
    const html = '<link rel="preload" href="x.css">';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader());
    expect(out).toBe(html);
  });

  it('skips absolute http:// and https:// references (only project-relative paths are inlined)', async () => {
    const cases = [
      '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
      '<link rel="stylesheet" href="http://cdn.example.com/x.css">',
      '<script src="https://cdn.example.com/x.js"></script>',
      '<script src="http://cdn.example.com/x.js"></script>',
    ];
    for (const html of cases) {
      const out = await inlineRelativeAssets(html, 'index.html', fsReader());
      expect(out).toBe(html);
    }
  });

  it('skips data: / blob: / leading-slash absolute refs', async () => {
    const cases = [
      '<link rel="stylesheet" href="data:text/css,body{}">',
      '<link rel="stylesheet" href="blob:abc">',
      '<link rel="stylesheet" href="/abs/path.css">',
      '<script src="data:text/javascript,1+1"></script>',
      '<script src="/abs/x.js"></script>',
    ];
    for (const html of cases) {
      const out = await inlineRelativeAssets(html, 'index.html', fsReader());
      expect(out).toBe(html);
    }
  });

  it('leaves a referenced file alone (URL ref preserved) when the file is missing on disk', async () => {
    const html = '<link rel="stylesheet" href="missing.css">';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader());
    expect(out).toContain('<link rel="stylesheet" href="missing.css">');
  });

  it('mixes a present and a missing asset — the present one inlines, the missing one stays as a URL ref', async () => {
    write('present.js', 'ok');
    const html =
      '<link rel="stylesheet" href="missing.css"><script src="present.js"></script>';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader());
    expect(out).toContain('<link rel="stylesheet" href="missing.css">');
    expect(out).toContain('ok');
    expect(out).not.toContain('src="present.js"');
  });

  it('resolves a sibling asset relative to a nested owner path (../shared/util.js)', async () => {
    write('shared/util.js', 'export const N = 7;');
    const html = '<script src="../shared/util.js"></script>';
    const out = await inlineRelativeAssets(html, 'pages/index.html', fsReader());
    expect(out).toContain('export const N = 7;');
    expect(out).not.toContain('src="../shared/util.js"');
  });

  it('throws InlineAssetsLimitError("owner") with limit="owner" when the owner HTML exceeds maxOwnerBytes', async () => {
    const html = '<html><head>' + 'x'.repeat(500) + '</head></html>';
    await expect(
      inlineRelativeAssets(html, 'index.html', fsReader(), { maxOwnerBytes: 100 }),
    ).rejects.toBeInstanceOf(InlineAssetsLimitError);
    await expect(
      inlineRelativeAssets(html, 'index.html', fsReader(), { maxOwnerBytes: 100 }),
    ).rejects.toMatchObject({ name: 'InlineAssetsLimitError', limit: 'owner' });
  });

  it('throws InlineAssetsLimitError("candidates") when tag matches exceed maxCandidates', async () => {
    const html = Array.from({ length: 5 }, (_, i) =>
      `<link rel="stylesheet" href="a${i}.css">`,
    ).join('');
    await expect(
      inlineRelativeAssets(html, 'index.html', fsReader(), { maxCandidates: 3 }),
    ).rejects.toMatchObject({ name: 'InlineAssetsLimitError', limit: 'candidates' });
  });

  it('throws InlineAssetsLimitError("total") when the assembled output exceeds maxTotalBytes', async () => {
    write('a.css', 'x'.repeat(800));
    write('b.css', 'x'.repeat(800));
    const html = '<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css">';
    await expect(
      inlineRelativeAssets(html, 'index.html', fsReader(), { maxTotalBytes: 1000 }),
    ).rejects.toMatchObject({ name: 'InlineAssetsLimitError', limit: 'total' });
  });

  it('leaves a single oversize asset as a URL ref (graceful per-asset fallback) without throwing', async () => {
    write('big.css', 'a'.repeat(2000));
    write('small.css', '.s{}');
    const html =
      '<link rel="stylesheet" href="big.css"><link rel="stylesheet" href="small.css">';
    const out = await inlineRelativeAssets(html, 'index.html', fsReader(), {
      maxAssetBytes: 1000,
    });
    expect(out).toContain('<link rel="stylesheet" href="big.css">');
    expect(out).toContain('.s{}');
    expect(out).not.toContain('href="small.css"');
  });
});
