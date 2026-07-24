// Design-system picker label truncation (issue #2688).
//
// When the design-system picker list shows entries whose localized category
// name is long (e.g. "Social & Messaging"), the left-side list rows must
// stay on a single line and ellipsize rather than wrap to a second line.
// The right detail pane keeps the full text. This file is the regression
// boundary for the three pickers that ship a master-detail list:
//
//   1. Settings → Design systems tab (DesignSystemsTab left sidebar row).
//      The row subtitle (`.itemSub`) already ellipsizes; this spec locks
//      that boundary so it cannot silently regress.
//   2. Chat composer → "Skills and design systems" picker
//      (`DesignSystemSwitchPicker`). The category group heading
//      (`.composer-ds-picker-group-title`) and the per-row title
//      (`.composer-ds-picker-item-title`) must stay on one line.
//   3. New project → "Design system" trigger popover (`NewProjectPanel`
//      local picker built on `.ds-picker-*`). The shared `.ds-picker-item-title`
//      class already ellipsizes; this spec locks that boundary too.
//
// Regression scope is geometry, not pixels: each label/row's `scrollHeight`
// must not exceed its `clientHeight` by more than 1px (no wrap-induced
// vertical overflow) and the rendered CSS must declare `white-space: nowrap`
// (the bug we're guarding against is wrapping).

import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { routeAgents, STORAGE_KEY } from '@/playwright/mock-factory';

// WeChat ships the longest localized category string ("Social & Messaging") —
// the exact label the issue screenshot called out. Using the real preset keeps
// the test honest: if a future manifest changes the category, this test will
// fail loudly and force the truncation contract to be reverified.
const WECHAT_PRESET = {
  id: 'wechat',
  title: 'WeChat',
  category: 'Social & Messaging',
  summary: 'WeChat super-app messaging patterns.',
  swatches: ['#07c160', '#1f1f1f'],
};

const DESIGN_SYSTEMS = [
  WECHAT_PRESET,
  {
    id: 'paper',
    title: 'Paper',
    category: 'Product',
    summary: 'Warm utility system for product interfaces.',
    swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: 'test-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          agentCliEnv: {},
        },
      },
    });
  });

  await routeAgents(page, [
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({
      json: {
        designSystems: DESIGN_SYSTEMS.map((s) => ({
          ...s,
          source: 'preset',
          isEditable: false,
          surface: 'web',
          hidden: false,
        })),
      },
    });
  });
});

// Assert `selector`'s rendered text box fits its layout box on a single line:
// no wrap-induced vertical overflow (scrollHeight ≤ clientHeight + 1px rounding)
// and the CSS truncation contract (`white-space: nowrap`) is honored. The 1px
// band covers subpixel rounding on some platforms; anything more means the
// label wrapped onto a second line — the regression we're guarding against.
async function expectSingleLineRow(page: Page, selector: string, label: string) {
  const result = await page.locator(selector).first().evaluate((el: Element, lbl: string) => {
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    return {
      label: lbl,
      rowWidth: Math.round(r.width),
      rowHeight: Math.round(r.height),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      whiteSpace: cs.whiteSpace,
      overflow: cs.overflow,
      textOverflow: cs.textOverflow,
      text: (el.textContent ?? '').trim(),
    } as const;
  }, label);

  expect(
    result.scrollHeight - result.clientHeight,
    `[${label}] row scrollHeight (${result.scrollHeight}) exceeds clientHeight (${result.clientHeight}) — a long label wrapped onto a second line. Geometry: ${JSON.stringify(result)}`,
  ).toBeLessThanOrEqual(1);

  expect(
    result.whiteSpace,
    `[${label}] expected white-space: nowrap, got ${result.whiteSpace}. Geometry: ${JSON.stringify(result)}`,
  ).toBe('nowrap');
}

// ---- Picker 1: Settings tab sidebar row ------------------------------------

