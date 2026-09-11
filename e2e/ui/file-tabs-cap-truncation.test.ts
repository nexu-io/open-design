// Browser witnesses for shipping tab geometry; parser cases live in Vitest.
// The `.app` wrapper applies the same tab padding/border cascade as production.
//
// Width comparisons allow ±0.5px slack for subpixel rounding.

import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';

interface StripLabel {
  stem: string;
  ext?: string;
  dirty?: string;
}
interface StripCase {
  label: string;
  barWidth: number;
  tabs: StripLabel[];
}

const CASES: StripCase[] = [
  {
    label: 'single tab caps at 240px (no balloon)',
    barWidth: 900,
    tabs: [{ stem: 'Design Files', ext: '.html' }],
  },
  {
    label: 'three moderate tabs each fit their natural width under the cap',
    barWidth: 900,
    tabs: [
      { stem: 'Design Files', ext: '.html' },
      { stem: 'scene', ext: '.json' },
      { stem: 'kit', ext: '.html' },
    ],
  },
  {
    label: 'three tabs with long titles all cap at 240px',
    barWidth: 900,
    tabs: [
      { stem: 'A very long design file name', ext: '.html' },
      { stem: 'Another really long scene title', ext: '.json' },
      { stem: 'Component library index', ext: '.tsx' },
    ],
  },
  {
    label: 'tab with pathological 250-char stem caps at 240 without spilling',
    barWidth: 900,
    tabs: [{ stem: 'a'.repeat(250), ext: '.html' }],
  },
  {
    label: 'dirty sketch tab keeps the extension visible under truncation',
    barWidth: 900,
    tabs: [
      { stem: 'a very long sketch composition name.sketch', ext: '.json', dirty: ' •' },
    ],
  },
];

