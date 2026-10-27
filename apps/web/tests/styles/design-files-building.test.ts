import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const buildingCss = readFileSync(
  new URL('../../src/components/design-files/DesignFilesBuildingState.module.css', import.meta.url),
  'utf8',
);
const feedCss = readFileSync(
  new URL('../../src/components/design-files/RunStepFeed.module.css', import.meta.url),
  'utf8',
);
const toggleCss = readFileSync(
  new URL('../../src/components/design-files/BuildPreviewToggle.module.css', import.meta.url),
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

/** The INSIDE of the reduced-motion block. The at-rule's own braces have to go
 *  first: the flat rule matcher above cannot see through a nested block. */
function reducedMotionBlock(css: string): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (start < 0) throw new Error('Missing a reduced-motion block');
  const open = css.indexOf('{', start);
  if (open < 0) throw new Error('Malformed reduced-motion block');
  return css.slice(open + 1);
}

describe('design files building preview styles', () => {
  // THE drop-target guard. `.df-body` owns the drag-to-upload handlers; an
  // iframe that accepts pointer events swallows dragenter/dragover and the
  // whole upload path silently stops working while a preview is up.
  it('keeps the preview frame out of the pointer path', () => {
    expect(cssDeclarations(buildingCss, '.frame')).toMatch(
      /(?:^|[;\n])\s*pointer-events:\s*none\s*;/,
    );
    expect(cssDeclarations(buildingCss, '.overlay')).toMatch(
      /(?:^|[;\n])\s*pointer-events:\s*none\s*;/,
    );
    expect(cssDeclarations(buildingCss, '.dock')).toMatch(
      /(?:^|[;\n])\s*pointer-events:\s*none\s*;/,
    );
  });

  // Nothing on this surface takes a click any more: the way out is the
  // topbar's preview switch (BuildPreviewToggle), so the whole overlay can
  // stay click-through and the pane's drop target keeps working everywhere.
  it('leaves no clickable control on top of the rendered page', () => {
    expect(buildingCss).not.toMatch(/pointer-events:\s*auto/);
  });

  it('glides the cursor on the house easing', () => {
    expect(cssDeclarations(buildingCss, '.cursor')).toMatch(
      /transition:\s*transform\s+\d+ms\s+cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/,
    );
  });

  it('stops the cursor motion under reduced motion', () => {
    const reduced = reducedMotionBlock(buildingCss);
    expect(cssDeclarations(reduced, '.cursor')).toMatch(/transition:\s*none/);
    expect(cssDeclarations(reduced, '.cursorRing')).toMatch(/animation:\s*none/);
  });
});

describe('run step feed styles', () => {
  // A log the user cannot grab: `overflow: hidden` still takes a scripted
  // scrollTop, which is what lets the whole text block stay click-through.
  it('scrolls itself without offering a scrollbar', () => {
    const feed = cssDeclarations(feedCss, '.feed');
    expect(feed).toMatch(/(?:^|[;\n])\s*overflow:\s*hidden\s*;/);
    expect(feed).not.toMatch(/overflow:\s*auto/);
    expect(feed).not.toMatch(/overflow-y:\s*(auto|scroll)/);
  });

  // Oldest lines leave at the TOP now that the newest one is at the bottom —
  // but only while something IS leaving. A feed that fits has nothing
  // scrolling out, and masking it anyway washed its single status line
  // ("thinking") into a gradient, so the fade hangs off the overflow flag the
  // component sets rather than off the feed itself.
  it('fades the top edge only while the log actually overflows', () => {
    expect(cssDeclarations(feedCss, '.feed')).not.toMatch(/mask-image/);
    expect(cssDeclarations(feedCss, ".feed[data-overflowing='true']")).toMatch(
      /mask-image:\s*linear-gradient\(to bottom, transparent/,
    );
  });

  // The feed is a column flex box with a capped height and its items clip
  // their own text, so their `min-height: auto` is 0 — the default
  // `flex-shrink: 1` squeezed ten 16px lines into 112px at 9px each and the
  // text overlapped the line below it. The log has to scroll, never compress.
  it('keeps every line at its own height instead of squeezing the stack', () => {
    expect(cssDeclarations(feedCss, '.item')).toMatch(
      /(?:^|[;\n])\s*flex-shrink:\s*0\s*;/,
    );
  });

  it('lands a new line on the house easing, and not at all under reduced motion', () => {
    expect(cssDeclarations(feedCss, '.item')).toMatch(
      /animation:\s*df-feed-enter\s+\d+ms\s+cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/,
    );
    expect(cssDeclarations(reducedMotionBlock(feedCss), '.item')).toMatch(/animation:\s*none/);
  });
});

describe('build preview toggle styles', () => {
  it('throws the knob on the house easing, and not at all under reduced motion', () => {
    expect(cssDeclarations(toggleCss, '.knob')).toMatch(
      /transition:\s*transform\s+\d+ms\s+cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/,
    );
    expect(cssDeclarations(reducedMotionBlock(toggleCss), '.knob')).toMatch(
      /transition:\s*none/,
    );
  });

  // It is a switch in a toolbar of icon buttons; a keyboard user has to be
  // able to see which one they are on.
  it('keeps a visible focus state', () => {
    expect(cssDeclarations(toggleCss, '.toggle:focus-visible')).toMatch(/outline:\s*2px/);
  });
});
