import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeDeployPlan,
  buildDeployFilePlan,
  buildDeployFileSet,
  checkDeploymentUrl,
  chunkCloudflarePagesAssetUploads,
  CLOUDFLARE_PAGES_ASSET_MAX_BYTES,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  cloudflarePagesAssetHash,
  cloudflarePagesProjectNameForProject,
  DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES,
  DEPLOY_PREFLIGHT_LARGE_HTML_BYTES,
  deploymentUrlCandidates,
  deployToCloudflarePages,
  deployConfigPath,
  extractCssReferences,
  extractHtmlReferences,
  extractInlineCssReferences,
  injectDeployHookScript,
  isVercelProtectedResponse,
  listCloudflarePagesZones,
  normalizeDeployHookScriptUrl,
  prepareDeployPreflight,
  publicDeployConfig,
  readVercelConfig,
  resolveReferencedPath,
  rewriteCssReferences,
  rewriteEntryHtmlReferences,
  SAVED_CLOUDFLARE_TOKEN_MASK,
  SAVED_TOKEN_MASK,
  VERCEL_PROVIDER_ID,
  waitForReachableDeploymentUrl,
  writeCloudflarePagesConfig,
  writeVercelConfig,
} from '../src/deploy.js';
import { closeDatabase, getDeployment, insertProject, openDatabase, upsertDeployment } from '../src/db.js';
import { ensureProject } from '../src/projects.js';

async function setupProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-test-'));
  const projectId = 'p1';
  const dir = await ensureProject(path.join(root, 'projects'), projectId);
  return { projectsRoot: path.join(root, 'projects'), projectId, dir };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeDatabase();
});

