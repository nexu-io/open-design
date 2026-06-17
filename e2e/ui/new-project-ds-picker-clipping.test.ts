import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '../lib/playwright/mock-factory.js';

// Repro for #4303: the New Project → "Design system" dropdown renders
// misaligned/truncated. The local picker (NewProjectPanel.tsx) opens its
// popover with plain `position: absolute` (`top: calc(100% + 6px)`, no
// up-flip), anchored inside `.ds-picker`. Its clipping ancestor is
// `.newproj-body { overflow-y: auto }` (the modal's scroll container), so when
// the trigger sits low in the body — or the window is short — the popover
// extends past the body's visible box and gets cut off. The shared
// project/composer picker (DesignSystemPicker.tsx) avoids this by portalling to
// document.body with viewport-aware up/down placement; the local one does not.

const STORAGE_KEY = 'open-design:config';

const AGENTS = [
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.134.0',
    models: [{ id: 'default', label: 'Default (CLI config)' }],
  },
];

// Enough systems that the list wants its full height, so truncation is
// unambiguous when the body clips it.
const DESIGN_SYSTEMS = [
  { id: 'nexu-soft-tech', title: 'Nexu Soft Tech', category: 'Product', summary: 'Warm utility system for product interfaces.', swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'] },
  { id: 'editorial-noir', title: 'Editorial Noir', category: 'Editorial', summary: 'High-contrast editorial system with expressive type.', swatches: ['#111111', '#F6EFE6', '#C44536', '#F2C14E'] },
  { id: 'data-mist', title: 'Data Mist', category: 'Analytics', summary: 'Calm dashboard system for dense data products.', swatches: ['#EAF4F4', '#5EAAA8', '#05668D', '#0B132B'] },
  { id: 'verdant-ops', title: 'Verdant Ops', category: 'Product', summary: 'Operational console system with green accents.', swatches: ['#0B3D2E', '#2D6A4F', '#95D5B2', '#D8F3DC'] },
  { id: 'aurora-print', title: 'Aurora Print', category: 'Editorial', summary: 'Print-inspired editorial system with gradients.', swatches: ['#1A1423', '#3D314A', '#684756', '#96705B'] },
  { id: 'signal-grid', title: 'Signal Grid', category: 'Analytics', summary: 'Dense telemetry grid system for control rooms.', swatches: ['#0D1B2A', '#1B263B', '#415A77', '#778DA9'] },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'default',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
        agentModels: { codex: { model: 'default' } },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
          mode: 'daemon',
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          agentModels: { codex: { model: 'default' } },
          agentCliEnv: {},
        },
      },
    });
  });

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await routeAgents(page, AGENTS);
});

test('[P1] design system dropdown is not clipped by the modal body', async ({ page }) => {
  // A realistic-but-short desktop window, like the macOS report. The modal is
  // `max-height: calc(100vh - 88px)` and `.newproj-body` scrolls, so a short
  // window forces the popover to compete with the body's clip box.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await openNewProjectPanel(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await expect(page.getByTestId('design-system-trigger')).toBeVisible();

  await page.getByTestId('design-system-trigger').click();
  const popover = page.locator('.ds-picker-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByRole('option', { name: /Nexu Soft Tech/i })).toBeVisible();

  await page.screenshot({ path: 'ui/reports/4303-ds-picker-open.png' });

  // Measure clipping: the popover must fit within the scroll container's
  // visible box. If it spills past `.newproj-body`'s bottom (or the viewport),
  // the lower options are cut off — the reported truncation.
  const geometry = await popover.evaluate((el: Element) => {
    const body = el.closest('.newproj-body') as HTMLElement | null;
    const bodyRect = body?.getBoundingClientRect() ?? null;
    const popRect = el.getBoundingClientRect();
    return {
      popBottom: Math.round(popRect.bottom),
      popTop: Math.round(popRect.top),
      bodyBottom: bodyRect ? Math.round(bodyRect.bottom) : null,
      bodyTop: bodyRect ? Math.round(bodyRect.top) : null,
      viewportH: window.innerHeight,
      // Is the picker's popover actually inside the scrolling/clipping body?
      insideBody: !!body,
    };
  });

  const overflowBelowBody =
    geometry.bodyBottom != null ? geometry.popBottom - geometry.bodyBottom : 0;
  const overflowBelowViewport = geometry.popBottom - geometry.viewportH;

  expect(
    overflowBelowBody,
    `Popover bottom (${geometry.popBottom}) spills ${overflowBelowBody}px past .newproj-body bottom (${geometry.bodyBottom}) — lower options are clipped. Geometry: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(0);

  expect(
    overflowBelowViewport,
    `Popover bottom (${geometry.popBottom}) spills ${overflowBelowViewport}px past viewport (${geometry.viewportH}).`,
  ).toBeLessThanOrEqual(0);
});

// Review follow-up (#4346): on a very short window the trigger has little room
// on *both* sides. A `Math.max(200, ...)` floor on the popover height would
// still render a 200px box that overflows the viewport; the height must clamp
// to the available side space and let the list scroll inside it instead.
test('[P1] design system dropdown stays within a very short viewport (both sides tight)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await page.goto('/');
  await openNewProjectPanel(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await expect(page.getByTestId('design-system-trigger')).toBeVisible();

  await page.getByTestId('design-system-trigger').click();
  const popover = page.locator('.ds-picker-popover');
  await expect(popover).toBeVisible();

  const geometry = await popover.evaluate((el: Element) => {
    const trigger = document.querySelector(
      '[data-testid="design-system-trigger"]',
    ) as HTMLElement | null;
    const triggerRect = trigger?.getBoundingClientRect() ?? null;
    const popRect = el.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    return {
      popTop: Math.round(popRect.top),
      popBottom: Math.round(popRect.bottom),
      viewportH: window.innerHeight,
      spaceBelow: triggerRect
        ? Math.round(window.innerHeight - triggerRect.bottom - gap - margin)
        : null,
      spaceAbove: triggerRect ? Math.round(triggerRect.top - gap - margin) : null,
    };
  });

  // Confirm this case genuinely exercises the cramped branch the reviewer
  // flagged: both sides under the 200px preferred minimum.
  expect(
    geometry.spaceAbove != null && geometry.spaceAbove < 200,
    `Expected spaceAbove < 200 to exercise the tight branch; geometry: ${JSON.stringify(geometry)}`,
  ).toBe(true);
  expect(
    geometry.spaceBelow != null && geometry.spaceBelow < 200,
    `Expected spaceBelow < 200 to exercise the tight branch; geometry: ${JSON.stringify(geometry)}`,
  ).toBe(true);

  // The popover must stay fully within the viewport (it scrolls internally),
  // not overflow it.
  expect(
    geometry.popBottom,
    `Popover bottom (${geometry.popBottom}) overflows the short viewport (${geometry.viewportH}). Geometry: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.viewportH + 1);
  expect(
    geometry.popTop,
    `Popover top (${geometry.popTop}) is above the viewport. Geometry: ${JSON.stringify(geometry)}`,
  ).toBeGreaterThanOrEqual(-1);
});

async function openNewProjectPanel(page: Page) {
  if (await page.getByTestId('new-project-panel').isVisible()) return;
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}
