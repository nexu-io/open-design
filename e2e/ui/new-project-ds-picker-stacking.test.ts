import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '../lib/playwright/mock-factory.js';

// Regression: the New Project → Prototype "Design system" dropdown opened but
// the form sections below it (Target platforms, Companion surfaces, Fidelity,
// Create) painted through/over the popover — a stacking bug. Every
// `.newproj-section` carries a residual identity transform from the
// `od-fade-slide-up` entrance animation (`animation-fill-mode: both`), which
// turns each section into its own stacking context. `.ds-picker` is a
// `.newproj-section`, so its popover's `z-index` is trapped inside the picker
// and cannot rise above later sibling sections. The fix lifts the OPEN
// picker's stacking context above its siblings.

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

const DESIGN_SYSTEMS = [
  {
    id: 'nexu-soft-tech',
    title: 'Nexu Soft Tech',
    category: 'Product',
    summary: 'Warm utility system for product interfaces.',
    swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
  },
  {
    id: 'editorial-noir',
    title: 'Editorial Noir',
    category: 'Editorial',
    summary: 'High-contrast editorial system with expressive type.',
    swatches: ['#111111', '#F6EFE6', '#C44536', '#F2C14E'],
  },
  {
    id: 'data-mist',
    title: 'Data Mist',
    category: 'Analytics',
    summary: 'Calm dashboard system for dense data products.',
    swatches: ['#EAF4F4', '#5EAAA8', '#05668D', '#0B132B'],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    // Dock the entry nav rail from the start so its destinations are
    // interactable without relying on the (animated) topbar toggle.
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

test('[P1] open design system dropdown paints above the form sections below it', async ({
  page,
}) => {
  // Wide enough that the entry rail is docked by default, matching the
  // layout users see when the New Project modal is reached.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openNewProjectPanel(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await expect(page.getByTestId('design-system-trigger')).toBeVisible();

  await page.getByTestId('design-system-trigger').click();
  const popover = page.locator('.ds-picker-popover');
  await expect(popover).toBeVisible();
  // Let the entrance animation settle so geometry is stable.
  await expect(page.getByRole('option', { name: /Nexu Soft Tech/i })).toBeVisible();

  // The popover must be the topmost element across its own visible extent.
  // Sample points down the middle of the popover where the sibling sections
  // (Companion surfaces, Fidelity, Create) sit behind it. With the stacking
  // bug, `elementFromPoint` resolves to one of those siblings instead of the
  // popover, so a sibling "bleeds through".
  const probe = await popover.evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width * 0.5);
    const fractions = [0.4, 0.55, 0.7];
    return fractions.map((f) => {
      const y = Math.round(rect.top + rect.height * f);
      const hit = document.elementFromPoint(x, y);
      return {
        f,
        insidePopover: !!hit?.closest('.ds-picker-popover'),
        hitClass:
          hit instanceof HTMLElement
            ? hit.className.toString().slice(0, 60) || hit.tagName
            : (hit?.tagName ?? 'null'),
      };
    });
  });

  const leaks = probe.filter((p) => !p.insidePopover);
  expect(
    leaks,
    `Form content bleeds through the open dropdown at: ${JSON.stringify(leaks)}`,
  ).toEqual([]);
});

async function openNewProjectPanel(page: Page) {
  if (await page.getByTestId('new-project-panel').isVisible()) return;
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}
