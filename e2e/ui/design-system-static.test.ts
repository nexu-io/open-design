import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';

test('[P1] packaged static previews preserve sandboxed modules, CSS and nested navigation', async ({ page }, testInfo) => {
  const source = await mkdtemp(join(tmpdir(), 'od-static-preview-'));
  const victimSource = await mkdtemp(join(tmpdir(), 'od-static-victim-'));
  const probeScript = 'const probe=new URL(location.href).searchParams.get("probe");if(probe)fetch(probe,{headers:{"x-od-design-system-preview":"1"}}).then(r=>document.documentElement.dataset.probe=String(r.status)).catch(()=>document.documentElement.dataset.probe="blocked");';
  const files = {
    'DESIGN.md': '# Static preview fixture\n\n> Category: Custom\n\nA multi-page preview.',
    'manifest.json': JSON.stringify({
      schemaVersion: 'od-design-system-project/v1', id: basename(source),
      name: 'Static preview fixture', category: 'Custom',
      files: { design: 'DESIGN.md', tokens: 'tokens.css', components: 'components.html' },
      assetsDir: 'assets', preview: { dir: '.', pages: [{ path: 'pages/next.html', title: 'Next', role: 'site' }, { path: 'preview.html', title: 'Preview', role: 'site' }] },
    }),
    'preview.html': '<!doctype html><iframe title="Package preview" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" src="system/kit.html" style="width:100%;height:600px"></iframe>',
    'system/kit.html': '<!doctype html><link rel="stylesheet" href="../assets/main.css"><main><h1>Package showcase</h1><button id="ready">Loading module</button><a href="../pages/next.html">Next page</a><a id="popup" target="_blank">Open package popup</a></main><script type="module" src="../assets/main.mjs"></script>',
    'pages/next.html': '<!doctype html><link rel="stylesheet" href="../assets/main.css"><main><h1>Nested page</h1><button id="ready">Loading module</button><a href="../system/kit.html">Back</a></main><script type="module" src="../assets/main.mjs"></script>',
    'components.html': '<!doctype html><h1>Fixture components</h1>',
    'tokens.css': ':root{--preview-color:rgb(18,35,69)}',
    'assets/main.css': '@import "./nested/theme.css"; h1{color:var(--preview-color)}',
    'assets/nested/theme.css': '@import "../../tokens.css";',
    'assets/main.mjs': `import { label } from "./nested/helper.mjs";const button=document.getElementById("ready");localStorage.setItem("initialized","yes");sessionStorage.setItem("initialized","yes");button.textContent=localStorage.getItem("initialized")==="yes"&&sessionStorage.getItem("initialized")==="yes"?label:"Storage failed";button.onclick=()=>button.textContent="Clicked";${probeScript}`,
    'assets/nested/helper.mjs': 'export const label="Module ready";',
    'assets/probe.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/><script><![CDATA[${probeScript}]]></script></svg>`,
  };
  let passed = false;
  try {
    for (const [name, content] of Object.entries(files)) {
      await mkdir(join(source, name, '..'), { recursive: true });
      await writeFile(join(source, name), content);
      await mkdir(join(victimSource, name, '..'), { recursive: true });
      await writeFile(join(victimSource, name), content.replaceAll(basename(source), basename(victimSource)));
    }
    const installed = await page.request.post('/api/design-systems/install', { data: { source: 'local', path: source } });
    expect(installed.ok(), await installed.text()).toBeTruthy();
    const { designSystem } = await installed.json();
    const victimInstalled = await page.request.post('/api/design-systems/install', { data: { source: 'local', path: victimSource } });
    expect(victimInstalled.ok(), await victimInstalled.text()).toBeTruthy();
    const victim = (await victimInstalled.json()).designSystem;
    const victimPath = `/api/design-systems/${encodeURIComponent(victim.id)}/static?path=assets/main.mjs`;
    const staticPath = `/api/design-systems/${encodeURIComponent(designSystem.id)}/static?path=assets/main.mjs`;
    const moduleEntry = await page.request.get(staticPath);
    const moduleResponse = await page.request.get(moduleEntry.url(), { headers: { Origin: 'null' } });
    const deniedMint = await page.request.get(staticPath, { headers: { Origin: 'null' } });
    expect(deniedMint.status()).toBe(403);
    expect(moduleResponse.status()).toBe(200);
    expect(moduleResponse.headers()['access-control-allow-origin']).toBe('*');
    const deniedRead = await page.request.get(`/api/design-systems/${encodeURIComponent(designSystem.id)}/archive`, { headers: { Origin: 'null' } });
    expect(deniedRead.status()).toBe(403);
    const deniedWrite = await page.request.post(staticPath, { headers: { Origin: 'null' } });
    expect(deniedWrite.status()).toBe(403);
    await page.goto('/');
    expect(await page.evaluate(async (url) => (await fetch(url)).status, victimPath)).toBe(200);
    await page.evaluate((root) => {
      const iframe = document.createElement('iframe');
      iframe.title = 'Trusted host preview';
      iframe.src = `${root}/static?path=preview.html`;
      iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999;background:white';
      const image = document.createElement('img');
      image.alt = 'Trusted host logo';
      image.src = `${root}/static?path=assets/probe.svg`;
      document.body.append(iframe, image);
    }, `/api/design-systems/${encodeURIComponent(designSystem.id)}`);
    await expect.poll(() => page.getByAltText('Trusted host logo').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(20);
    const frame = page.frameLocator('iframe[title="Trusted host preview"]').frameLocator('iframe[title="Package preview"]');
    await expect(frame.getByRole('button', { name: 'Module ready' })).toBeVisible({ timeout: T.long });
    await expect(frame.getByRole('heading', { name: 'Package showcase' })).toHaveCSS('color', 'rgb(18, 35, 69)');
    await frame.getByRole('button', { name: 'Module ready' }).click();
    await expect(frame.getByRole('button', { name: 'Clicked' })).toBeVisible();
    await frame.getByRole('link', { name: 'Next page' }).click();
    await expect(frame.getByRole('heading', { name: 'Nested page' })).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Module ready' })).toBeVisible();
    await expect(frame.getByRole('heading', { name: 'Nested page' })).toHaveCSS('color', 'rgb(18, 35, 69)');
    await frame.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(frame.getByRole('heading', { name: 'Package showcase' })).toBeVisible();
    const blockedNavigation = page.waitForResponse((response) => response.url().endsWith(staticPath));
    await frame.locator('body').evaluate((body, url) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.src = url;
      body.append(frame);
    }, staticPath);
    expect((await blockedNavigation).status()).toBe(403);
    for (const path of ['../system/kit.html', '../assets/probe.svg']) {
      await frame.locator('#popup').evaluate((link, args) => {
        const url = new URL(args.path, location.href);
        url.searchParams.set('probe', new URL(args.victimPath, location.href).href);
        (link as HTMLAnchorElement).href = url.href;
      }, { path, victimPath });
      const popupPromise = page.waitForEvent('popup');
      await frame.getByRole('link', { name: 'Open package popup' }).click();
      const popup = await popupPromise;
      await expect(popup.locator('html, svg').first()).toHaveAttribute('data-probe', 'blocked');
      if (path.endsWith('.svg')) {
        expect(await popup.evaluate(() => { try { localStorage.getItem('test'); return false; } catch { return true; } })).toBeTruthy();
      }
      await popup.close();
    }
    const svgEntry = await page.request.get(`/api/design-systems/${encodeURIComponent(designSystem.id)}/static?path=assets/probe.svg`);
    const svgUrl = new URL(svgEntry.url());
    svgUrl.searchParams.set('probe', new URL(victimPath, svgUrl).href);
    const directSvg = await page.context().newPage();
    await directSvg.goto(svgUrl.href);
    await expect(directSvg.locator('svg')).toHaveAttribute('data-probe', 'blocked');
    await directSvg.close();
    await testInfo.attach('static-preview-sandbox', { body: await page.screenshot(), contentType: 'image/png' });
    passed = true;
  } finally {
    if (passed) {
      await rm(source, { recursive: true, force: true });
      await rm(victimSource, { recursive: true, force: true });
    }
  }
});
