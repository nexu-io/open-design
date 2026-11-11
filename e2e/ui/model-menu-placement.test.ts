import { expect, test } from '@/playwright/suite';
import {
  AMR_PERSONAL_WORKSPACE_CONTEXT,
  createProjectViaApi,
  gotoEntryHome,
  seedBrowserConfig,
} from '@/playwright/amr';
import { routeAgents } from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';

// LINK-C21-VIEW-016-001: the first enabled Flash row must receive a native
// click at the reported viewport, with the real workspace header still present.
test.use({ viewport: { width: 1280, height: 720 } });

test('[P1] home Flash model remains clickable below workspace chrome', async ({ page }, testInfo) => {
  const config = {
    mode: 'daemon', apiKey: '', baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5', agentId: 'amr', skillId: null,
    designSystemId: null, onboardingCompleted: true,
    agentModels: { amr: { model: 'deepseek-v4.1-flash' } },
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
  };
  await seedBrowserConfig(page, config);
  await page.route('**/api/app-config', (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: { config } }) : route.continue());
  // The worker daemon survives earlier files. This entry-surface fixture is
  // specifically an empty Home: existing projects disable vertical centering
  // and would remove the delayed-catalog layout shift this test must exercise.
  await page.route('**/api/projects', (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: { projects: [] } }) : route.fallback());
  await routeAgents(page, [{
    id: 'amr', name: 'OpenDesign AMR', bin: 'vela', available: true, version: 'test',
    models: [
      { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', enabled: true },
      { id: 'deepseek-v4.1-pro', label: 'DeepSeek V4.1 Pro', enabled: false },
      { id: 'gpt-6-sol', label: 'GPT 6 Sol', enabled: false },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `claude-model-${i}`, label: `Claude Model ${i}`, enabled: false })),
    ],
  }]);
  await mockSignedInVelaAccount(page, { balanceUsd: '20.00' });
  // Guarantee the worker-carryover precondition even when run by itself. Only
  // this test's isolated daemon receives the project, through its real API.
  await createProjectViaApi(page, `menu-existing-${Date.now()}`, 'Model menu worker history', {
    accountBalanceUsd: '20.00',
  });
  const projectReads: Array<{ path: string; view: string | null; actualCount: number; fixtureCount: number }> = [];
  const projectsPath = `/api/workspaces/${AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId}/projects`;
  await page.route((url) => url.pathname === projectsPath, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const body = await response.json();
    projectReads.push({ path: projectsPath, view: new URL(route.request().url()).searchParams.get('view'),
      actualCount: body.projects?.length ?? 0, fixtureCount: 0 });
    await route.fulfill({ json: { projects: [] } });
  });
  const pluginReads: Array<{ status: number; count: number }> = [];
  let releasePlugins!: () => void;
  const pluginsReady = new Promise<void>((resolve) => { releasePlugins = resolve; });
  await page.route('**/api/plugins', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    pluginReads.push({ status: response.status(), count: body.plugins?.length ?? 0 });
    await pluginsReady;
    await route.fulfill({ response });
  });
  await gotoEntryHome(page);
  const home = page.getByTestId('home-view');
  // This source predicate is !projectsLoading && projects.length === 0.
  // Wait for the exact scoped list to settle, not gotoEntryHome's best effort.
  await expect.poll(() => projectReads.some((read) => read.view === 'recent')).toBe(true);
  await expect(home).toHaveClass(/home-view--centered/);
  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);
  const chip = page.getByTestId('inline-model-switcher-chip');
  const menu = page.getByTestId('inline-model-switcher-popover');
  const flash = page.getByTestId('inline-model-switcher-compact-model-deepseek-v4.1-flash');
  await chip.click();
  await expect(flash).toBeVisible();
  const initialChip = await chip.boundingBox();
  const initialHome = await home.evaluate((element) => ({
    className: element.className, box: element.getBoundingClientRect().toJSON(),
  }));
  releasePlugins();
  await expect(page.locator('.home-hero__plugin-presets-wrap')).toBeVisible();
  await testInfo.attach('home-layout-fixture.json', { body: JSON.stringify({ projectReads, pluginReads,
    initialHome, initialChip, afterChip: await chip.boundingBox(),
    afterHome: await home.evaluate((element) => ({ className: element.className, box: element.getBoundingClientRect().toJSON() })),
    initialProjectsLoading: false, initialProjectsEmpty: true,
    projectionEvidence: 'HomeView centered class requires !projectsLoading && projects.length === 0',
    presets: await page.getByTestId('home-hero-plugin-presets').innerText(),
  }, null, 2), contentType: 'application/json' });
  await expect.poll(async () => (await chip.boundingBox())?.y ?? Infinity,
    { message: 'the arriving Home examples move the composer while its menu stays open' })
    .toBeLessThan(initialChip!.y - 50);
  await testInfo.attach('chip-layout-shift.json', {
    body: JSON.stringify({ initialChip, after: await chip.boundingBox() }), contentType: 'application/json',
  });
  await testInfo.attach('home-model-menu-before-native-click', {
    body: await page.screenshot(), contentType: 'image/png',
  });
  const layout = await flash.evaluate((row) => {
    const rect = row.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { row: rect.toJSON(), hit: target?.outerHTML.slice(0, 500),
      header: document.querySelector('.workspace-tabs-chrome')?.getBoundingClientRect().toJSON(),
      scrollport: row.closest('.entry-main--scroll')?.getBoundingClientRect().toJSON(),
      innerTopbar: row.closest('.entry-main--scroll')?.querySelector('.entry-main__topbar')?.getBoundingClientRect().toJSON(),
      menu: row.closest('[data-testid="inline-model-switcher-popover"]')?.getBoundingClientRect().toJSON(),
      reachable: target != null && row.contains(target) };
  });
  await testInfo.attach('model-menu-hit-target.json', { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
  await flash.click();
  await expect(menu).toHaveCount(0);

  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(flash).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(chip).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);

  await chip.click();
  await page.setViewportSize({ width: 1000, height: 620 });
  await expect.poll(async () => {
    const box = await menu.boundingBox();
    return box != null && box.y >= 44 && box.y + box.height <= 620;
  }, { message: 'the resized menu stays below shell chrome and above the viewport edge' }).toBe(true);
  await flash.click();
  await chip.click();
  const beforeScroll = await chip.boundingBox();
  const scrollport = page.locator('.entry-main--scroll');
  const scrollState = await scrollport.evaluate((element) => ({
    top: element.scrollTop, max: element.scrollHeight - element.clientHeight,
  }));
  expect(scrollState.max, 'the Home scrollport has scrollable content').toBeGreaterThan(0);
  const scrollBox = await scrollport.boundingBox();
  // The examples have their own scroller. Wheel over the main column's
  // gutter so this exercises menu anchoring to its scrollport instead.
  await page.mouse.move(scrollBox!.x + 4, scrollBox!.y + scrollBox!.height / 2);
  await page.mouse.wheel(0, scrollState.top > 0 ? -60 : 60);
  await expect.poll(async () => (await chip.boundingBox())?.y).not.toBe(beforeScroll!.y);
  await expect(menu).toBeVisible();
  await flash.click();
  await expect(menu).toHaveCount(0);
  await testInfo.attach('model-menu-after-scroll-resize-keyboard', {
    body: await page.screenshot(), contentType: 'image/png',
  });
});
