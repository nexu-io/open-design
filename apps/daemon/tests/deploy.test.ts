import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  analyzeDeployPlan,
  buildDeployFilePlan,
  buildDeployFileSet,
  checkDeploymentUrl,
  DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES,
  DEPLOY_PREFLIGHT_LARGE_HTML_BYTES,
  deploymentUrlCandidates,
  extractCssReferences,
  extractHtmlReferences,
  extractInlineCssReferences,
  injectDeployHookScript,
  isVercelProtectedResponse,
  normalizeDeployHookScriptUrl,
  prepareDeployPreflight,
  resolveReferencedPath,
  rewriteCssReferences,
  rewriteEntryHtmlReferences,
  waitForReachableDeploymentUrl,
} from '../src/deploy.js';
import { ensureProject } from '../src/projects.js';

async function setupProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-test-'));
  const projectId = 'p1';
  const dir = await ensureProject(path.join(root, 'projects'), projectId);
  return { projectsRoot: path.join(root, 'projects'), projectId, dir };
}

describe('deploy file set', () => {
  it('deploys a single html file as index.html', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'page.html'), '<!doctype html><h1>Hello</h1>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'page.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('injects a closeable deploy hook script from cdn when configured', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'page.html'), '<!doctype html><body><h1>Hello</h1></body>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'page.html', {
      hookScriptUrl: 'https://cdn.example.com/open-design-hook.js',
    });
    const html = files.find((f) => f.file === 'index.html')?.data.toString('utf8') ?? '';

    expect(html).toContain(
      '<script src="https://cdn.example.com/open-design-hook.js" defer data-open-design-deploy-hook="true" data-closeable="true"></script></body>',
    );
  });

  it('includes referenced html and css assets', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<link href="style.css" rel="stylesheet"><script src="app.js"></script><img src="assets/logo.png">',
    );
    await writeFile(path.join(dir, 'style.css'), '@import "./theme.css"; body{background:url("assets/bg.png")}');
    await writeFile(path.join(dir, 'theme.css'), '@font-face{src:url("font.woff2")}');
    await writeFile(path.join(dir, 'app.js'), 'console.log("ok")');
    await writeFile(path.join(dir, 'font.woff2'), 'font');
    await writeFile(path.join(dir, 'assets', 'logo.png'), 'logo');
    await writeFile(path.join(dir, 'assets', 'bg.png'), 'bg');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'app.js',
      'assets/bg.png',
      'assets/logo.png',
      'font.woff2',
      'index.html',
      'style.css',
      'theme.css',
    ]);
  });

  it('rewrites subdirectory html references to preserved project paths', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><img src="assets/logo.png?cache=1#mark"><img src="/assets/root.png"><img srcset="assets/small.png 1x, assets/large.png 2x">',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'logo.png'), 'logo');
    await writeFile(path.join(dir, 'sub', 'assets', 'small.png'), 'small');
    await writeFile(path.join(dir, 'sub', 'assets', 'large.png'), 'large');
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'assets', 'root.png'), 'root');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'assets/root.png',
      'index.html',
      'sub/assets/large.png',
      'sub/assets/logo.png',
      'sub/assets/small.png',
    ]);
    expect(index?.data.toString('utf8')).toContain('src="sub/assets/logo.png?cache=1#mark"');
    expect(index?.data.toString('utf8')).toContain('src="/assets/root.png"');
    expect(index?.data.toString('utf8')).toContain(
      'srcset="sub/assets/small.png 1x, sub/assets/large.png 2x"',
    );
  });

  it('keeps css content unchanged while deploying subdirectory css assets', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'sub', 'page.html'), '<link href="style.css" rel="stylesheet">');
    await writeFile(path.join(dir, 'sub', 'style.css'), 'body{background:url("assets/bg.png")}');
    await writeFile(path.join(dir, 'sub', 'assets', 'bg.png'), 'bg');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');
    const css = files.find((f) => f.file === 'sub/style.css');

    expect(files.map((f) => f.file).sort()).toEqual([
      'index.html',
      'sub/assets/bg.png',
      'sub/style.css',
    ]);
    expect(index?.data.toString('utf8')).toContain('href="sub/style.css"');
    expect(css?.data.toString('utf8')).toBe('body{background:url("assets/bg.png")}');
  });

  it('rejects missing referenced local files', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'index.html'), '<img src="missing.png">');

    await expect(buildDeployFileSet(projectsRoot, projectId, 'index.html')).rejects.toMatchObject({
      details: { missing: ['missing.png'] },
    });
  });

  it('does not treat navigation hrefs as deploy dependencies', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><a href="/pricing">Pricing</a><a href="contact">Contact</a>',
    );

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
    expect(index?.data.toString('utf8')).toContain('href="/pricing"');
    expect(index?.data.toString('utf8')).toContain('href="contact"');
  });

  it('collects and rewrites unquoted asset attributes', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><img src=assets/logo.png><video poster=assets/poster.png></video>',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'logo.png'), 'logo');
    await writeFile(path.join(dir, 'sub', 'assets', 'poster.png'), 'poster');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'index.html',
      'sub/assets/logo.png',
      'sub/assets/poster.png',
    ]);
    expect(index?.data.toString('utf8')).toContain('src=sub/assets/logo.png');
    expect(index?.data.toString('utf8')).toContain('poster=sub/assets/poster.png');
  });

  it('ignores arbitrary URI schemes in html references', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<iframe src="about:blank"></iframe><a href="ftp://example.com/file">ftp</a><a href="sms:+15555550123">sms</a>',
    );

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('ignores src-like text inside inline scripts', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><script>const text = \'<img src="missing.png">\';</script>',
    );

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('collects and rewrites unquoted stylesheet links', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub'), { recursive: true });
    await writeFile(path.join(dir, 'sub', 'page.html'), '<link href=style.css rel=stylesheet>');
    await writeFile(path.join(dir, 'sub', 'style.css'), 'body{color:red}');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/style.css']);
    expect(index?.data.toString('utf8')).toContain('href=sub/style.css');
  });

  it('ignores remote, data, blob, mail, and anchor references', () => {
    const refs = extractHtmlReferences(
      '<a href="#x"></a><img src="https://x.test/a.png"><img src="data:image/png,abc"><script src="//cdn.test/a.js"></script><a href="mailto:a@test.com"></a>',
    )
      .map((ref) => resolveReferencedPath(ref, '.'))
      .filter(Boolean);

    expect(refs).toEqual([]);
  });

  it('extracts css imports and urls', () => {
    expect(extractCssReferences('@import "./theme.css"; body{background:url("img/bg.png")}')).toEqual([
      'img/bg.png',
      './theme.css',
    ]);
  });

  it('rewrites only local relative entry references', () => {
    expect(
      rewriteEntryHtmlReferences(
        '<a href="#x"></a><img src="https://x.test/a.png"><img src="data:image/png,abc"><script src="//cdn.test/a.js"></script><img src="asset.png">',
        'sub',
      ),
    ).toContain('src="sub/asset.png"');
  });

  it('ignores invalid deploy hook script urls', () => {
    expect(injectDeployHookScript('<body></body>', 'javascript:alert(1)')).toBe('<body></body>');
    expect(normalizeDeployHookScriptUrl('https://cdn.example.com/hook.js')).toBe(
      'https://cdn.example.com/hook.js',
    );
  });

  it('extracts url() and @import refs from inline <style> blocks', () => {
    const refs = extractInlineCssReferences(
      '<!doctype html><style>@import "theme.css";body{background:url("bg.png")}</style>',
    );
    expect(refs.sort()).toEqual(['bg.png', 'theme.css']);
  });

  it('extracts url() refs from style="" attributes', () => {
    const refs = extractInlineCssReferences(
      "<div style=\"background:url('bg.png')\"></div><span style=\"--bg:url(/abs.png)\"></span>",
    );
    expect(refs.sort()).toEqual(['/abs.png', 'bg.png']);
  });

  it('skips style-like text inside scripts and comments', () => {
    const refs = extractInlineCssReferences(
      '<!-- <style>body{background:url("ghost.png")}</style> -->' +
        '<script>const css = \'<style>body{background:url("missing.png")}</style>\';</script>',
    );
    expect(refs).toEqual([]);
  });

  it('rewrites url() and @import refs in css content relative to baseDir', () => {
    expect(
      rewriteCssReferences(
        '@import "theme.css";body{background:url("bg.png")}',
        'sub',
      ),
    ).toBe('@import "sub/theme.css";body{background:url("sub/bg.png")}');
  });

  it('keeps remote, data, and absolute css refs intact when rewriting', () => {
    expect(
      rewriteCssReferences(
        'body{background:url("https://cdn.test/a.png");--data:url(data:image/png,abc);--root:url("/abs.png")}',
        'sub',
      ),
    ).toBe(
      'body{background:url("https://cdn.test/a.png");--data:url(data:image/png,abc);--root:url("/abs.png")}',
    );
  });

  it('bundles assets referenced from inline <style> blocks', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await mkdir(path.join(dir, 'fonts'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><style>' +
        '@import "theme.css";' +
        "body{background:url('assets/bg.png')}" +
        '@font-face{font-family:Custom;src:url("fonts/custom.woff2") format("woff2");}' +
        '</style>',
    );
    await writeFile(path.join(dir, 'theme.css'), 'body{color:red}');
    await writeFile(path.join(dir, 'assets', 'bg.png'), 'bg');
    await writeFile(path.join(dir, 'fonts', 'custom.woff2'), 'font');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual([
      'assets/bg.png',
      'fonts/custom.woff2',
      'index.html',
      'theme.css',
    ]);
  });

  it('bundles assets referenced from style="" attributes', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><div style="background:url(\'assets/hero.png\')">x</div>',
    );
    await writeFile(path.join(dir, 'assets', 'hero.png'), 'hero');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['assets/hero.png', 'index.html']);
  });

  it('rewrites inline <style> url() refs when entry is in a subdirectory', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><style>body{background:url("assets/bg.png")}</style>',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'bg.png'), 'bg');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/assets/bg.png']);
    expect(index?.data.toString('utf8')).toContain('url("sub/assets/bg.png")');
  });

  it('rewrites style="" url() refs when entry is in a subdirectory', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      "<!doctype html><div style=\"background:url('hero.png')\">x</div>",
    );
    await writeFile(path.join(dir, 'sub', 'hero.png'), 'hero');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/hero.png']);
    expect(index?.data.toString('utf8')).toContain("url('sub/hero.png')");
  });

  it('reports inline <style> assets that are missing on disk', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><style>body{background:url("assets/missing.png")}</style>',
    );

    await expect(
      buildDeployFileSet(projectsRoot, projectId, 'index.html'),
    ).rejects.toMatchObject({
      details: { missing: ['assets/missing.png'] },
    });
  });

  it('extracts and rewrites url() refs from <style> inside <svg>', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'sub', 'page.html'),
      '<!doctype html><svg><style>circle{fill:url("assets/icon.svg")}</style></svg>',
    );
    await writeFile(path.join(dir, 'sub', 'assets', 'icon.svg'), '<svg/>');

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'sub/assets/icon.svg']);
    expect(index?.data.toString('utf8')).toContain('url("sub/assets/icon.svg")');
  });

  it('does not rewrite <style>-like text inside <script> string literals', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'sub'), { recursive: true });
    const html =
      '<!doctype html><script>const tpl = \'<style>body{background:url("assets/bg.png")}</style>\';</script>';
    await writeFile(path.join(dir, 'sub', 'page.html'), html);

    const files = await buildDeployFileSet(projectsRoot, projectId, 'sub/page.html');
    const index = files.find((f) => f.file === 'index.html');

    // The fake <style> lives inside a JS string literal, so it must not
    // be processed as inline CSS: no asset is bundled and the script
    // body is preserved byte-for-byte.
    expect(files.map((f) => f.file)).toEqual(['index.html']);
    expect(index?.data.toString('utf8')).toContain(
      "const tpl = '<style>body{background:url(\"assets/bg.png\")}</style>';",
    );
  });

  it('does not rewrite <style>-like text inside HTML comments', () => {
    const html =
      '<!doctype html><!-- <style>body{background:url("ghost.png")}</style> --><h1>x</h1>';
    expect(rewriteEntryHtmlReferences(html, 'sub')).toBe(html);
  });

  it('runs in linear time on pathological unclosed url(', () => {
    const huge = '('.repeat(100_000);
    const input = `body{background:url${huge}}`;
    const startExtract = Date.now();
    const refs = extractCssReferences(input);
    expect(Date.now() - startExtract).toBeLessThan(500);
    expect(refs).toEqual([]);

    const startRewrite = Date.now();
    expect(rewriteCssReferences(input, 'sub')).toBe(input);
    expect(Date.now() - startRewrite).toBeLessThan(500);
  });
});

