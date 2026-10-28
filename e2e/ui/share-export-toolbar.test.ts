import { randomUUID } from 'node:crypto';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, mockAmrPersonalWorkspace } from '@/playwright/amr';

// Owner C0: the two toolbar actions, not artifact-card actions or menu rows.
// The original interactive board specifies 30/7 here; its captured legacy
// native toolbar also contains 28/6. Do not apply this geometry globally.
test.use({ viewport: { width: 1440, height: 904 }, deviceScaleFactor: 1 });

for (const theme of ['light', 'dark', 'system-light', 'system-dark'] as const) {
  test(`[P1] OPEND-3580 Owner toolbar hierarchy and B menu intents · ${theme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme.endsWith('dark') ? 'dark' : 'light' });
    await page.addInitScript(selectedTheme => {
      localStorage.setItem('open-design:locale', 'en');
      localStorage.setItem('open-design:locale-source', 'manual');
      const config = JSON.parse(localStorage.getItem('open-design:config') || '{}');
      config.theme = selectedTheme.startsWith('system-') ? 'system' : selectedTheme;
      localStorage.setItem('open-design:config', JSON.stringify(config));
    }, theme);
    await mockAmrPersonalWorkspace(page);
    await page.route('**/api/projects/*/workspace-scope', async route => {
      const projectId = new URL(route.request().url()).pathname.match(/\/projects\/([^/]+)/)?.[1];
      await route.fulfill({ json: { scope: {
        kind: 'personal', projectId,
        workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
        visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT,
      } } });
    });
    const projectId = `toolbar-3580-${randomUUID()}`;
    const created = await page.request.post('/api/projects', { data: {
      id: projectId, name: 'Owner toolbar regression', skillId: null, designSystemId: null,
      metadata: { kind: 'prototype', nameSource: 'user' },
    } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const file = await page.request.post(`/api/projects/${projectId}/files`, { data: {
      name: 'index.html', content: '<!doctype html><html><body><h1>Toolbar fixture</h1></body></html>',
      artifactManifest: { version: 1, kind: 'html', title: 'Toolbar fixture', entry: 'index.html', renderer: 'html', exports: ['html'] },
    } });
    expect(file.ok(), await file.text()).toBeTruthy();
    await page.goto(`/projects/${projectId}/files/index.html`);
    const toolbar = page.locator('.ws-tabs-file-actions');
    const exportButton = toolbar.getByRole('button', { name: 'Export', exact: true });
    const shareButton = toolbar.getByRole('button', { name: 'Share', exact: true });
    await expect(exportButton).toBeVisible({ timeout: T.long });
    await expect(shareButton).toBeEnabled();
    // This baseline ships light-only; legacy dark/system preferences must
    // normalize to light. Do not manufacture a dark product with DOM patches.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const capture = async (state: string) => {
      const computed = await toolbar.locator('button.chrome-action-unified').evaluateAll(buttons => buttons.map(button => {
        const css = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return {
          label: button.getAttribute('aria-label'), classes: button.className,
          // The retained export-ready nudge transforms the rect by tiny
          // fractions; assert the specified CSS height, retain both readings.
          background: css.backgroundColor, color: css.color, height: Number.parseFloat(css.height), rectHeight: rect.height,
          radius: css.borderRadius, padding: css.padding, gap: css.gap,
          icon: button.querySelector('svg')?.outerHTML,
          iconColor: button.querySelector('svg') ? getComputedStyle(button.querySelector('svg')!).color : null,
          expanded: button.getAttribute('aria-expanded'),
        };
      }));
      await testInfo.attach(`${theme}-${state}-styles`, {
        body: JSON.stringify({ theme, state, viewport: page.viewportSize(),
          actualTheme: await page.locator('html').getAttribute('data-theme'),
          boundary: 'Real local web/daemon and HTTP-created project; mocked personal workspace identity, no real account or Vela publication.', computed }, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach(`${theme}-${state}`, {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
      });
      return computed;
    };
    const idle = await capture('idle');
    // These need a real browser: CSS Modules and the later workspace cascade
    // are not loaded by FileViewer's JSDOM tests.
    // Soft visual checks retain the baseline's hover/focus/menu witnesses even
    // when its hierarchy is wrong; interaction failures still stop the test.
    expect.soft(idle.find(button => button.label === 'Export')).toMatchObject({
      background: 'rgb(242, 242, 243)', color: 'rgb(85, 85, 85)', height: 30, radius: '7px',
    });
    expect.soft(idle.find(button => button.label === 'Share')).toMatchObject({
      background: 'rgb(36, 36, 36)', color: 'rgb(255, 255, 255)', height: 30, radius: '7px',
    });
    for (const button of [exportButton, shareButton]) {
      const background = await button.evaluate(node => getComputedStyle(node).backgroundColor);
      const color = await button.evaluate(node => getComputedStyle(node).color);
      await button.hover();
      await capture(`${await button.getAttribute('aria-label')}-hover`);
      await expect.soft(button).toHaveCSS('background-color', background, { timeout: T.short });
      await expect.soft(button).toHaveCSS('color', color, { timeout: T.short });
      await expect.soft(button.locator('svg')).toHaveCSS('color', color, { timeout: T.short });
      await page.mouse.move(0, 0);
      await button.focus();
      await capture(`${await button.getAttribute('aria-label')}-focus`);
      await expect.soft(button).toHaveCSS('color', color);
    }
    await expect(toolbar.locator('button.chrome-action-unified')).toHaveText(['Export', 'Share']);
    await expect(exportButton.locator('svg')).toHaveAttribute('width', '15');
    await expect(shareButton.locator('svg')).toHaveAttribute('width', '15');
    await exportButton.click();
    await expect(exportButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', { name: 'Export as PDF', exact: true })).toBeVisible();
    await expect(page.locator('.chrome-unified-panel')).toBeVisible();
    await capture('Export-open');
    await shareButton.click();
    await expect(exportButton).toHaveAttribute('aria-expanded', 'false');
    await expect(shareButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.share-menu-popover.chrome-unified-popover--share[role="menu"]')).toBeVisible();
    await capture('Share-open');
    await shareButton.click();
    await expect(shareButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.share-menu-popover[role="menu"]')).toHaveCount(0);
  });
}
