// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Regression for nexu-io/open-design#1393. Some HTML files drive their
// colors through `:root { --token: <color> }` and `var(--token)` rather
// than baking colors into element-level inline styles. The original
// palette bridge only walked the DOM and read `getComputedStyle` for
// `color` / `backgroundColor` / `borderColor`, which returns the
// fallback / inherited value for nodes that paint via variables — so
// `chromatic()` rejected those reads and the iframe stayed in its
// original palette even though the host showed the new one as
// selected.

function extractPaletteScript(srcdoc: string): string {
  const match = srcdoc.match(
    /<script data-od-palette-bridge>([\s\S]*?)<\/script>/,
  );
  if (!match || !match[1]) {
    throw new Error('palette bridge script not found in srcdoc');
  }
  return match[1];
}

function setupPaletteDom(headHtml: string, bodyHtml: string) {
  const fullDoc = `<!doctype html><html><head>${headHtml}</head><body>${bodyHtml}</body></html>`;
  const srcdoc = buildSrcdoc(fullDoc, { paletteBridge: true });
  const script = extractPaletteScript(srcdoc);

  const dom = new JSDOM(fullDoc, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;

  const evaluate = new win.Function(script);
  evaluate.call(win);

  return { dom, win };
}

async function postPalette(win: { postMessage: Window['postMessage']; setTimeout: Window['setTimeout'] }, palette: string | null): Promise<void> {
  win.postMessage({ type: 'od:palette', palette }, '*');
  await new Promise<void>((resolve) => win.setTimeout(resolve, 10));
}

describe('palette bridge — CSS custom properties (#1393)', () => {
  it('shifts chromatic :root custom properties to the requested palette hue', async () => {
    const { win } = setupPaletteDom(
      '<style>:root { --bg: #ff5a3c; --space: 8px; } body { background: var(--bg); }</style>',
      '<main>Hero</main>',
    );

    await postPalette(win, 'electric');

    const override = win.document.documentElement.style.getPropertyValue('--bg');
    expect(override).not.toBe('');
    expect(override).toMatch(/^rgb\(/);
    expect(override).not.toBe('rgb(255, 90, 60)');
    // Non-chromatic tokens (lengths, radii) must be left alone so the
    // bridge does not clobber `--space`, `--radius`, etc. with a color.
    expect(win.document.documentElement.style.getPropertyValue('--space')).toBe('');
  });

  it('restores the original :root custom property values when the palette is cleared', async () => {
    const { win } = setupPaletteDom(
      '<style>:root { --bg: #ff5a3c; } body { background: var(--bg); }</style>',
      '<main>Hero</main>',
    );

    await postPalette(win, 'electric');
    expect(win.document.documentElement.style.getPropertyValue('--bg')).not.toBe('');

    await postPalette(win, null);
    expect(win.document.documentElement.style.getPropertyValue('--bg')).toBe('');
  });

  it('walks @media-nested :root rules so media-scoped palette variables are also shifted', async () => {
    const { win } = setupPaletteDom(
      '<style>@media all { :root { --bg-media: #00aaff; } }</style>',
      '<main>Hero</main>',
    );

    await postPalette(win, 'coral');

    const override = win.document.documentElement.style.getPropertyValue('--bg-media');
    expect(override).not.toBe('');
    expect(override).toMatch(/^rgb\(/);
    expect(override).not.toBe('rgb(0, 170, 255)');
  });
});
