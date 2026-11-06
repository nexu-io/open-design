// Measurement spec for the community template preview overlay's chrome
// (OPEND-2691 / OPEND-2692).
//
// On the macOS desktop host the window is `hiddenInset` and the OS draws the
// traffic lights over the top ~32px of the web content; the overlay covers the
// whole window, so a panel starting 28px down cut straight through them. The
// darwin host reserves the same 56px band the shared modal drag strip owns;
// every other host keeps the even 28px inset. The footer bar that carried the
// Remix action is gone, so the panel is two rows and no `__foot` rule remains.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODAL_WINDOW_DRAG_BACKDROP_SELECTOR } from '../../src/hooks/useModalWindowDragGuard';

const marketplaceCss = readFileSync(
  new URL('../../src/styles/home/plugin-marketplace-demo.css', import.meta.url),
  'utf8',
);
const dragStripCss = readFileSync(
  new URL('../../src/styles/modal-window-drag.css', import.meta.url),
  'utf8',
);

const DARWIN_OVERLAY_SELECTOR =
  "html:has(.workspace-shell--desktop[data-host-platform='darwin']) .community-template-preview";

function declarations(css: string, selector: string): string {
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks.join('\n');
}

describe('community template preview — window chrome', () => {
  it('insets the panel from the top through one variable that defaults to 28px', () => {
    const overlay = declarations(marketplaceCss, '.community-template-preview');
    expect(overlay).toMatch(/--community-template-preview-inset-top:\s*28px/);
    expect(overlay).toMatch(/padding:\s*var\(--community-template-preview-inset-top\) 28px 28px/);
    expect(overlay).toMatch(/position:\s*fixed/);
  });

  it('reserves the 56px traffic-light band on the macOS desktop host only', () => {
    const darwin = declarations(marketplaceCss, DARWIN_OVERLAY_SELECTOR);
    expect(darwin).toMatch(/--community-template-preview-inset-top:\s*56px/);
    expect(dragStripCss).toMatch(/--modal-window-drag-strip-height:\s*56px/);

    // No other selector may raise the inset: browsers and Windows keep 28px.
    const setters = marketplaceCss
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .match(/[^{}]+\{[^}]*--community-template-preview-inset-top:[^}]*\}/g)
      ?.map((rule) => rule.slice(0, rule.indexOf('{')).trim()) ?? [];
    expect(setters).toEqual(['.community-template-preview', DARWIN_OVERLAY_SELECTOR]);
  });

  it('shrinks the fit-to-window clamp by the top inset so the panel cannot slide back under the lights', () => {
    const panel = declarations(marketplaceCss, '.community-template-preview__panel');
    // The whole panel is 8% smaller than it was (per product), cap and
    // fit-to-window clamp alike, so the top-inset subtraction stays inside the
    // scaled clamp and the proportions hold at every window size.
    expect(panel).toMatch(/--preview-scale:\s*0\.92;/);
    expect(panel).toMatch(
      /height:\s*calc\(min\(760px, 100vh - 28px - var\(--community-template-preview-inset-top\)\) \* var\(--preview-scale\)\)/,
    );
    expect(panel).toMatch(/width:\s*calc\(min\(1120px, 100vw - 56px\) \* var\(--preview-scale\)\)/);
  });

  it('rounds the panel at 16px (--radius-xl), on the token ladder', () => {
    const panel = declarations(marketplaceCss, '.community-template-preview__panel');
    expect(panel).toMatch(/border-radius:\s*var\(--radius-xl\);/);
  });

  it('lets the uncovered top band drag the window like every other full-screen backdrop', () => {
    expect(MODAL_WINDOW_DRAG_BACKDROP_SELECTOR.split(',')).toContain('.community-template-preview');
    expect(dragStripCss.match(/\.community-template-preview\b/g)?.length).toBe(2);
  });

  it('is two rows — head and stage — with no Remix footer left in the stylesheet', () => {
    const panel = declarations(marketplaceCss, '.community-template-preview__panel');
    expect(panel).toMatch(/grid-template-rows:\s*auto minmax\(0, 1fr\);/);
    expect(marketplaceCss).not.toMatch(/community-template-preview__foot/);
    expect(marketplaceCss).not.toMatch(/community-template-preview__actions/);
  });
});
