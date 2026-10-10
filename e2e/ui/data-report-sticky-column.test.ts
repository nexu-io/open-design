import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import { expect, test } from '@/playwright/suite';

// Regression for the data-report template (skills/data-report/example.html):
// when a report table grows enough columns to scroll horizontally, the pinned
// date (first) column must stay visible. On main the example table had no
// horizontal-scroll story at all (5 columns inside an `overflow-hidden` card),
// and its base styles carried two latent bugs that agent-generated wide tables
// inherited: sticky cells without a z-index ladder (dynamic columns paint over
// the pinned column) and zebra/hover backgrounds on the `tr` row level (row
// backgrounds do not participate in sticky layering, so scrolled content
// bleeds through the transparent pinned cells).
//
// Issue: nexu-io/open-design#417 (internal #691).
//
// Shape:
// 1. Scenario guard — the example's detail table actually scrolls
//    horizontally (red on main, where the table cannot scroll).
// 2. Symptom assertion — after scrolling to the middle, hit-testing inside
//    the pinned column's slot must resolve to a first-column cell with a
//    fully opaque background.
// 3. Known-bad controls — fixed fixtures reproducing the pre-fix styles keep
//    proving the symptom assertion can detect both failure modes (takeover by
//    dynamic columns, and row-background bleed-through), so a green run is
//    never vacuous.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const exampleHtmlPath = path.join(repoRoot, 'skills', 'data-report', 'example.html');

type FirstColumnProbe = {
  scrollable: boolean;
  scrolled: boolean;
  hitCellIndex: number | null;
  hitBackgroundAlpha: number | null;
  hitDescription: string;
};

// Scrolls the `.table-scroll` container to its horizontal midpoint, then
// hit-tests a point inside the pinned first column's slot (left edge of the
// scroll viewport) on the given tbody row. Reports which column the topmost
// element belongs to and how opaque its cell background is.
async function probeFirstColumnAfterHorizontalScroll(
  page: Page,
  rowIndex: number,
): Promise<FirstColumnProbe> {
  return await page.evaluate(async (nthRow: number) => {
    const scroller = document.querySelector('.table-scroll');
    if (!(scroller instanceof HTMLElement)) {
      throw new Error('missing .table-scroll horizontal scroll container');
    }
    const scrollable = scroller.scrollWidth > scroller.clientWidth;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;

    const row = scroller.querySelector(`tbody tr:nth-child(${nthRow})`);
    if (!row) throw new Error(`missing probe row tbody tr:nth-child(${nthRow})`);
    // The detail table sits below the fold in the real example page;
    // elementFromPoint only hit-tests inside the viewport.
    row.scrollIntoView({ block: 'center' });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
    );
    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    // 24px inside the scroll viewport's left edge — well within the pinned
    // column's extent (its padding alone is 14px), regardless of column width.
    const x = scrollerRect.left + 24;
    const y = rowRect.top + rowRect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const cell = hit?.closest('td, th') ?? null;

    let alpha: number | null = null;
    if (cell) {
      const background = getComputedStyle(cell).backgroundColor;
      const channels = background.match(/rgba?\(([^)]+)\)/);
      if (channels?.[1]) {
        const parts = channels[1].split(',').map((value) => Number.parseFloat(value));
        alpha = parts.length >= 4 ? (parts[3] ?? 0) : 1;
      } else {
        alpha = 0;
      }
    }

    return {
      scrollable,
      scrolled: scroller.scrollLeft > 0,
      hitCellIndex: cell instanceof HTMLTableCellElement ? cell.cellIndex : null,
      hitBackgroundAlpha: alpha,
      hitDescription: hit instanceof HTMLElement ? `${hit.tagName}.${hit.className}` : 'null',
    };
  }, rowIndex);
}

// The pre-fix table styles from skills/data-report/example.html as they were
// on main, applied to a wide table. main's card was `overflow-hidden` (the
// wide table could not scroll at all), so the fixture adds only the scroll
// container + min-width needed to reach the scrolling scenario — the
// layering/background rules under test are byte-for-byte the main-era ones.
const MAIN_ERA_TABLE_CSS = `
  .table-scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; min-width:1280px; font-size:13px; }
  thead th { background:#f4f1ec; text-align:left; padding:10px 14px; position:sticky; top:0; }
  tbody td { padding:10px 14px; border-bottom:1px solid #e7e5e0; }
  tbody tr:nth-child(even) { background:#fbfaf7; }
  tbody tr:hover { background:#f4f1ec; }
`;

