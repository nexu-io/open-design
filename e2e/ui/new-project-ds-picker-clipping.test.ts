import type { Page } from '@playwright/test';
import { expect, test } from '@/playwright/suite';
import { openNewProjectModal } from '@/playwright/rail';
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
  await page.setViewportSize({ width: 1280, height: 320 });
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

// Review follow-up (#5883): the popover list was portaled to the body, but its
// companion brand-preview flyout (shown for a finalized `user:<id>` brand) kept
// its old inline `position: absolute` against the trigger wrapper — so for a
// finalized brand the flyout was still clipped by the modal body / mispositioned
// once the popover moved out. The flyout must portal and stay in the viewport
// beside the popover too.
const BRAND_DESIGN_SYSTEM = {
  id: 'user:brand-acme',
  title: 'Acme Brand Kit',
  category: 'Brand',
  summary: 'Acme brand kit.',
  source: 'user',
  isEditable: true,
  surface: 'web',
  status: 'published',
  swatches: ['#0b5fff', '#0a0a0a'],
};

const ACME_BRAND = {
  meta: {
    id: 'brand-acme',
    sourceUrl: 'https://acme.example.com',
    createdAt: 0,
    updatedAt: 0,
    status: 'ready',
    designSystemId: BRAND_DESIGN_SYSTEM.id,
    projectId: 'brand-project-acme',
  },
  brand: {
    name: 'Acme',
    tagline: 'Build the future, faster.',
    description: 'Acme is a bold engineering brand for fast-moving teams.',
    sourceUrl: 'https://acme.example.com',
    logo: { primary: 'logos/acme.svg', alternates: [], notes: '' },
    colors: [
      { role: 'accent', hex: '#0b5fff', oklch: '', name: 'Signal Blue', usage: 'Primary actions' },
      { role: 'background', hex: '#0a0a0a', oklch: '', name: 'Ink', usage: 'Surfaces' },
    ],
    typography: {
      display: { family: 'Space Grotesk', fallbacks: ['sans-serif'], weights: [500, 700] },
      body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 600] },
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
  },
};

test('[P1] finalized-brand preview flyout is not clipped by the modal body', async ({ page }) => {
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: [BRAND_DESIGN_SYSTEM, ...DESIGN_SYSTEMS] } });
  });
  await page.route('**/api/brands', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { brands: [ACME_BRAND] } });
      return;
    }
    await route.continue();
  });

  // Short window: the modal's `.newproj-body` scroll box clips anything that
  // keeps trigger-relative absolute positioning inside it.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await openNewProjectPanel(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await expect(page.getByTestId('design-system-trigger')).toBeVisible();

  await page.getByTestId('design-system-trigger').click();
  await expect(page.locator('.ds-picker-popover')).toBeVisible();

  // Hovering the finalized brand row swaps the thin preview for the rich Brand
  // Kit card flyout.
  await page.getByRole('option', { name: /Acme Brand Kit/i }).hover();
  const flyout = page.getByTestId('new-project-ds-brand-flyout');
  await expect(flyout).toBeVisible();

  const geometry = await flyout.evaluate((el: Element) => {
    const body = document.querySelector('.newproj-body') as HTMLElement | null;
    const bodyRect = body?.getBoundingClientRect() ?? null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      bodyBottom: bodyRect ? Math.round(bodyRect.bottom) : null,
      bodyRight: bodyRect ? Math.round(bodyRect.right) : null,
    };
  });

  expect(
    geometry.right,
    `Flyout right (${geometry.right}) overflows the viewport (${geometry.viewportW}). ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.viewportW + 1);
  expect(
    geometry.left,
    `Flyout left (${geometry.left}) is off-screen. ${JSON.stringify(geometry)}`,
  ).toBeGreaterThanOrEqual(-1);
  expect(
    geometry.bottom,
    `Flyout bottom (${geometry.bottom}) overflows the viewport (${geometry.viewportH}). ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.viewportH + 1);
  expect(
    geometry.top,
    `Flyout top (${geometry.top}) is above the viewport. ${JSON.stringify(geometry)}`,
  ).toBeGreaterThanOrEqual(-1);
});

async function openNewProjectPanel(page: Page) {
  await openNewProjectModal(page);
}