test('[P1] file tabs raise the label cap to 240 and keep extensions visible', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });

  const results = await page.evaluate((cases) => {
    const out: Array<{
      label: string;
      barWidth: number;
      tabWidths: number[];
      capBreached: boolean;
      extensionsPreserved: boolean;
      labelsContainedInTab: boolean;
      visibleText: string[];
      stemTruncated: boolean[];
      dirtyMarksPreserved: boolean;
    }> = [];
    for (const c of cases as StripCase[]) {
      const app = document.createElement('div');
      app.className = 'app';
      app.style.cssText = `position: fixed; top: -3000px; left: 0; width: ${c.barWidth + 100}px;`;
      const shell = document.createElement('div');
      shell.className = 'ws-tabs-shell';
      shell.style.cssText = 'height: 44px;';
      const bar = document.createElement('div');
      bar.className = 'ws-tabs-bar';
      bar.style.cssText = `width: ${c.barWidth}px;`;
      shell.appendChild(bar);
      app.appendChild(shell);
      document.body.appendChild(app);

      for (const spec of c.tabs) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'ws-tab';
        const text = document.createElement('span');
        text.className = 'ws-tab-text';
        const label = document.createElement('span');
        label.className = 'ws-tab-label';
        const stem = document.createElement('span');
        stem.className = 'ws-tab-label-stem';
        stem.textContent = spec.stem;
        label.appendChild(stem);
        if (spec.ext) {
          const ext = document.createElement('span');
          ext.className = 'ws-tab-label-ext';
          ext.textContent = spec.ext;
          label.appendChild(ext);
        }
        if (spec.dirty) {
          const dirty = document.createElement('span');
          dirty.className = 'ws-tab-label-dirty';
          dirty.textContent = spec.dirty;
          label.appendChild(dirty);
        }
        text.appendChild(label);
        tab.appendChild(text);
        bar.appendChild(tab);
      }

      const tabs = Array.from(bar.querySelectorAll('.ws-tab')) as HTMLElement[];
      const widths = tabs.map((t) => Math.round(t.getBoundingClientRect().width));
      const visibleText = tabs.map((t) => (t.textContent ?? '').trim());
      const capBreached = widths.some((w) => w > 240.5);
      const extensionsPreserved = tabs.every((t) => {
        const ext = t.querySelector('.ws-tab-label-ext') as HTMLElement | null;
        if (!ext) return true;
        const tabRect = t.getBoundingClientRect();
        if (tabRect.width < 100) return true;
        const extRect = ext.getBoundingClientRect();
        return extRect.right <= tabRect.right + 0.5 && extRect.left >= tabRect.left - 0.5;
      });
      const dirtyMarksPreserved = tabs.every((t) => {
        const dirty = t.querySelector('.ws-tab-label-dirty') as HTMLElement | null;
        if (!dirty) return true;
        const tabRect = t.getBoundingClientRect();
        if (tabRect.width < 100) return true;
        const dRect = dirty.getBoundingClientRect();
        return dRect.right <= tabRect.right + 0.5 && dRect.left >= tabRect.left - 0.5;
      });
      const labelsContainedInTab = tabs.every((t) => {
        const label = t.querySelector('.ws-tab-label') as HTMLElement | null;
        if (!label) return true;
        const tabRect = t.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        return labelRect.right <= tabRect.right + 0.5 && labelRect.left >= tabRect.left - 0.5;
      });
      const stemTruncated = tabs.map((t) => {
        const stem = t.querySelector('.ws-tab-label-stem') as HTMLElement | null;
        if (!stem) return false;
        return stem.scrollWidth > stem.clientWidth + 0.5;
      });
      out.push({
        label: c.label,
        barWidth: c.barWidth,
        tabWidths: widths,
        capBreached,
        extensionsPreserved,
        labelsContainedInTab,
        visibleText,
        stemTruncated,
        dirtyMarksPreserved,
      });
      app.remove();
    }
    return out;
  }, CASES);

  const detail = JSON.stringify(results, null, 2);

  for (const r of results) {
    expect(r.capBreached, `240px cap breached at "${r.label}": ${detail}`).toBe(false);
    expect(r.extensionsPreserved, `extension truncated at "${r.label}": ${detail}`).toBe(true);
    expect(r.labelsContainedInTab, `label spills past tab boundary at "${r.label}": ${detail}`).toBe(true);
    expect(r.dirtyMarksPreserved, `dirty mark truncated at "${r.label}": ${detail}`).toBe(true);
  }

  const threeModerate = results.find((r) => r.label.startsWith('three moderate tabs'))!;
  expect(threeModerate.visibleText).toContain('Design Files.html');
  expect(threeModerate.visibleText).toContain('scene.json');
  expect(threeModerate.visibleText).toContain('kit.html');
  expect(threeModerate.stemTruncated.every((v) => v === false), `moderate tab stem truncated: ${detail}`).toBe(true);

  const longThree = results.find((r) => r.label.startsWith('three tabs with long titles'))!;
  for (const w of longThree.tabWidths) {
    expect(w, `long-tab width breaches cap: ${detail}`).toBeLessThanOrEqual(240);
    expect(w, `long-tab width regressed under old 110px cap: ${detail}`).toBeGreaterThan(110);
  }

  const dirtySketch = results.find((r) => r.label.startsWith('dirty sketch tab'))!;
  expect(dirtySketch.tabWidths[0], `dirty sketch cap: ${detail}`).toBeLessThanOrEqual(240);
  expect(
    dirtySketch.visibleText[0],
    `dirty sketch label missing .json or dirty mark: ${detail}`,
  ).toContain('.json');
  expect(
    dirtySketch.visibleText[0],
    `dirty sketch label missing dirty mark: ${detail}`,
  ).toContain('•');
});