test('[P1] Settings Design systems sidebar row truncates long category labels (#2688)', async ({
  page,
}) => {
  await page.goto('/design-systems');
  await page.getByRole('tab', { name: 'Official presets' }).click();

  const wechatCard = page.getByTestId(`design-system-card-${WECHAT_PRESET.id}`);
  await expect(wechatCard).toBeVisible();
  await expect(wechatCard).toContainText(WECHAT_PRESET.title);
  await expect(wechatCard).toContainText(WECHAT_PRESET.category);

  // `.itemSub` (DesignSystemsTab.module.css) is the localized category subtitle.
  await expectSingleLineRow(
    page,
    `[data-testid="design-system-card-${WECHAT_PRESET.id}"] .itemSub`,
    'settings sidebar .itemSub',
  );

  // Truncation must hold when the viewport is squeezed. The sidebar keeps a
  // bounded width; long categories must ellipsize rather than wrap.
  await page.setViewportSize({ width: 600, height: 800 });
  await expectSingleLineRow(
    page,
    `[data-testid="design-system-card-${WECHAT_PRESET.id}"] .itemSub`,
    'settings sidebar .itemSub (narrow)',
  );

  await page.screenshot({ path: 'ui/reports/2688-settings-sidebar-truncated.png' });
});

// ---- Picker 2: Chat composer design-system switch picker --------------------

test('[P1] Chat composer design-system picker truncates the WeChat group heading and row title (#2688)', async ({
  page,
}) => {
  // The composer picker needs an active project (the "Skills and design
  // systems" entry is disabled when onSwitchDesignSystem is unset). Create
  // one through the API, then navigate to the conversation view that hosts
  // the chat composer.
  const project = await page.request.post('/api/projects', {
    data: {
      name: 'issue-2688-composer',
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype', nameSource: 'user' },
    },
  });
  expect(project.ok()).toBeTruthy();
  const projectBody = (await project.json()) as { project: { id: string } };
  const projectId = projectBody.project.id;
  const conversation = await page.request.post(`/api/projects/${projectId}/conversations`, {
    data: { title: 'issue-2688' },
  });
  expect(conversation.ok()).toBeTruthy();
  const conversationBody = (await conversation.json()) as {
    conversation: { id: string };
  };
  await page.goto(`/projects/${projectId}/conversations/${conversationBody.conversation.id}`);

  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await page.getByTestId('chat-composer').getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-design-system').click();

  const popover = page.getByTestId('composer-ds-picker');
  await expect(popover).toBeVisible();
  // The picker groups by category — "Social & Messaging" must render as a
  // `.composer-ds-picker-group-title` group heading.
  await expect(
    popover.locator('.composer-ds-picker-group-title', { hasText: WECHAT_PRESET.category }),
  ).toHaveCount(1);
  await expect(
    popover.getByTestId(`composer-ds-picker-item-${WECHAT_PRESET.id}`),
  ).toHaveCount(1);

  await expectSingleLineRow(
    page,
    '.composer-ds-picker-group-title',
    `composer group title "${WECHAT_PRESET.category}"`,
  );
  await expectSingleLineRow(
    page,
    `[data-testid="composer-ds-picker-item-${WECHAT_PRESET.id}"] .composer-ds-picker-item-title`,
    'composer row title "WeChat"',
  );

  await page.screenshot({ path: 'ui/reports/2688-composer-ds-picker-truncated.png' });
});

// ---- Picker 3: New project design-system popover ----------------------------

test('[P1] New project design-system popover renders WeChat on a single-line row (#2688)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('entry-nav-new-project').click();
  await page.getByTestId('new-project-tab-prototype').click();

  await page.getByTestId('design-system-trigger').click();
  // `NewProjectPanel` portals the picker through `document.body` (so short
  // viewports cannot clip it), so its options live outside the modal subtree
  // — match by the `.ds-picker-popover` portal selector.
  const popover = page.locator('.ds-picker-popover').last();
  await expect(popover).toBeVisible();

  const wechatOption = popover.getByRole('option', { name: new RegExp(`^${WECHAT_PRESET.title}$`) });
  await expect(wechatOption).toBeVisible();

  await expectSingleLineRow(
    page,
    `.ds-picker-popover .ds-picker-item-title`,
    'new-project popover wechat option title',
  );

  await page.screenshot({ path: 'ui/reports/2688-new-project-ds-picker-truncated.png' });
});
