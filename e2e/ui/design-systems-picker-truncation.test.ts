// Design-system picker label truncation (issue #2688).
//
// When the design-system picker list shows entries whose localized category
// name is long (e.g. "Social & Messaging"), the left-side list rows must
// stay on a single line and ellipsize rather than wrap to a second line.
// The right detail pane keeps the full text. This file is the regression
// boundary for the two pickers that ship a master-detail list and have a
// user-reachable entry point today:
//
//   1. Settings → Design systems tab (DesignSystemsTab left sidebar row).
//      The row subtitle (`.itemSub`) already ellipsizes; this spec locks
//      that boundary so it cannot silently regress.
//   2. New project → "Design system" trigger popover (`NewProjectPanel`
//      local picker built on `.ds-picker-*`). The shared `.ds-picker-item-title`
//      class already ellipsizes; this spec locks that boundary too.
//
// Note (mrcfps 2026-07-24 review on head d9f8274e): the prior third case
// targeted the chat-composer "Skills and design systems" switch picker
// (`DesignSystemSwitchPicker`, `.composer-ds-picker-*`). It was removed
// because that surface has no user-reachable entry point today: nobody
// passes `onSwitchDesignSystem` to `ChatComposer`, so `composer-plus-design-system`
// is wired through `onOpenDesignSystems` to the project-level picker
// (`DesignSystemPicker`, `.project-ds-picker-*`) instead. Testing the
// switch picker through `composer-plus-design-system` was exercising the
// wrong surface and could not reach either geometry assertion. The dead
// `.composer-ds-picker-*` CSS cleanup is tracked separately.
//
// Regression scope is geometry, not pixels: each label/row's `scrollHeight`
// must not exceed its `clientHeight` by more than 1px (no wrap-induced
// vertical overflow) and the rendered CSS must declare `white-space: nowrap`
// (the bug we're guarding against is wrapping).

import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';
import { routeAgents, STORAGE_KEY } from '@/playwright/mock-factory';
import { openNewProjectModal } from '@/playwright/rail';
import { openSettingsDialog } from '../lib/playwright/amr.js';

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