test('[P1] static-shape tabs keep the pre-fix 110px cap', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });

  const layout = await page.evaluate(() => {
    const app = document.createElement('div');
    app.className = 'app';
    app.style.cssText = 'position: fixed; top: -3000px; left: 0; width: 900px;';
    const shell = document.createElement('div');
    shell.className = 'ws-tabs-shell';
    shell.style.cssText = 'height: 44px;';
    const bar = document.createElement('div');
    bar.className = 'ws-tabs-bar';
    bar.style.cssText = 'width: 800px;';
    shell.appendChild(bar);
    app.appendChild(shell);
    document.body.appendChild(app);

    const results: Array<{ label: string; tabWidth: number; labelClipped: boolean }> = [];
    for (const text of ['Design Files', 'Design System supremely long variant that should truncate']) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'ws-tab';
      const label = document.createElement('span');
      label.className = 'ws-tab-label';
      label.textContent = text;
      tab.appendChild(label);
      bar.appendChild(tab);
      const tabRect = tab.getBoundingClientRect();
      const labelClipped = label.scrollWidth > label.clientWidth + 0.5;
      results.push({ label: text, tabWidth: Math.round(tabRect.width), labelClipped });
    }
    app.remove();
    return results;
  });

  const detail = JSON.stringify(layout, null, 2);
  for (const r of layout) {
    expect(r.tabWidth, `static tab breached 110px cap on "${r.label}": ${detail}`).toBeLessThanOrEqual(110.5);
  }
  const long = layout.find((r) => r.label.startsWith('Design System supremely'))!;
  expect(long.labelClipped, `long static label did not truncate at pre-fix cap: ${detail}`).toBe(true);
});

test('[P1] Arabic file labels stay LTR under ambient dir=rtl', async ({ page }) => {
  // Pinning LTR preserves stem → extension → dirty order under RTL.
  await page.goto('/');
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });

  const layout = await page.evaluate(() => {
    const app = document.createElement('div');
    app.className = 'app';
    app.setAttribute('dir', 'rtl');
    app.style.cssText = 'position: fixed; top: -3000px; left: 0; width: 700px;';
    const shell = document.createElement('div');
    shell.className = 'ws-tabs-shell';
    shell.style.cssText = 'height: 44px;';
    const bar = document.createElement('div');
    bar.className = 'ws-tabs-bar';
    bar.style.cssText = 'width: 600px;';
    shell.appendChild(bar);
    app.appendChild(shell);
    document.body.appendChild(app);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'ws-tab';
    const text = document.createElement('span');
    text.className = 'ws-tab-text';
    const label = document.createElement('span');
    label.className = 'ws-tab-label';
    const stem = document.createElement('span');
    stem.className = 'ws-tab-label-stem';
    stem.textContent = 'مشروع';
    label.appendChild(stem);
    const ext = document.createElement('span');
    ext.className = 'ws-tab-label-ext';
    ext.textContent = '.json';
    label.appendChild(ext);
    const dirty = document.createElement('span');
    dirty.className = 'ws-tab-label-dirty';
    dirty.textContent = ' •';
    label.appendChild(dirty);
    text.appendChild(label);
    tab.appendChild(text);
    bar.appendChild(tab);

    const stemRect = stem.getBoundingClientRect();
    const extRect = ext.getBoundingClientRect();
    const dirtyRect = dirty.getBoundingClientRect();
    const ambientDir = getComputedStyle(app).direction;
    const labelDir = getComputedStyle(label).direction;
    app.remove();
    return {
      ambientDir,
      labelDir,
      stemLeft: stemRect.left,
      extLeft: extRect.left,
      dirtyLeft: dirtyRect.left,
    };
  });

  const detail = JSON.stringify(layout, null, 2);
  expect(layout.ambientDir, `ambient dir not rtl: ${detail}`).toBe('rtl');
  expect(layout.labelDir, `label dir not pinned to ltr: ${detail}`).toBe('ltr');
  expect(layout.stemLeft, `stem not left of ext under rtl: ${detail}`).toBeLessThan(layout.extLeft);
  expect(layout.extLeft, `ext not left of dirty under rtl: ${detail}`).toBeLessThan(layout.dirtyLeft);
});