describe('deploy plan and analyzer', () => {
  async function setupProject() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-plan-test-'));
    const projectId = 'p1';
    const dir = await ensureProject(path.join(root, 'projects'), projectId);
    return { projectsRoot: path.join(root, 'projects'), projectId, dir };
  }

  it('returns the file set plus missing and invalid lists without throwing', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><img src="missing.png">',
    );

    const plan = await buildDeployFilePlan(projectsRoot, projectId, 'index.html');
    expect(plan.entryPath).toBe('index.html');
    expect(plan.files.map((f) => f.file)).toEqual(['index.html']);
    expect(plan.missing).toEqual(['missing.png']);
    expect(plan.invalid).toEqual([]);
  });

  it('flags missing assets as broken-reference warnings', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: Buffer.from('<!doctype html>'), contentType: 'text/html', sourcePath: 'index.html' },
      ],
      missing: ['logo.png'],
      invalid: [],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'broken-reference', path: 'logo.png' }),
    );
  });

  it('flags invalid references separately from missing ones', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [],
      missing: [],
      invalid: ['../escape.png'],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'invalid-reference', path: '../escape.png' }),
    );
  });

  it('flags missing doctype and viewport', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<html><body><h1>hi</h1></body></html>',
      files: [],
    });
    const codes = warnings.map((w) => w.code).sort();
    expect(codes).toEqual(['no-doctype', 'no-viewport']);
  });

  it('flags missing doctype even when a fake doctype lives inside a <script> string', () => {
    const html =
      '<html>' +
      '<head><meta name="viewport" content="width=device-width">' +
      '<script>const tpl = `<!doctype html><html></html>`;</script>' +
      '</head><body><h1>hi</h1></body></html>';
    const { warnings } = analyzeDeployPlan({ entryPath: 'index.html', html, files: [] });
    expect(warnings.map((w: any) => w.code)).toContain('no-doctype');
  });

  it('accepts a doctype that follows a leading HTML comment and BOM', () => {
    const html =
      '﻿<!-- generated 2026-05-02 -->\n<!doctype html>' +
      '<meta name="viewport" content="width=device-width">' +
      '<h1>hi</h1>';
    const { warnings } = analyzeDeployPlan({ entryPath: 'index.html', html, files: [] });
    expect(warnings.map((w: any) => w.code)).not.toContain('no-doctype');
  });

  it('flags external scripts and stylesheets', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html:
        '<!doctype html><meta name="viewport" content="width=device-width">' +
        '<link rel="stylesheet" href="https://cdn.test/x.css">' +
        '<script src="https://cdn.test/x.js"></script>',
      files: [],
    });
    const codes = warnings.map((w) => w.code).sort();
    expect(codes).toEqual(['external-script', 'external-stylesheet']);
    const ext = warnings.find((w) => w.code === 'external-script');
    expect(ext?.url).toBe('https://cdn.test/x.js');
  });

  it('does not flag protocol-relative scripts as external when they are in fact external', () => {
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html:
        '<!doctype html><meta name="viewport" content="width=device-width">' +
        '<script src="//cdn.test/x.js"></script>',
      files: [],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'external-script', url: '//cdn.test/x.js' }),
    );
  });

  it('flags large per-file assets but not the entry HTML', () => {
    const big = Buffer.alloc(DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES + 1);
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: Buffer.alloc(50), contentType: 'text/html', sourcePath: 'index.html' },
        { file: 'hero.jpg', data: big, contentType: 'image/jpeg', sourcePath: 'hero.jpg' },
      ],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'large-asset', path: 'hero.jpg' }),
    );
    expect(warnings.some((w) => w.code === 'large-html')).toBe(false);
  });

  it('flags large entry HTML', () => {
    const huge = Buffer.alloc(DEPLOY_PREFLIGHT_LARGE_HTML_BYTES + 1);
    const { warnings } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: huge, contentType: 'text/html', sourcePath: 'index.html' },
      ],
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'large-html', path: 'index.html' }),
    );
  });

  it('reports large-html against the source entry path, not the renamed deploy file', () => {
    const huge = Buffer.alloc(DEPLOY_PREFLIGHT_LARGE_HTML_BYTES + 1);
    const { warnings } = analyzeDeployPlan({
      entryPath: 'pages/landing.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width">',
      files: [
        { file: 'index.html', data: huge, contentType: 'text/html', sourcePath: 'pages/landing.html' },
      ],
    });
    const found = warnings.find((w: any) => w.code === 'large-html');
    expect(found?.path).toBe('pages/landing.html');
  });

  it('returns no warnings on a healthy entry HTML', () => {
    const { warnings, totalFiles, totalBytes } = analyzeDeployPlan({
      entryPath: 'index.html',
      html: '<!doctype html><meta name="viewport" content="width=device-width"><h1>Hello</h1>',
      files: [
        { file: 'index.html', data: Buffer.from('<!doctype html><h1>Hello</h1>'), contentType: 'text/html', sourcePath: 'index.html' },
      ],
    });
    expect(warnings).toEqual([]);
    expect(totalFiles).toBe(1);
    expect(totalBytes).toBeGreaterThan(0);
  });

  it('preflight payload includes provider, entry, file list, totals and warnings', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width">' +
        '<script src="https://cdn.test/x.js"></script>' +
        '<img src="assets/logo.png">',
    );
    await writeFile(path.join(dir, 'assets', 'logo.png'), 'logo');

    const result = await prepareDeployPreflight(projectsRoot, projectId, 'index.html');
    expect(result.providerId).toBe('vercel-self');
    expect(result.entry).toBe('index.html');
    expect(result.totalFiles).toBe(2);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.files.map((f) => f.path).sort()).toEqual(['assets/logo.png', 'index.html']);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('external-script');
    expect(codes).not.toContain('broken-reference');
  });

  it('preflight reports broken references instead of throwing', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><img src="missing.png">',
    );

    const result = await prepareDeployPreflight(projectsRoot, projectId, 'index.html');
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'broken-reference', path: 'missing.png' }),
    );
    expect(result.totalFiles).toBe(1);
  });

  it('preflight rejects non-html entry names', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'data.json'), '{}');
    await expect(
      prepareDeployPreflight(projectsRoot, projectId, 'data.json'),
    ).rejects.toThrow(/HTML/);
  });

  it('buildDeployFileSet still throws when missing or invalid refs exist', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'index.html'), '<img src="missing.png">');
    await expect(
      buildDeployFileSet(projectsRoot, projectId, 'index.html'),
    ).rejects.toMatchObject({ details: { missing: ['missing.png'] } });
  });
});

