// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Behavioral coverage for nexu-io/open-design#7604. Some deck-authoring
// conventions (reveal.js is the concrete case that triggered this) hide
// inactive slides by toggling a class on an ANCESTOR of the `.slide`
// element rather than on `.slide` itself -- reveal.js puts `.present` /
// `.past` / `.future` on the parent `<section>`, one level above `.slide`,
// and its own stylesheet hides non-present sections via `display: none`.
// `display` and `opacity` do not inherit through the CSS cascade, so the
// `.slide` child's own `getComputedStyle()` never reflects the ancestor's
// hidden state. The bridge's last-resort `findActiveByVisibility()`
// heuristic only inspected the `.slide` element itself, so it always
// reported index 0 regardless of which `<section>` was actually visible --
// every per-slide thumbnail iframe rendered slide 1's content. The fix
// walks the ancestor chain (bounded at document.body/documentElement,
// matching the existing `transformTrack()` convention) and extends
// `observeSlides()`'s MutationObserver to watch the same ancestor reach so
// the host's live slide counter also stays in sync during manual
// in-iframe navigation with no host request in flight.

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
  win.scrollTo = vi.fn() as typeof win.scrollTo;
  const parentPostMessage = vi.fn();
  // jsdom defaults `window.parent` to `window` itself for top-level
  // documents; replace it with a stub that has a spied postMessage so we
  // can observe what the bridge would send to the embedding host.
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  const evaluate = new win.Function(script);
  evaluate.call(win);
  // jsdom fires `load` during construction, before the bridge IIFE
  // installs its listener. Replay it here so the test exercises the same
  // first-paint `report()` path the real preview iframe takes.
  win.dispatchEvent(new win.Event('load'));
  return { dom, win, parentPostMessage };
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((m) => m?.type === 'od:slide-state');
  return messages.at(-1);
}

function postSlide(win: ReturnType<typeof setupDeckBridge>['win'], action: 'next' | 'prev') {
  win.dispatchEvent(new win.window.MessageEvent('message', {
    data: { type: 'od:slide', action },
  }));
}

// A reveal.js-shaped deck: `.slide` sits one level inside the `<section>`
// that actually carries the visibility state. No scroll container, no
// `deck-stage`, no leaf-level active class, no transform track -- so
// `activeIndex()` is forced all the way down to `findActiveByVisibility()`.
function revealDeckHtml(presentIndex: number): string {
  const sections = [0, 1, 2].map((i) => (
    `<section${i === presentIndex ? ' class="present"' : ''}><div class="slide">Slide ${i + 1}</div></section>`
  )).join('');
  return `
    <style>.slides > section:not(.present) { display: none; }</style>
    <div class="reveal"><div class="slides">${sections}</div></div>
  `;
}

describe('deck bridge — ancestor-hidden slides (#7604)', () => {
  it('detects the active slide when a reveal.js-style ancestor toggles visibility', async () => {
    const { win, parentPostMessage } = setupDeckBridge(revealDeckHtml(1));

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('navigates via the key-simulation fallback once ancestor-hidden slides are detected correctly', async () => {
    const { win, parentPostMessage } = setupDeckBridge(revealDeckHtml(0));
    const sections = Array.from(win.document.querySelectorAll('.slides > section'));
    let active = 0;
    function paint() {
      sections.forEach((section, index) => {
        section.classList.toggle('present', index === active);
      });
    }
    function go(index: number) {
      active = Math.max(0, Math.min(sections.length - 1, index));
      paint();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') go(active + 1);
      else if (event.key === 'ArrowLeft') go(active - 1);
    }
    win.addEventListener('keydown', onKey, true);
    win.document.addEventListener('keydown', onKey, true);
    paint();

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('updates the host counter via observeSlides when the deck navigates itself with no host request in flight', async () => {
    const { win, parentPostMessage } = setupDeckBridge(revealDeckHtml(0));
    const sections = Array.from(win.document.querySelectorAll('.slides > section'));
    let active = 0;
    function paint() {
      sections.forEach((section, index) => {
        section.classList.toggle('present', index === active);
      });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        active = Math.min(sections.length - 1, active + 1);
        paint();
      }
    }
    win.addEventListener('keydown', onKey, true);
    win.document.addEventListener('keydown', onKey, true);
    paint();
    // Let observeSlides() finish installing its MutationObserver before we
    // drive the deck's own (simulated) internal navigation.
    await new Promise<void>((resolve) => win.setTimeout(resolve, 150));

    // Simulate the deck's own internal keyboard handling directly -- no
    // `od:slide` message is ever sent, so the only way the host can learn
    // about this is the MutationObserver installed by observeSlides().
    win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowRight',
    }));
    win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowRight',
    }));

    // Past the 60ms MutationObserver debounce.
    await new Promise<void>((resolve) => win.setTimeout(resolve, 250));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });
  });

  it('does not treat a partially-opaque ancestor wrapper as hidden', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        .slides > section:not(.present) { display: none; }
        .fade-wrap { opacity: 0.4; }
      </style>
      <div class="reveal"><div class="fade-wrap"><div class="slides">
        <section><div class="slide">One</div></section>
        <section class="present"><div class="slide">Two</div></section>
        <section><div class="slide">Three</div></section>
      </div></div></div>
    `);

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('still detects a leaf-level display:none slide directly, unchanged from before', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <section class="slide" style="display:none">One</section>
      <section class="slide">Two</section>
      <section class="slide" style="display:none">Three</section>
    `);

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });
});
