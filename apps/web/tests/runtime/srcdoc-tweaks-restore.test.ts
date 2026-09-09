import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

/**
 * Mirrors the visibility contract of the shipped tweaks template
 * (`design-templates/tweaks/example.html`): the floating restore button is
 * `display: none` until the artifact's own close handler adds `tw-show`.
 *
 * The preview runtime must not override that contract. When it does, an
 * artifact whose panel has been closed has no pointer-reachable way back —
 * the keyboard shortcut is the only entry point left, and the hint for it is
 * printed on the very button that got hidden.
 */
const TWEAKS_ARTIFACT = `<!doctype html>
<html>
  <head>
    <style>
      .tw-panel { position: fixed; top: 16px; right: 16px; }
      .tw-panel.tw-hidden { opacity: 0; }
      .tw-restore {
        position: fixed;
        top: 16px; right: 16px;
        width: 36px; height: 36px;
        display: none;
        align-items: center;
        justify-content: center;
      }
      .tw-restore.tw-show { display: flex; }
    </style>
  </head>
  <body>
    <aside class="tw-panel" id="tw-panel">Tweaks</aside>
    <button class="tw-restore" id="tw-restore" title="Show panel (T)">T</button>
  </body>
</html>`;

describe('srcDoc tweaks bridge', () => {
  it('keeps the artifact restore control reachable once its panel is closed', () => {
    const doc = buildSrcdoc(TWEAKS_ARTIFACT);
    const dom = new JSDOM(doc, { url: 'http://open-design.local/' });
    const { document, getComputedStyle } = dom.window;

    const panel = document.getElementById('tw-panel');
    const restore = document.getElementById('tw-restore');
    expect(panel).not.toBeNull();
    expect(restore).not.toBeNull();

    // Exactly what the artifact's own `× close` handler does.
    panel!.classList.add('tw-hidden');
    restore!.classList.add('tw-show');

    const style = getComputedStyle(restore!);
    expect(style.display).not.toBe('none');
    expect(style.visibility).not.toBe('hidden');
    expect(style.pointerEvents).not.toBe('none');

    dom.window.close();
  });

  it('still hides the restore control while the panel is open', () => {
    const doc = buildSrcdoc(TWEAKS_ARTIFACT);
    const dom = new JSDOM(doc, { url: 'http://open-design.local/' });
    const restore = dom.window.document.getElementById('tw-restore');

    // No `tw-show`: the artifact itself keeps the button out of the way while
    // the panel is visible, and the runtime must not force it on either.
    expect(dom.window.getComputedStyle(restore!).display).toBe('none');

    dom.window.close();
  });
});
