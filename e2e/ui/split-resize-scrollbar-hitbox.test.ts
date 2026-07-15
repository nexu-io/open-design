import { expect, test } from '@/playwright/suite';
import { openNewProjectModal } from '@/playwright/rail';
import type { Locator, Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';

// Red spec for issue #548 (Plane): the split resize handle's extended hitbox
// (`.split-resize-handle::before`) must never cross the handle's inline-start
// edge, because the chat panel's scrollbar gutter sits flush against it. When
// it does, clicks aimed at the scrollbar start a panel resize instead, and
// hovering the scrollbar shows the col-resize posture.
//
// Hit-testing note: pseudo-element hit areas are attributed to their host
// element, so `document.elementFromPoint` returns `.split-resize-handle`
// whenever a point falls inside the ::before overhang.

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P1] chat scrollbar gutter edge belongs to the chat panel, not the resize handle', async ({ page }) => {
  await gotoEntryHome(page);
  await createProject(page, 'Scrollbar hitbox LTR');
  await expectWorkspaceReady(page);

  const chatLog = page.locator('.chat-log');
  const box = await requireBoundingBox(chatLog);
  const y = box.y + box.height / 2;

  // Red probe: 1px inside the chat-log edge that faces the handle. On main
  // the handle's ::before overhangs 2px into the scrollbar gutter, so this
  // point hit-tests to the handle (red); after the fix it belongs to the
  // chat panel (green).
  const redProbe = await probeHit(page, box.x + box.width - 1, y);
  expect(redProbe.hitHandle, `expected chat panel at 1px probe, hit <${redProbe.tag} class="${redProbe.className}">`).toBe(false);
  expect(redProbe.insideChatLog).toBe(true);

  // Control probe: 3px inside — beyond main's 2px overhang, so it must hit
  // the chat panel before AND after the fix. Guards against over-shrinking
  // the handle or introducing a new overlay on the gutter.
  const controlProbe = await probeHit(page, box.x + box.width - 3, y);
  expect(controlProbe.hitHandle).toBe(false);
  expect(controlProbe.insideChatLog).toBe(true);
});

test('[P1] hovering and dragging on the scrollbar gutter does not enter resize posture', async ({ page }) => {
  await gotoEntryHome(page);
  await createProject(page, 'Scrollbar hover posture');
  await expectWorkspaceReady(page);

  const chatLog = page.locator('.chat-log');
  const handle = page.locator('.split-resize-handle');
  const box = await requireBoundingBox(chatLog);
  const x = box.x + box.width - 1;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  const hover = await probeHit(page, x, y);
  expect(hover.cursor).not.toBe('col-resize');
  // The highlight posture is purely :hover-driven (::after restyle), so
  // asserting :hover does not match asserts the highlight never shows.
  expect(await handle.evaluate((el) => el.matches(':hover'))).toBe(false);

  const widthBefore = await readChatPanelWidth(handle);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 5 });
  await expect(page.locator('.split')).not.toHaveClass(/is-resizing-chat/);
  await page.mouse.up();

  expect(await readChatPanelWidth(handle)).toBe(widthBefore);
});

test('[P1] resize handle body still drags the chat panel width', async ({ page }) => {
  await gotoEntryHome(page);
  await createProject(page, 'Handle drag regression guard');
  await expectWorkspaceReady(page);

  const handle = page.locator('.split-resize-handle');
  const handleBox = await requireBoundingBox(handle);
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;

  const widthBefore = await readChatPanelWidth(handle);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Drag toward the chat panel (narrower): the default width sits well above
  // aria-valuemin, so a 60px pull is never clamped away.
  await page.mouse.move(x - 60, y, { steps: 6 });
  await page.mouse.up();

  const widthAfter = await readChatPanelWidth(handle);
  expect(widthAfter).not.toBe(widthBefore);
  const min = Number(await handle.getAttribute('aria-valuemin'));
  const max = Number(await handle.getAttribute('aria-valuemax'));
  expect(widthAfter).toBeGreaterThanOrEqual(min);
  expect(widthAfter).toBeLessThanOrEqual(max);
});

test('[P1] RTL: chat scrollbar gutter is not covered by the resize handle', async ({ page }) => {
  await gotoEntryHome(page);
  await createProject(page, 'Scrollbar hitbox RTL');
  await expectWorkspaceReady(page);
  // Switch to Arabic through the in-project settings UI. Seeding the locale
  // via localStorage before navigation is unreliable here: the initial-locale
  // detection can transiently lose a persisted manual locale during the hard
  // navigation that project creation performs (adjacent issue, not part of
  // this fix). setLocale from the settings dialog applies synchronously.
  await switchLocaleToArabic(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const chatLog = page.locator('.chat-log');
  const box = await requireBoundingBox(chatLog);
  const y = box.y + box.height / 2;

  // RTL: the chat panel is the grid's first column (visually right), the
  // handle sits at its LEFT edge, and the scrollbar renders on the chat-log's
  // left edge. On main the physical `right: -10px` overhang covers the whole
  // 8px gutter, so BOTH probes hit the handle (no green baseline for the
  // control probe in RTL); after the logical-property fix both are green.
  for (const inset of [1, 3]) {
    const probe = await probeHit(page, box.x + inset, y);
    expect(probe.hitHandle, `expected chat panel at ${inset}px probe, hit <${probe.tag} class="${probe.className}">`).toBe(false);
    expect(probe.insideChatLog).toBe(true);
  }
});

interface HitProbe {
  hitHandle: boolean;
  insideChatLog: boolean;
  tag: string;
  className: string;
  cursor: string;
}

async function probeHit(page: Page, x: number, y: number): Promise<HitProbe> {
  return page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py) as HTMLElement | null;
    return {
      hitHandle: !!el?.closest('.split-resize-handle'),
      insideChatLog: !!el?.closest('.chat-log'),
      tag: el?.tagName ?? '<none>',
      className: typeof el?.className === 'string' ? el.className : '',
      cursor: el ? window.getComputedStyle(el).cursor : '',
    };
  }, [x, y] as const);
}

async function requireBoundingBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

async function readChatPanelWidth(handle: Locator): Promise<number> {
  const raw = await handle.getAttribute('aria-valuenow');
  const parsed = Number.parseInt(raw ?? '', 10);
  expect(Number.isFinite(parsed)).toBeTruthy();
  return parsed;
}

// Switch the app language to Arabic from inside the project view: avatar
// menu → full settings → Language section → the tile whose code is "ar".
// All selectors are class/testid based so they survive the locale change.
async function switchLocaleToArabic(page: Page) {
  await page.locator('.avatar-agent-trigger').click();
  await page.locator('.avatar-item--execution-settings').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('.settings-nav-item', { hasText: 'Language' }).click();
  await dialog
    .locator('.settings-language-tile')
    .filter({ has: page.locator('.settings-language-tile-code:text-is("ar")') })
    .click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function createProject(page: Page, projectName: string) {
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}
