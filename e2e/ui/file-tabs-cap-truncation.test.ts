// File-workspace tab labels: raised cap + extension-preserving truncation.
//
// The file-tab strip (`.ws-tabs-bar` in the FileWorkspace) capped every tab
// at 110px, which chopped `Design Files.html` to `Design Fi…` even with the
// strip half empty. End-ellipsis also lost the file extension, which is
// the token that tells the user which file kind the tab points at.
//
// The fix raises the cap to 240px and splits `.ws-tab-label` into a stem
// span (may ellipsis-truncate) plus an optional extension span pinned
// visible via flex, so a narrow tab reads `index….html` instead of
// `index….ht`. Dirty sketch tabs also carry a trailing ` •` marker as its
// own pinned span so the split still applies to the primary editing
// surface.
//
// Scope: this spec is the CSS-invariant boundary. It boots the app so the
// shipping stylesheet loads, then constructs the shipping DOM shape (root
// `.ws-tab-label` with nested `.ws-tab-label-stem` / `.ws-tab-label-ext` /
// `.ws-tab-label-dirty`) and measures rendered geometry. It does not
// exercise `splitTabLabel`; that logic is pinned by the Vitest suite at
// `apps/web/tests/components/workspaceTabLabel.test.tsx`. Splitting the
// two responsibilities keeps the e2e from re-implementing the regex it is
// supposed to trust and drifting from the shipped component.
//
// The `.app` wrapper below is what lets the `.app .ws-tab` padding/border
// rules from `viewer/routines.css` apply; the `.ws-tab-label*` rules in
// `workspace/drawer.css` live on bare selectors and would apply either
// way. The wrapper is the smallest ancestor chain that makes the tab
// geometry match a real shipping tab, not a full app scope simulation.

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
      // Minimal ancestor chain so `.app .ws-tab` (viewer/routines.css) and
      // the base `.ws-tab` (workspace/drawer.css) rules both apply.
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
      // Per-tab label truncation: for each tab, does the stem render its
      // full text without ellipsis clipping? Detected via scrollWidth vs
      // clientWidth on the stem span.
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

  // Titles that fit within the 240px cap must render their full content
  // with NO ellipsis truncation on the stem.
  const threeModerate = results.find((r) => r.label.startsWith('three moderate tabs'))!;
  expect(threeModerate.visibleText).toContain('Design Files.html');
  expect(threeModerate.visibleText).toContain('scene.json');
  expect(threeModerate.visibleText).toContain('kit.html');
  expect(threeModerate.stemTruncated.every((v) => v === false), `moderate tab stem truncated: ${detail}`).toBe(true);

  // Long titles cap at 240px (up from the old 110px which chopped labels
  // mid-word). Tabs sit at their natural content width and stop growing at
  // the cap when the title exceeds it.
  const longThree = results.find((r) => r.label.startsWith('three tabs with long titles'))!;
  for (const w of longThree.tabWidths) {
    expect(w, `long-tab width breaches cap: ${detail}`).toBeLessThanOrEqual(240);
    expect(w, `long-tab width regressed under old 110px cap: ${detail}`).toBeGreaterThan(110);
  }

  // Dirty sketch tab: extension AND dirty mark both survive; visible text
  // ends with the ext + dirty mark in the shipped DOM order.
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
  // The raised 240px cap is scoped via :has(.ws-tab-label-stem) so it
  // only applies to file tabs (which render the split spans). Static
  // Design Files / Design System pills use a plain `.ws-tab-label` text
  // node and must keep the pre-fix cap so they don't eat into file-tab
  // space when the strip is tight.
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

    // Two static tabs matching the shipping shape: a `.ws-tab` with a
    // plain-text `.ws-tab-label` child, no stem/ext/dirty spans.
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
    // Pre-fix cap on the base rule is 110px; the raised 240px cap must
    // not leak to static labels. Half-pixel tolerance for subpixel
    // rounding.
    expect(r.tabWidth, `static tab breached 110px cap on "${r.label}": ${detail}`).toBeLessThanOrEqual(110.5);
  }
  // The long static label must actually truncate at the tight cap
  // (proves the label max-width of 96px still applies here, not the
  // raised 240 that only :has(.ws-tab-label-stem) grants).
  const long = layout.find((r) => r.label.startsWith('Design System supremely'))!;
  expect(long.labelClipped, `long static label did not truncate at pre-fix cap: ${detail}`).toBe(true);
});

test('[P1] file tab labels stay LTR under ambient dir=rtl', async ({ page }) => {
  // The label is a flex row: without an explicit `direction: ltr`, ambient
  // `<html dir="rtl">` on Arabic / Farsi locales would reverse the visual
  // sibling order and render `foo.json` as `.json foo`. The pre-fix
  // single-text-node label was safe because the Unicode Bidi Algorithm
  // kept embedded Latin runs upright; the split form needs the row axis
  // pinned. Extensions are always ASCII (regex-gated), so pinning LTR is
  // safe across every locale.
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
    stem.textContent = 'foo';
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
    const visibleText = (tab.textContent ?? '').trim();
    app.remove();
    return {
      ambientDir,
      labelDir,
      visibleText,
      stemLeft: stemRect.left,
      extLeft: extRect.left,
      dirtyLeft: dirtyRect.left,
    };
  });

  const detail = JSON.stringify(layout, null, 2);
  // Sanity: the ancestor really did inherit RTL, so this test is exercising
  // what it claims to.
  expect(layout.ambientDir, `ambient dir not rtl: ${detail}`).toBe('rtl');
  // The fix: the split flex container pins LTR regardless of ambient dir.
  expect(layout.labelDir, `label dir not pinned to ltr: ${detail}`).toBe('ltr');
  // Visual sibling order: stem left of ext left of dirty. Under ambient
  // RTL without the pin, ext would end up left of stem.
  expect(layout.stemLeft, `stem not left of ext under rtl: ${detail}`).toBeLessThan(layout.extLeft);
  expect(layout.extLeft, `ext not left of dirty under rtl: ${detail}`).toBeLessThan(layout.dirtyLeft);
  // textContent still concatenates DOM order, so this is a belt-and-braces
  // check rather than a pure visual assertion.
  expect(layout.visibleText, `visible text lost order: ${detail}`).toBe('foo.json •');
});