describe('deploy config', () => {
  it('stores Vercel credentials in vercel.json and returns only the public mask', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-test-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saved = await writeVercelConfig({
        token: 'vercel-token-secret',
        teamId: 'team_123',
        teamSlug: 'design-team',
      });

      expect(path.basename(deployConfigPath())).toBe('vercel.json');
      expect(saved).toEqual({
        providerId: VERCEL_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_TOKEN_MASK,
        teamId: 'team_123',
        teamSlug: 'design-team',
        target: 'preview',
      });
      expect(JSON.parse(await readFile(deployConfigPath(), 'utf8'))).toEqual({
        token: 'vercel-token-secret',
        teamId: 'team_123',
        teamSlug: 'design-team',
      });

      const maskedUpdate = await writeVercelConfig({
        token: SAVED_TOKEN_MASK,
        teamSlug: 'renamed-team',
      });

      expect(maskedUpdate.tokenMask).toBe(SAVED_TOKEN_MASK);
      expect(await readVercelConfig()).toEqual({
        token: 'vercel-token-secret',
        teamId: 'team_123',
        teamSlug: 'renamed-team',
      });
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('keeps Vercel public config provider metadata stable', () => {
    expect(publicDeployConfig({
      token: 'vercel-token-secret',
      teamId: '',
      teamSlug: '',
    })).toEqual({
      providerId: VERCEL_PROVIDER_ID,
      configured: true,
      tokenMask: SAVED_TOKEN_MASK,
      teamId: '',
      teamSlug: '',
      target: 'preview',
    });
  });

  it('stores Cloudflare Pages credentials separately from vercel.json', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-test-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saved = await writeCloudflarePagesConfig({
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
      });

      expect(path.basename(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID))).toBe('cloudflare-pages.json');
      expect(path.basename(deployConfigPath(VERCEL_PROVIDER_ID))).toBe('vercel.json');
      expect(saved).toEqual({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        teamId: '',
        teamSlug: '',
        accountId: 'account_123',
        projectName: '',
        target: 'preview',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: '',
      });

      const maskedUpdate = await writeCloudflarePagesConfig({
        token: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
      });

      expect(maskedUpdate.tokenMask).toBe(SAVED_CLOUDFLARE_TOKEN_MASK);
      expect(maskedUpdate.accountId).toBe('account_456');
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_456',
        projectName: '',
      });

      const withDomainHints = await writeCloudflarePagesConfig({
        token: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
        cloudflarePages: {
          lastZoneId: 'zone-1',
          lastZoneName: 'example.com',
          lastDomainPrefix: 'demo',
        },
      });
      expect((withDomainHints as any).cloudflarePages).toEqual({
        lastZoneId: 'zone-1',
        lastZoneName: 'example.com',
        lastDomainPrefix: 'demo',
      });

      const withoutDomainPrefix = await writeCloudflarePagesConfig({
        token: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_456',
        cloudflarePages: {
          lastZoneId: 'zone-1',
          lastZoneName: 'example.com',
        },
      });
      expect((withoutDomainPrefix as any).cloudflarePages).toEqual({
        lastZoneId: 'zone-1',
        lastZoneName: 'example.com',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toMatchObject({
        cloudflarePages: {
          lastZoneId: 'zone-1',
          lastZoneName: 'example.com',
        },
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8')).cloudflarePages).not.toHaveProperty(
        'lastDomainPrefix',
      );
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('requires Cloudflare Pages token and account id while deriving project names automatically', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-config-required-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      await expect(writeCloudflarePagesConfig({
        token: 'cloudflare-token-secret',
      })).rejects.toThrow(/account ID is required/i);
      await expect(writeCloudflarePagesConfig({
        accountId: 'account_123',
      })).rejects.toThrow(/API token is required/i);
      expect(cloudflarePagesProjectNameForProject('project-123', 'AI 生图网站')).toBe(
        'od-ai-project-123',
      );
      expect(cloudflarePagesProjectNameForProject('12345678', '中文项目')).toBe(
        'od-project-12345678',
      );
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

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

  it('preflight preserves provider identity when requested', async () => {
    const { projectsRoot, projectId, dir } = await setupProject();
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><h1>Hello</h1>');

    const result = await prepareDeployPreflight(projectsRoot, projectId, 'index.html', {
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
    });
    expect(result.providerId).toBe(CLOUDFLARE_PAGES_PROVIDER_ID);
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

describe('cloudflare pages deploys', () => {
  function customDomainRequestInfo(input: string | URL | Request, init?: RequestInit) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    const method =
      init?.method || (input instanceof Request ? input.method : 'GET');
    return { url, method };
  }

  function createCustomDomainDeployMock(options: {
    dnsRecords?: Array<Record<string, unknown>>;
    dnsRecordsAfterDuplicate?: Array<Record<string, unknown>>;
    dnsCreateAlreadyExists?: boolean;
    dnsCreateRejectsComment?: boolean;
    pagesDomains?: Array<Record<string, unknown>>;
    pagesDomainPages?: Array<Array<Record<string, unknown>>>;
    customHeadStatus?: number;
  } = {}) {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let dnsCreateCount = 0;
    let dnsLookupCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const { url, method } = customDomainRequestInfo(input, init);
      calls.push({ url, method, body: init?.body });

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_custom', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        dnsLookupCount += 1;
        const result = options.dnsRecordsAfterDuplicate && dnsLookupCount > 1
          ? options.dnsRecordsAfterDuplicate
          : options.dnsRecords ?? [];
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records') && method === 'POST') {
        dnsCreateCount += 1;
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (options.dnsCreateRejectsComment && dnsCreateCount === 1) {
          expect(body).toHaveProperty('comment');
          return new Response(JSON.stringify({
            success: false,
            errors: [{ message: 'comment is not allowed for this token' }],
          }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (options.dnsCreateAlreadyExists && dnsCreateCount === 1) {
          return new Response(JSON.stringify({
            success: false,
            errors: [{ message: 'DNS record already exists' }],
          }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records/dns-1') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/pages/projects/demo-pages/domains?') && method === 'GET') {
        const requestUrl = new URL(url);
        const page = Number(requestUrl.searchParams.get('page') || '1');
        const domainPages = options.pagesDomainPages;
        const result = domainPages ? domainPages[page - 1] ?? [] : options.pagesDomains ?? [];
        return new Response(JSON.stringify({
          success: true,
          result,
          result_info: {
            page,
            per_page: 100,
            total_pages: domainPages?.length || 1,
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { name: 'demo.example.com', status: 'active' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo.example.com' && method === 'HEAD') {
        return new Response('', { status: options.customHeadStatus ?? 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    return { calls, fetchMock };
  }

  async function deployWithCustomDomain(options: {
    priorMetadata?: Record<string, unknown>;
  } = {}) {
    return deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      priorMetadata: options.priorMetadata,
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });
  }

  it('chunks asset uploads before posting to Cloudflare Pages', () => {
    const chunks = chunkCloudflarePagesAssetUploads(
      [
        { hash: 'a'.repeat(32), data: Buffer.from('one'), contentType: 'text/plain' },
        { hash: 'b'.repeat(32), data: Buffer.from('two'), contentType: 'text/plain' },
        { hash: 'c'.repeat(32), data: Buffer.from('three'), contentType: 'text/plain' },
      ],
      { maxFiles: 2, maxBytes: 10_000 },
    );

    expect(chunks.map((chunk) => chunk.map((file) => file.hash))).toEqual([
      ['a'.repeat(32), 'b'.repeat(32)],
      ['c'.repeat(32)],
    ]);
  });

  it('rejects Cloudflare Pages assets above the per-file upload limit', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      files: [
        {
          file: 'huge.bin',
          data: Buffer.alloc(CLOUDFLARE_PAGES_ASSET_MAX_BYTES + 1),
          contentType: 'application/octet-stream',
          sourcePath: 'huge.bin',
        },
      ],
    })).rejects.toThrow(/25\.00 MiB or smaller/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates missing projects and uploads assets before submitting a manifest', async () => {
    const requests: Array<{ url: string; method: string; body?: any; headers: Headers }> = [];
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const assetHash = cloudflarePagesAssetHash({
      file: 'assets/style.css',
      data: Buffer.from('body { color: red; }'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined),
      );
      requests.push({ url, method, body: init?.body, headers });

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body).toEqual({
          name: 'demo-pages',
          production_branch: 'main',
        });
        return new Response(JSON.stringify({ success: true, result: { name: body.name } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer pages-upload-jwt');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({
          hashes: [indexHash, assetHash],
        });
        return new Response(JSON.stringify({ success: true, result: [indexHash, assetHash] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/upload') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer pages-upload-jwt');
        expect(JSON.parse(String(init?.body ?? '[]'))).toEqual([
          {
            key: indexHash,
            value: Buffer.from('hello index').toString('base64'),
            metadata: { contentType: 'text/html' },
            base64: true,
          },
          {
            key: assetHash,
            value: Buffer.from('body { color: red; }').toString('base64'),
            metadata: { contentType: 'text/css' },
            base64: true,
          },
        ]);
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer pages-upload-jwt');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({
          hashes: [indexHash, assetHash],
        });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        const form = init?.body as FormData;
        expect(form).toBeInstanceOf(FormData);
        const manifest = JSON.parse(String(form?.get('manifest') ?? '{}')) as Record<string, string>;
        expect(form.get('branch')).toBe('main');
        expect(form.get('pages_build_output_dir')).toBeNull();
        expect(manifest).toEqual({
          '/index.html': indexHash,
          '/assets/style.css': assetHash,
        });
        expect(form.get(indexHash)).toBeNull();
        expect(form.get(assetHash)).toBeNull();
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_123', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
        {
          file: 'assets/style.css',
          data: Buffer.from('body { color: red; }'),
          contentType: 'text/css',
          sourcePath: 'assets/style.css',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'dep_123',
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
    });
    expect(requests).toHaveLength(8);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer cloudflare-token-secret');
  });

  it('treats concurrent Cloudflare Pages project creation races as already satisfied', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    let projectLookupCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        projectLookupCount += 1;
        if (projectLookupCount === 1) {
          return new Response(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects') && method === 'POST') {
        return new Response(
          JSON.stringify({ success: false, errors: [{ message: 'Project already exists' }] }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_123', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'dep_123',
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
    });
    expect(projectLookupCount).toBe(2);
  });

  it('rejects invalid custom-domain prefix before creating a Pages deployment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'bad.prefix',
      },
      files: [],
    })).rejects.toThrow(/valid subdomain prefix/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects stale Cloudflare zone selections before creating a Pages deployment', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'other.example', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [],
    })).rejects.toThrow(/zone selection/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('paginates Cloudflare Pages zones for large accounts', async () => {
    const pagesSeen: number[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const requestUrl = new URL(url);
      expect(requestUrl.pathname).toBe('/client/v4/zones');
      expect(requestUrl.searchParams.get('account.id')).toBe('account_123');
      expect(requestUrl.searchParams.get('per_page')).toBe('100');
      const page = Number(requestUrl.searchParams.get('page') || '1');
      pagesSeen.push(page);
      const result = page === 1
        ? [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }]
        : [{ id: 'zone-2', name: 'example.org', status: 'active', type: 'full' }];
      return new Response(JSON.stringify({
        success: true,
        result,
        result_info: { page, per_page: 100, total_pages: 2 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listCloudflarePagesZones({
      token: 'cloudflare-token-secret',
      accountId: 'account_123',
      cloudflarePages: { lastZoneId: 'zone-2' },
    })).resolves.toEqual({
      zones: [
        { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        { id: 'zone-2', name: 'example.org', status: 'active', type: 'full' },
      ],
      cloudflarePages: { lastZoneId: 'zone-2' },
    });
    expect(pagesSeen).toEqual([1, 2]);
  });

  it('round-trips typed Cloudflare info while keeping provider metadata internal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-deployment-db-test-'));
    try {
      const db = openDatabase(root, { dataDir: path.join(root, '.od') });
      insertProject(db, {
        id: 'project-1',
        name: 'Project 1',
        skillId: null,
        designSystemId: null,
        createdAt: 1,
        updatedAt: 1,
      });
      const saved = upsertDeployment(db, {
        id: 'deployment-1',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        url: 'https://demo-pages.pages.dev',
        deploymentId: 'dep-1',
        deploymentCount: 1,
        target: 'preview',
        status: 'link-delayed',
        cloudflarePages: {
          projectName: 'demo-pages',
          pagesDev: {
            url: 'https://demo-pages.pages.dev',
            status: 'ready',
          },
          customDomain: {
            hostname: 'demo.example.com',
            url: 'https://demo.example.com',
            zoneId: 'zone-1',
            zoneName: 'example.com',
            domainPrefix: 'demo',
            status: 'pending',
            dnsStatus: 'created',
            dnsRecordId: 'dns-1',
            dnsOwnership: 'marked',
            domainStatus: 'pending',
          },
        },
        providerMetadata: {
          cloudflarePagesProjectName: 'demo-pages',
          cloudflarePagesCustomDomain: {
            projectId: 'project-1',
            pagesProjectName: 'demo-pages',
            hostname: 'demo.example.com',
            marker: 'od:cfp:aaaaaaaaaaaa:bbbbbbbbbbbb',
            dnsRecordId: 'dns-1',
          },
        },
        createdAt: 1,
        updatedAt: 2,
      });
      const loaded = getDeployment(db, 'project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID);
      if (!saved || !loaded) throw new Error('expected deployment roundtrip to be saved');

      expect(saved).toMatchObject({
        cloudflarePages: {
          customDomain: {
            hostname: 'demo.example.com',
            dnsRecordId: 'dns-1',
          },
        },
        providerMetadata: {
          cloudflarePagesProjectName: 'demo-pages',
          cloudflarePagesCustomDomain: {
            marker: 'od:cfp:aaaaaaaaaaaa:bbbbbbbbbbbb',
          },
        },
      });
      expect(loaded).toMatchObject(saved);
    } finally {
      closeDatabase();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates a Cloudflare DNS CNAME and Pages custom domain while keeping pages.dev primary', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_custom', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        expect(url).toContain('name=demo.example.com');
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body).toMatchObject({
          type: 'CNAME',
          name: 'demo.example.com',
          content: 'demo-pages.pages.dev',
          proxied: true,
          ttl: 1,
        });
        expect(body.comment).toMatch(/^od:cfp:[a-f0-9]{12}:[a-f0-9]{12}$/);
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/pages/projects/demo-pages/domains?') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ name: 'demo.example.com' });
        return new Response(JSON.stringify({
          success: true,
          result: { name: 'demo.example.com', status: 'active' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo.example.com' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          url: 'https://demo.example.com',
          status: 'ready',
          dnsStatus: 'created',
          dnsRecordId: 'dns-1',
          dnsOwnership: 'marked',
          domainStatus: 'active',
        },
      },
      providerMetadata: {
        cloudflarePagesProjectName: 'demo-pages',
        cloudflarePagesCustomDomain: {
          projectId: 'project-1',
          pagesProjectName: 'demo-pages',
          hostname: 'demo.example.com',
          dnsRecordId: 'dns-1',
        },
      },
    });
  });

  it('reuses an exact Cloudflare CNAME without mutating DNS', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [{
        id: 'dns-existing',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'demo-pages.pages.dev',
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          dnsStatus: 'reused',
          dnsRecordId: 'dns-existing',
          dnsOwnership: 'unmarked',
        },
      },
    });
    expect(calls.some((call) => (
      call.url.includes('/zones/zone-1/dns_records') &&
      (call.method === 'POST' || call.method === 'PATCH')
    ))).toBe(false);
  });

  it('reuses a concurrently created CNAME after Cloudflare reports a duplicate', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [],
      dnsCreateAlreadyExists: true,
      dnsRecordsAfterDuplicate: [{
        id: 'dns-race',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'demo-pages.pages.dev',
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          dnsStatus: 'reused',
          dnsRecordId: 'dns-race',
          dnsOwnership: 'unmarked',
        },
      },
    });
    expect(calls.filter((call) => call.url.includes('/zones/zone-1/dns_records?') && call.method === 'GET')).toHaveLength(2);
    expect(calls.filter((call) => call.url.endsWith('/zones/zone-1/dns_records') && call.method === 'POST')).toHaveLength(1);
  });

  it('finds existing Cloudflare Pages custom domains beyond the first page', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      pagesDomainPages: [
        [{ name: 'other.example.com', status: 'active' }],
        [{ name: 'demo.example.com', status: 'active' }],
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          domainStatus: 'active',
        },
      },
    });
    const domainLookupUrls = calls
      .filter((call) => call.url.includes('/pages/projects/demo-pages/domains?') && call.method === 'GET')
      .map((call) => new URL(call.url).searchParams.get('page'));
    expect(domainLookupUrls).toEqual(['1', '2']);
    expect(calls.some((call) => call.url.endsWith('/pages/projects/demo-pages/domains') && call.method === 'POST')).toBe(false);
  });

  it('retries DNS creation without a comment when Cloudflare rejects comments', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsCreateRejectsComment: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          status: 'ready',
          dnsStatus: 'created',
          dnsRecordId: 'dns-1',
          dnsOwnership: 'unmarked',
        },
      },
    });
    const dnsCreateBodies = calls
      .filter((call) => call.url.endsWith('/zones/zone-1/dns_records') && call.method === 'POST')
      .map((call) => JSON.parse(String(call.body ?? '{}')));
    expect(dnsCreateBodies).toHaveLength(2);
    expect(dnsCreateBodies[0]).toHaveProperty('comment');
    expect(dnsCreateBodies[1]).not.toHaveProperty('comment');
  });

  it('does not patch an unowned different-target CNAME', async () => {
    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [{
        id: 'dns-external',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'other.pages.dev',
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployWithCustomDomain();

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          status: 'conflict',
          errorCode: 'cloudflare_dns_record_conflict',
          dnsStatus: 'conflict',
          dnsRecordId: 'dns-external',
          dnsOwnership: 'external',
          domainStatus: 'skipped',
        },
      },
    });
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    expect(calls.some((call) => call.url.endsWith('/pages/projects/demo-pages/domains') && call.method === 'POST')).toBe(false);
  });

  it('patches only a previously owned CNAME with matching marker metadata', async () => {
    const initial = createCustomDomainDeployMock();
    vi.stubGlobal('fetch', initial.fetchMock);
    const first = await deployWithCustomDomain();
    const priorMetadata = first.providerMetadata as Record<string, unknown>;
    const priorCustom = priorMetadata.cloudflarePagesCustomDomain as Record<string, unknown>;
    vi.unstubAllGlobals();

    const { calls, fetchMock } = createCustomDomainDeployMock({
      dnsRecords: [{
        id: 'dns-1',
        type: 'CNAME',
        name: 'demo.example.com',
        content: 'old-demo-pages.pages.dev',
        comment: priorCustom.marker,
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployWithCustomDomain({ priorMetadata });

    expect(result).toMatchObject({
      status: 'ready',
      cloudflarePages: {
        customDomain: {
          hostname: 'demo.example.com',
          status: 'ready',
          dnsStatus: 'patched',
          dnsRecordId: 'dns-1',
          dnsOwnership: 'marked',
        },
      },
    });
    const patchBodies = calls
      .filter((call) => call.url.endsWith('/zones/zone-1/dns_records/dns-1') && call.method === 'PATCH')
      .map((call) => JSON.parse(String(call.body ?? '{}')));
    expect(patchBodies).toEqual([expect.objectContaining({
      type: 'CNAME',
      name: 'demo.example.com',
      content: 'demo-pages.pages.dev',
      comment: priorCustom.marker,
    })]);
  });

  it('returns partial success with pages.dev when DNS custom-domain setup conflicts', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_conflict', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: [{
            id: 'dns-existing',
            type: 'A',
            name: 'demo.example.com',
            content: '192.0.2.10',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          status: 'conflict',
          errorCode: 'cloudflare_dns_record_conflict',
          dnsStatus: 'conflict',
          dnsRecordId: 'dns-existing',
          domainStatus: 'skipped',
        },
      },
    });
    expect(fetchMock.mock.calls.some(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      return url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST';
    })).toBe(false);
  });

  it('returns partial success with pages.dev when Pages custom-domain binding conflicts', async () => {
    const indexHash = cloudflarePagesAssetHash({
      file: 'index.html',
      data: Buffer.from('hello index'),
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method || (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/pages/projects/demo-pages') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { name: 'demo-pages' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/upload-token') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'pages-upload-jwt' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/check-missing') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/assets/upsert-hashes') && method === 'POST') {
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ hashes: [indexHash] });
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/deployments') && method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'dep_domain_conflict', url: 'https://d34527d9.demo-pages.pages.dev' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://demo-pages.pages.dev' && method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/zones/zone-1') && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'zone-1', name: 'example.com', status: 'active', type: 'full' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/zones/zone-1/dns_records?') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/zones/zone-1/dns_records') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ success: true, result: { id: 'dns-1', ...body } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/pages/projects/demo-pages/domains?') && method === 'GET') {
        return new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/pages/projects/demo-pages/domains') && method === 'POST') {
        return new Response(JSON.stringify({
          success: false,
          errors: [{ message: 'Custom domain already exists' }],
        }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deployToCloudflarePages({
      config: {
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      },
      projectId: 'project-1',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
      files: [
        {
          file: 'index.html',
          data: Buffer.from('hello index'),
          contentType: 'text/html',
          sourcePath: 'index.html',
        },
      ],
    });

    expect(result).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://demo-pages.pages.dev',
      status: 'ready',
      cloudflarePages: {
        pagesDev: {
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
        },
        customDomain: {
          hostname: 'demo.example.com',
          status: 'conflict',
          errorCode: 'cloudflare_domain_already_bound',
          dnsStatus: 'created',
          dnsRecordId: 'dns-1',
          domainStatus: 'conflict',
        },
      },
    });
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

  it('uses provider-specific copy for missing public URLs', async () => {
    const result = await waitForReachableDeploymentUrl([], {
      providerLabel: 'Cloudflare Pages',
    });

    expect(result).toMatchObject({
      status: 'link-delayed',
      statusMessage: 'Cloudflare Pages did not return a public deployment URL.',
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