// mrcfps 2026-07-25 review on head 5c1c383: long editable design-system
// names must still leave the rename pencil reachable. The base mock marks
// every system `isEditable: false`, so the truncation-with-edit test below
// mounts its own route override that flips a long-named user system to
// `source: 'user' / isEditable: true`. The id is intentionally distinct
// from WECHAT_PRESET so the explicit truncation case above is unaffected.
const LONG_EDITABLE_PRESET = {
  id: 'long-editable-user-system',
  title:
    'Acme Genuine Long-Named User Design System That Must Truncate And Still Leave Rename Reachable',
  category: 'Product',
  summary: 'Long-name regression for the .library-ds-title flex rename contract.',
  swatches: ['#333333'],
};

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
        // Privacy consent: pin `privacyDecisionAt` + disabled telemetry so
        // the "Help us improve Open Design" overlay doesn't intercept rail
        // helpers — mrcfps 2026-07-24 review on head d9f8274e flagged that
        // the missing fields cause `ensureRailOpen` to time out waiting for
        // `entry--rail-open`. Mirror `applyStandardMocks`'s standard fixture
        // (e2e/lib/playwright/mock-factory.ts:15-16,25-26).
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
    // Persisted rail state — mrcfps 2026-07-25 review on head 5c1c383 flagged
    // that `openNewProjectModal` clicks the visible rail toggle but `.entry`
    // stays collapsed (never gains `entry--rail-open`) without this seed, so
    // the new-project picker case times out before reaching the geometry
    // assertions. Mirror the persisted state used by
    // `new-project-ds-picker-stacking.test.ts` and
    // `new-project-ds-picker-clipping.test.ts`.
    window.localStorage.setItem('od.entry.railOpen', 'true');
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
          // Privacy consent — mirrors the localStorage seed above so the
          // server-served config also suppresses the consent overlay.
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
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
async function expectSingleLineRow(locator: Locator, label: string) {
  const result = await locator.evaluate((el: Element, lbl: string) => {
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
  // Use the stable `data-testid` we added to `SystemRow` rather than the CSS
  // module class — `itemSub` is generated by the CSS-modules pipeline, so the
  // literal class name is not stable in the e2e DOM. The test-id IS stable and
  // is the same one used by the unit tests in
  // `apps/web/tests/components/DesignSystemsTab.test.tsx`.
  await expectSingleLineRow(
    page.getByTestId(`design-system-card-subtitle-${WECHAT_PRESET.id}`),
    'settings sidebar subtitle',
  );

  // Truncation must hold when the viewport is squeezed. The sidebar keeps a
  // bounded width; long categories must ellipsize rather than wrap.
  await page.setViewportSize({ width: 600, height: 800 });
  await expectSingleLineRow(
    page.getByTestId(`design-system-card-subtitle-${WECHAT_PRESET.id}`),
    'settings sidebar subtitle (narrow)',
  );

  await page.screenshot({ path: 'ui/reports/2688-settings-sidebar-truncated.png' });
});

// ---- Picker 3: New project design-system popover ----------------------------

test('[P1] New project design-system popover renders WeChat on a single-line row (#2688)', async ({
  page,
}) => {
  await page.goto('/');
  // The entry nav rail is collapsed by default, so a direct click on
  // `entry-nav-new-project` is shadowed by `.entry-main__inner` and times
  // out. Use the shared rail helper — it ensures the rail is docked, finds
  // an actionable hit target, and falls back to the projects-view create
  // button when the rail button is unreachable. This is the same helper the
  // existing `visual-entry` and `critical-smoke` suites rely on.
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();

  await page.getByTestId('design-system-trigger').click();
  // `NewProjectPanel` portals the picker through `document.body` (so short
  // viewports cannot clip it), so its options live outside the modal subtree
  // — match by the `.ds-picker-popover` portal selector.
  const popover = page.locator('.ds-picker-popover').last();
  await expect(popover).toBeVisible();

  // mrcfps 2026-07-25 review on head 7d3ba987: the rendered accessible name
  // for the WeChat option is `WeChat DEFAULT WeChat super-app messaging
  // patterns.` — `getDefaultDesignSystemId()` marks `wechat` as the default,
  // so `DesignSystemPicker` appends the `DEFAULT` chip and the localized
  // summary. The exact `^WeChat$` matcher therefore times out before any
  // geometry assertion. Use a prefix matcher that is unique to the WeChat
  // row (no other shipped preset title starts with `WeChat`) and then
  // locate the title element within that row.
  const wechatOption = popover.getByRole('option', { name: /^WeChat\b/ });
  await expect(wechatOption).toBeVisible();

  // mrcfps also flagged that `.ds-picker-popover .ds-picker-item-title` picks
  // the short `None — freeform` row when there are multiple matches, so the
  // case could pass without ever exercising WeChat. Resolve the title from
  // the WeChat option itself so the assertion is bound to the real row.
  await expectSingleLineRow(
    wechatOption.locator('.ds-picker-item-title').first(),
    'new-project popover wechat option title',
  );

  await page.screenshot({ path: 'ui/reports/2688-new-project-ds-picker-truncated.png' });
});

// ---- Picker 4: Settings library card with long editable name ----------------
//
// mrcfps 2026-07-25 review on head 5c1c383 flagged that truncating
// `.library-ds-title` directly clips the rename pencil outside the parent
// box for long user-system names (140px title ended at x=148, 22px edit
// button began at x=415). The CSS fix promotes `.library-ds-title` to a
// constrained flex row and moves the truncation triple onto the
// `.library-ds-title-text` child while keeping `.library-ds-edit`
// non-shrinking. This case proves the rename pencil stays reachable
// when the long name is itself truncated to ellipsis.

test('[P2] Settings library card truncates a long user-system name without clipping the rename pencil (#2688)', async ({
  page,
}) => {
  // Override the base `/api/design-systems` mock for this case only: flip
  // the long-named preset to `source: 'user' / isEditable: true` so the
  // `DesignSystemsSection` renderer actually emits the `.library-ds-edit`
  // button. `page.route` on the same URL in Playwright prepends the new
  // handler, so the override wins over the `beforeEach` fallback.
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({
      json: {
        designSystems: [
          ...DESIGN_SYSTEMS.map((s) => ({
            ...s,
            source: 'preset',
            isEditable: false,
            surface: 'web',
            hidden: false,
          })),
          {
            ...LONG_EDITABLE_PRESET,
            source: 'user',
            isEditable: true,
            surface: 'web',
            hidden: false,
          },
        ],
      },
    });
  });

  await page.goto('/');
  // mrcfps 2026-07-25 review on head 7d3ba987: `/design-systems` mounts
  // `DesignSystemsTab`, whose `SystemRow` emits the
  // `design-system-card-<id>` test id but does NOT render
  // `.library-ds-title` / `.library-ds-title-text` / `.library-ds-edit` —
  // those belong to `DesignSystemsSection`, which `SettingsDialog` mounts
  // when its `activeSection === 'designSystems'`. Going to `/design-systems`
  // therefore resolves `design-system-card-long-editable-user-system` to the
  // standalone page sidebar row that lacks the rename pencil, and the
  // `.library-ds-title-text` locator below times out before any geometry
  // assertion. Open the Settings dialog and switch to the Design systems
  // section so `DesignSystemsSection` actually mounts.
  const settings = await openSettingsDialog(page);
  await settings
    .getByRole('button', { name: /Design systems|设计系统|設計系統/i })
    .click();
  await expect(
    settings.getByRole('heading', { name: /Design systems|设计系统|設計系統/i }),
  ).toBeVisible();

  // The library section aggregates every shipped system regardless of tab;
  // long names should be visible without selecting a specific tab. Use the
  // stable test id added to `DesignSystemsSection`'s `.library-ds-card` so
  // the assertion is bound to the right surface.
  const longCard = settings.getByTestId(`library-ds-card-${LONG_EDITABLE_PRESET.id}`);
  await expect(longCard).toBeVisible();

  const title = longCard.locator('.library-ds-title-text').first();
  const edit = longCard.locator('.library-ds-edit').first();

  await expect(title).toBeVisible();
  await expect(edit).toBeAttached();

  const geometry = await longCard.evaluate((el: Element) => {
    const card = el.getBoundingClientRect();
    const titleEl = el.querySelector('.library-ds-title');
    const titleTextEl = el.querySelector('.library-ds-title-text');
    const editEl = el.querySelector('.library-ds-edit');
    if (!titleEl || !titleTextEl || !editEl) {
      throw new Error('missing title/edit element');
    }
    const t = titleEl.getBoundingClientRect();
    const tt = titleTextEl.getBoundingClientRect();
    const ed = editEl.getBoundingClientRect();
    const cs = window.getComputedStyle(titleEl);
    return {
      card: { left: Math.round(card.left), right: Math.round(card.right), width: Math.round(card.width) },
      title: { left: Math.round(t.left), right: Math.round(t.right), width: Math.round(t.width) },
      titleText: { left: Math.round(tt.left), right: Math.round(tt.right), width: Math.round(tt.width) },
      edit: { left: Math.round(ed.left), right: Math.round(ed.right), width: Math.round(ed.width) },
      titleDisplay: cs.display,
      titleMinWidth: cs.minWidth,
    };
  });

  // The title row is the flex parent we expect from the fix.
  expect(geometry.titleDisplay, `expected .library-ds-title { display: flex }, got ${geometry.titleDisplay}.`).toBe('flex');
  expect(geometry.titleMinWidth, `expected .library-ds-title { min-width: 0 }, got ${geometry.titleMinWidth}.`).toBe('0px');

  // The rename pencil stays inside the card and inside the title row, not
  // clipped beyond the parent's right edge.
  expect(
    geometry.edit.right,
    `rename pencil right edge (${geometry.edit.right}) exceeds card right edge (${geometry.card.right}) — clipped outside the card.`,
  ).toBeLessThanOrEqual(geometry.card.right);
  expect(
    geometry.edit.right,
    `rename pencil right edge (${geometry.edit.right}) exceeds title row right edge (${geometry.title.right}) — clipped outside the title container.`,
  ).toBeLessThanOrEqual(geometry.title.right);
  expect(
    geometry.edit.left,
    `rename pencil left edge (${geometry.edit.left}) sits before title text right edge (${geometry.titleText.right}) — overlapping the truncated text.`,
  ).toBeGreaterThanOrEqual(geometry.titleText.right - 1);

  // The long title text actually truncated (its rendered width is bounded by
  // the available row width minus the pencil, not by the full untruncated text).
  expect(
    geometry.titleText.right,
    `title text right edge (${geometry.titleText.right}) exceeds the title row right edge (${geometry.title.right}) — the text was not truncated.`,
  ).toBeLessThanOrEqual(geometry.title.right);
});
