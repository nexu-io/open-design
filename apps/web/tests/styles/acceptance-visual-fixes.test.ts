import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Six independent visual/interaction acceptance fixes. Each `it` is scoped to
// one Feishu acceptance-sheet row and only asserts the rule(s) that row's fix
// touched, so a regression in one area fails only its own test.

const homeHeroCss = readFileSync(new URL('../../src/styles/home/home-hero.css', import.meta.url), 'utf8');
const recentProjectsCss = readFileSync(
  new URL('../../src/styles/home/recent-projects.css', import.meta.url),
  'utf8',
);
const viewerToolsCss = readFileSync(new URL('../../src/styles/viewer/tools.css', import.meta.url), 'utf8');
const drawerCss = readFileSync(new URL('../../src/styles/workspace/drawer.css', import.meta.url), 'utf8');
const mentionHomeCss = readFileSync(
  new URL('../../src/styles/workspace/mention-home.css', import.meta.url),
  'utf8',
);

function cssDeclarations(css: string, selector: string): string {
  const blocks: string[] = [];
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  if (blocks.length === 0) throw new Error(`Missing CSS block for ${selector}`);
  return blocks.join('\n');
}

function ruleValue(block: string, property: string): string {
  const matches = [...block.matchAll(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`, 'g'))];
  const match = matches.at(-1);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('recvpYC6eTaifb — home hero blank space above the title (empty workspace)', () => {
  it('drops the fixed top-hugging offset when the hero centers vertically', () => {
    // The base `.home-hero` padding-top is a large fixed value tuned for the
    // "hugging the top" layout. `.home-view--centered` (no recent projects)
    // instead vertically centers the column — stacking the fixed offset on
    // top of that centering doubled up the blank space above the logo/title.
    const centeredHero = cssDeclarations(homeHeroCss, '.home-view--centered .home-hero');
    const baseHero = cssDeclarations(homeHeroCss, '.home-hero');

    expect(ruleValue(centeredHero, 'padding-top')).toBe('var(--spacing-4)');
    // The base (non-centered) tuned offset must stay untouched — this is an
    // override for the centered variant only, not a rewrite of the fold math.
    expect(ruleValue(baseHero, 'padding')).toBe('240px 0 var(--spacing-4)');
    // The centering itself (the other candidate cause) stays intact too.
    const centeredView = cssDeclarations(homeHeroCss, '.home-view--centered');
    expect(ruleValue(centeredView, 'justify-content')).toBe('center');
  });
});

describe('recvpYDfW12NBu — example-prompt preset thumbnails read as mostly padding', () => {
  it('zooms baked preset posters/videos in past their raw cover-fit crop', () => {
    // The fix is a FRAMING transform on the resting tile: the baked poster is
    // framed 1.31:1 while the preset cell is a wider ~1.65:1 box, so a bare
    // object-fit:cover only crops vertically and leaves the poster's own
    // canvas margin intact on every side. Scaling the already-cover-fitted
    // media up around its centre crops that margin off instead.
    const img = cssDeclarations(homeHeroCss, '.home-hero__plugin-preset-preview .plugins-home__media-img');
    const video = cssDeclarations(homeHeroCss, '.home-hero__plugin-preset-preview .plugins-home__media-video');

    expect(ruleValue(img, 'transform')).toBe('scale(1.15)');
    expect(ruleValue(video, 'transform')).toBe('scale(1.15)');
  });

  it('keeps the framing zoom out of the hover state (cover zoom removed 2026-07-27)', () => {
    // The whole hover "cover zoom" family (recent projects, community cards,
    // plugins gallery, design files, project drawer, prompt templates, hero
    // presets) was removed on dogfood feedback — scaling raster/video/iframe
    // thumbs resamples them and the covers go visibly soft. The resting
    // framing zoom above must not grow a hover partner again.
    for (const selector of [
      '.home-hero__plugin-preset:not(:disabled):hover .plugins-home__media-img',
      '.home-hero__plugin-preset:not(:disabled):hover .plugins-home__media-video',
      '.home-hero__plugin-preset:not(:disabled):hover .plugins-home__html-iframe',
    ]) {
      expect(() => cssDeclarations(homeHeroCss, selector)).toThrow(/Missing CSS block/);
    }
  });
});

describe('recvpYEHCwtxXX — selected recent-project checkbox degrades to outline on hover', () => {
  it('re-asserts the filled accent state at matching specificity on hover', () => {
    // The base selected style.
    const selected = cssDeclarations(recentProjectsCss, '.recent-projects__select-check[aria-pressed="true"]');
    expect(ruleValue(selected, 'background')).toBe('var(--accent)');
    expect(ruleValue(selected, 'border-color')).toBe('var(--accent)');

    // The hover override must restate the same filled look — otherwise the
    // global `button:hover:not(:disabled)` primitive (higher specificity:
    // adds the `button` type selector) wins and flattens it back to
    // bg-subtle/border-strong (a hollow-looking circle).
    const selectedHover = cssDeclarations(
      recentProjectsCss,
      '.recent-projects__select-check[aria-pressed="true"]:hover:not(:disabled)',
    );
    expect(ruleValue(selectedHover, 'background')).toBe('var(--accent)');
    expect(ruleValue(selectedHover, 'border-color')).toBe('var(--accent)');
    expect(ruleValue(selectedHover, 'color')).toBe('var(--accent-contrast, #fff)');
  });
});

describe('recvpYFyj6Rcxi — "演示" menu deck hint text overflows/gets cut off', () => {
  it('lets the present-menu copy column wrap instead of inheriting nowrap', () => {
    // The global `button { white-space: nowrap; height: 36px; }` reset
    // (primitives.css) was inherited by the label + `<small>` hint, keeping
    // the deck hint on one unbroken line that overflowed the 168px-wide
    // menu with no ellipsis. The button needs auto height to grow for the
    // wrapped copy, and the copy column needs its own white-space: normal.
    const button = cssDeclarations(viewerToolsCss, '.present-menu button');
    expect(ruleValue(button, 'height')).toBe('auto');

    const copy = cssDeclarations(viewerToolsCss, '.present-menu-copy');
    expect(ruleValue(copy, 'white-space')).toBe('normal');
  });
});

describe('recvpZpbZcu4iy — design-file tab bar has no border separating it from the preview', () => {
  it('gives .ws-tabs-shell a bottom hairline', () => {
    const shell = cssDeclarations(drawerCss, '.ws-tabs-shell');
    expect(ruleValue(shell, 'border-bottom')).toBe('1px solid var(--border)');
  });
});

describe('recvq4iEq1Esno — settings full page swallowed the autosave "Saved" pill', () => {
  it('hides only the close/fullscreen chrome buttons on the full-page presentation, not the autosave pill', () => {
    // The old rule targeted `.settings-chrome` itself — the shared corner
    // strip that also contains `.settings-autosave` — so hiding the
    // close/fullscreen buttons for page mode took the save confirmation
    // down with them. #6156 re-introduced the bare selector to centre the
    // pill under the top nav, which is fine: what must never come back is a
    // page-mode rule that hides the whole strip. Absent is fine too, hence the
    // tolerant read.
    let chromeStrip = '';
    try {
      chromeStrip = cssDeclarations(mentionHomeCss, '.settings-page-shell .settings-chrome');
    } catch {
      chromeStrip = '';
    }
    expect(chromeStrip).not.toMatch(/display\s*:\s*none/);

    // The fix must still hide the buttons that don't belong on a full page
    // (there's a "返回首页" link instead of a floating close/fullscreen pair).
    const hiddenButtons = cssDeclarations(mentionHomeCss, '.settings-page-shell .settings-chrome-btn');
    expect(ruleValue(hiddenButtons, 'display')).toBe('none');
  });
});
