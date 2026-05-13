// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Behavioral coverage for nexu-io/open-design#1530. The deck bridge in
// `buildSrcdoc({ deck: true })` counts slides via a DOM selector to drive
// the host preview toolbar's `slideState.count`. Generated HTML decks
// commonly nest `.slide` elements under an extra wrapper rather than
// placing them as direct children of the structured containers the bridge
// recognised (`.deck`, `.deck-stage`, `.deck-shell`, `body`). When that
// happened the bridge reported `count: 0` and the toolbar showed `1 / 0`
// even though the deck visibly contained slides and its own keyboard
// handler navigated them — the host counter did not match what the user
// saw. The fix keeps the structured selector first (so decorative
// `.slide` markup in non-deck pages is not accidentally counted) and
// falls back to all `.slide` only when the structured count is zero.

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function setupDeckBridge(bodyHtml: string) {
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
  });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const parentPostMessage = vi.fn();
  // jsdom defaults `window.parent` to `window` itself for top-level
  // documents; replace it with a stub that has a spied postMessage so
  // we can observe what the bridge would send to the embedding host.
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  const evaluate = new win.Function(script);
  evaluate.call(win);
  // jsdom fires `load` during construction, before the bridge IIFE
  // installs its listener. Replay it here so the test exercises the
  // same first-paint `report()` path the real preview iframe takes —
  // without this the only postMessage we'd capture would come from the
  // MutationObserver path inside `observeSlides`, which never fires
  // when the structured selector is empty (the pre-fix bug condition).
  win.dispatchEvent(new win.Event('load'));
  return { dom, win, parentPostMessage };
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((m) => m?.type === 'od:slide-state');
  return messages.at(-1);
}

describe('deck bridge — nested slide markup (#1530)', () => {
  it('counts nested .slide elements through a fallback when no structured container matches', async () => {
    // 8 slides nested two levels deep — none of `.deck > .slide`,
    // `.deck-stage > .slide`, `.deck-shell > .slide`, or `body > .slide`
    // matches them. The bridge must still count 8 so the host renders
    // `1 / 8` instead of the user-reported `1 / 0`.
    const slides = Array.from({ length: 8 }, (_, i) =>
      `<section class="slide">Slide ${i + 1}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(
      `<div class="deck-wrap"><div class="deck-inner">${slides}</div></div>`,
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state.count).toBe(8);
  });

  it('still counts slides under the documented containers as direct children and ignores decorative .slide markup outside them', async () => {
    // Pin the structured-first contract: direct children of `.deck` /
    // `.deck-stage` / `.deck-shell` / `body` keep working as before AND
    // decorative `.slide` markup placed outside any structured container
    // (e.g. a utility class on a banner graphic) is not pulled in just
    // because it shares the class name. Without the structured-first
    // pass a broad `.slide` selector would count 4 here, so this fixture
    // pins the precedence directly rather than only by docstring.
    const slides = Array.from({ length: 3 }, (_, i) =>
      `<section class="slide">${i}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(
      `<header><span class="slide" aria-hidden="true">decoy</span></header><div class="deck">${slides}</div>`,
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state.count).toBe(3);
  });
});