describe('deployment link readiness', () => {
  async function withServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
    run: (url: string) => Promise<void>,
  ) {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;
    try {
      await run(url);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('marks a reachable public URL as ready', async () => {
    await withServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    }, async (url) => {
      await expect(checkDeploymentUrl(url)).resolves.toMatchObject({ reachable: true });
    });
  });

  it('keeps the URL when public link readiness times out', async () => {
    const result = await waitForReachableDeploymentUrl(['http://127.0.0.1:9'], {
      timeoutMs: 1,
      intervalMs: 1,
    });

    expect(result).toMatchObject({
      status: 'link-delayed',
      url: 'http://127.0.0.1:9',
    });
  });

  it('marks a Vercel authentication page as protected', async () => {
    await withServer((_req, res) => {
      res.writeHead(401, {
        server: 'Vercel',
        'set-cookie': '_vercel_sso_nonce=test; Path=/; HttpOnly',
        'content-type': 'text/html',
      });
      res.end('<title>Authentication Required</title><body>Vercel Authentication</body>');
    }, async (url) => {
      await expect(checkDeploymentUrl(url)).resolves.toMatchObject({
        reachable: false,
        status: 'protected',
      });
    });
  });

  it('returns protected without waiting for timeout', async () => {
    await withServer((_req, res) => {
      res.writeHead(401, { server: 'Vercel' });
      res.end('Authentication Required');
    }, async (url) => {
      const result = await waitForReachableDeploymentUrl([url], {
        timeoutMs: 5_000,
        intervalMs: 1_000,
      });

      expect(result).toMatchObject({
        status: 'protected',
        url,
      });
    });
  });

  it('uses the first reachable candidate URL', async () => {
    await withServer((_req, res) => {
      res.writeHead(204);
      res.end();
    }, async (url) => {
      const result = await waitForReachableDeploymentUrl(['http://127.0.0.1:9', url], {
        timeoutMs: 100,
        intervalMs: 1,
      });

      expect(result).toMatchObject({
        status: 'ready',
        url,
      });
    });
  });

  it('collects deployment URL aliases as candidates', () => {
    expect(
      deploymentUrlCandidates(
        { url: 'primary.vercel.app', alias: ['alias.vercel.app'] },
        { aliases: [{ domain: 'domain.vercel.app' }, 'plain.vercel.app'] },
      ),
    ).toEqual([
      'https://primary.vercel.app',
      'https://alias.vercel.app',
      'https://domain.vercel.app',
      'https://plain.vercel.app',
    ]);
  });

  it('recognizes Vercel protection signals', () => {
    const headers = new Headers({
      server: 'Vercel',
      'set-cookie': '_vercel_sso_nonce=test',
    });
    expect(isVercelProtectedResponse({ headers }, 'Authentication Required')).toBe(true);
  });
});
