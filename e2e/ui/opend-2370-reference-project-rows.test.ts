import type { Page } from '@playwright/test';
import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '../lib/playwright/mock-factory.js';

// Repro for OPEND-2370 ("参考其他项目" 功能 Bug), the layout half: the rows of
// the "Reference another project" picker overlap each other — each row's meta
// line is clipped by the row underneath it.
//
// `.item` (ProjectReferenceModal.module.css) is a `<button>` laid out as a
// two-line grid: a 28px icon, a title, and a meta line, inside 10px padding.
// It never declared a height, so the global `button { height: 36px }` primitive
// (apps/web/src/styles/primitives.css, duplicated in
// packages/components/src/styles.css) won that one declaration and pinned every
// row to 36px while its content needs ~54px.
//
// The second case runs the same assertions with the list scrolled past its
// `max-height`, so a future change that makes row height depend on the
// container (a flex `shrink`, a fixed track) cannot pass by fitting only the
// short catalog.

function projects(names: string[]) {
  return names.map((name, index) => ({
    id: `p-${index}`,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: index + 1,
    updatedAt: index + 1,
    metadata: { kind: 'prototype' },
  }));
}

// The four projects from the reporter's screenshot.
const FEW = projects([
  '打个招呼',
  'Prototype request clarification',
  '查看文件内容',
  'Produce World-class Single-page Editorial Landing Site',
]);

// Enough rows that `.list` (max-height 380px) has to scroll.
const MANY = projects(Array.from({ length: 14 }, (_, i) => `Project ${i + 1}`));

type Row = {
  name: string;
  top: number;
  bottom: number;
  height: number;
  cssHeight: string;
  contentBottom: number;
};

async function openPicker(page: Page, rows: ReturnType<typeof projects>) {
  await applyStandardMocks(page);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ json: { projects: rows } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-reference-project').click();

  const dialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole('option');
  await expect(options).toHaveCount(rows.length);
  return { dialog, options };
}

function assertRowsFit(rows: Row[]) {
  // 1. Every row must be tall enough for the two lines it renders.
  for (const row of rows) {
    expect(
      row.contentBottom - row.bottom,
      `Row "${row.name}" is ${row.height}px tall (computed ${row.cssHeight}) but its text `
        + `runs ${row.contentBottom - row.bottom}px past the row box. Rows: ${JSON.stringify(rows)}`,
    ).toBeLessThanOrEqual(0);
  }

  // 2. No row's text may be covered by the next row's box.
  rows.forEach((row, index) => {
    const next = rows[index + 1];
    if (!next) return;
    expect(
      row.contentBottom - next.top,
      `Row "${row.name}" text overlaps the next row's box by `
        + `${row.contentBottom - next.top}px. Rows: ${JSON.stringify(rows)}`,
    ).toBeLessThanOrEqual(0);
  });
}

async function measureRows(options: ReturnType<Page['getByRole']>): Promise<Row[]> {
  return options.evaluateAll((els: Element[]) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const title = el.querySelector('span > span:first-child')!.getBoundingClientRect();
      const meta = el.querySelector('span > span:last-child')!.getBoundingClientRect();
      return {
        name: (el.textContent ?? '').trim(),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
        cssHeight: getComputedStyle(el).height,
        contentBottom: Math.round(Math.max(title.bottom, meta.bottom)),
      };
    }),
  );
}

test('[P1] reference-project rows do not clip or overlap each other', async ({ page }) => {
  const { options } = await openPicker(page, FEW);
  await page.screenshot({ path: 'ui/reports/opend-2370-reference-project-rows.png' });
  assertRowsFit(await measureRows(options));
});

test('[P1] reference-project rows keep their height once the list scrolls', async ({ page }) => {
  const { dialog, options } = await openPicker(page, MANY);

  // Confirm this case genuinely exercises the overflow branch — otherwise the
  // assertion below would pass for the wrong reason.
  const overflows = await dialog.locator('[role="listbox"]').evaluate(
    (el: Element) => el.scrollHeight > el.clientHeight + 1,
  );
  expect(overflows, 'expected the list to overflow so flex-shrink is in play').toBe(true);

  assertRowsFit(await measureRows(options));
});

// Same root cause, different property: `.close` sets a 30px box but no padding,
// so the global primitive's `padding: 0 16px` ate the whole content box and the
// X rendered at zero width — an invisible close control in the dialog header.
test('[P1] the reference-project dialog has a visible close control', async ({ page }) => {
  const { dialog } = await openPicker(page, FEW);

  const icon = await dialog.locator('header button svg').evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });

  expect(
    icon.width,
    `The close icon rendered ${icon.width}x${icon.height}px — the control is invisible.`,
  ).toBeGreaterThan(0);
});