function buildWideTableDocument(extraCss: string): string {
  const columns = ['月份', ...Array.from({ length: 9 }, (_, i) => `指标 ${i + 1}`)];
  const head = `<tr>${columns.map((label) => `<th>${label}</th>`).join('')}</tr>`;
  const rows = Array.from({ length: 6 }, (_, r) => {
    const cells = columns
      .map((_, c) => `<td>${c === 0 ? `2025-0${r + 1}` : `v${r + 1}.${c}`}</td>`)
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${MAIN_ERA_TABLE_CSS}${extraCss}</style></head><body><div class="table-scroll"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div></body></html>`;
}

test.beforeEach(async ({ page }) => {
  // Narrow enough that the 1280px-min-width table must scroll horizontally.
  await page.setViewportSize({ width: 1000, height: 800 });
  // The pinned-column contract must hold without any CDN (Tailwind, fonts,
  // Chart.js): every load-bearing property lives in the example's own
  // <style> block, so all external requests are refused.
  await page.route(/^https?:\/\//, (route) => route.abort());
});

test('[P2] data-report example keeps the pinned date column visible and opaque under horizontal scroll', async ({
  page,
}) => {
  await page.goto(pathToFileURL(exampleHtmlPath).href);
  // The detail rows are rendered by the example's inline script.
  await expect(page.locator('#rows tr')).toHaveCount(9);

  // Row 1 exercises the base (white) row background, row 2 the zebra stripe —
  // both must be opaque at the td level for the pinned column to mask
  // scrolled-under content.
  for (const rowIndex of [1, 2]) {
    const probe = await probeFirstColumnAfterHorizontalScroll(page, rowIndex);
    expect(
      probe.scrollable,
      'scenario guard: the detail table must overflow its scroll container horizontally',
    ).toBe(true);
    expect(probe.scrolled, 'scenario guard: the container must actually scroll').toBe(true);
    expect(
      probe.hitCellIndex,
      `row ${rowIndex}: the pinned column slot is covered by ${probe.hitDescription}`,
    ).toBe(0);
    expect(
      probe.hitBackgroundAlpha,
      `row ${rowIndex}: the pinned cell background must be fully opaque, got ${JSON.stringify(probe)}`,
    ).toBe(1);
  }
});

test('[P2] known-bad control: main-era styles without a pinned column let dynamic columns take the date slot', async ({
  page,
}) => {
  await page.setContent(buildWideTableDocument(''));

  const probe = await probeFirstColumnAfterHorizontalScroll(page, 2);
  expect(probe.scrollable).toBe(true);
  expect(probe.scrolled).toBe(true);
  // Detection power: with no sticky first column the date column scrolls away
  // and a dynamic column occupies its slot. If this ever reports cell 0, the
  // symptom assertion above has gone vacuous.
  expect(probe.hitCellIndex, `expected a dynamic column, got ${probe.hitDescription}`).not.toBe(0);
  expect(probe.hitCellIndex).not.toBeNull();
});

test('[P2] known-bad control: naive sticky column over row-level zebra bleeds scrolled content through', async ({
  page,
}) => {
  // What an agent following the old SKILL.md got by adding only
  // `position:sticky; left:0` — no z-index ladder, no opaque td background.
  await page.setContent(
    buildWideTableDocument('th:first-child, td:first-child { position:sticky; left:0; }'),
  );

  // Row 2 carries the zebra stripe on the tr level: the sticky td itself is
  // transparent, so the row background (and anything scrolled underneath)
  // shows through the pinned cell.
  const probe = await probeFirstColumnAfterHorizontalScroll(page, 2);
  expect(probe.scrollable).toBe(true);
  expect(probe.scrolled).toBe(true);
  expect(probe.hitCellIndex).toBe(0);
  expect(
    probe.hitBackgroundAlpha,
    'detection power: the naive sticky cell must read as transparent',
  ).toBeLessThan(1);
});
