// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found in srcdoc');
  return match[1];
}

function installQueuedTimers(win: object) {
  const callbacks: Array<() => void> = [];
  Object.defineProperty(win, 'setTimeout', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      if (typeof callback === 'function') callbacks.push(callback);
      return callbacks.length;
    }),
  });
  Object.defineProperty(win, 'clearTimeout', {
    configurable: true,
    value: vi.fn(),
  });
  return function flushTimers() {
    for (let i = 0; i < 100 && callbacks.length; i += 1) callbacks.shift()?.();
  };
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  return parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === 'od:slide-state')
    .at(-1);
}

describe('deck bridge - CSS-only decks', () => {
  it('hides a persistently-visible first slide after the active page changes', () => {
    const bodyHtml = `
      <style>
        .stage { width: 1920px; height: 1080px; position: relative; }
        .slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
        }
        .slide:first-child { opacity: 1; pointer-events: auto; }
        .slide.active { opacity: 1; pointer-events: auto; }
      </style>
      <main class="stage">
        <section class="slide active">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </main>
    `;
    const srcdoc = buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    );
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    flushTimers();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    flushTimers();

    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(slides[0]?.hasAttribute('data-od-deck-host-hidden')).toBe(true);
    expect(slides[1]?.hasAttribute('data-od-deck-host-hidden')).toBe(false);
    expect(win.getComputedStyle(slides[0]!).display).toBe('none');
    expect(win.getComputedStyle(slides[1]!).opacity).toBe('1');
    expect(win.getComputedStyle(slides[2]!).opacity).toBe('0');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'prev' },
    }));
    flushTimers();

    expect(slides[0]?.hasAttribute('data-od-deck-host-hidden')).toBe(false);
    expect(win.getComputedStyle(slides[0]!).display).not.toBe('none');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });
    win.close();
  });

  it('leaves normally hidden inactive slides under artifact control', () => {
    const bodyHtml = `
      <style>
        .stage { width: 1920px; height: 1080px; position: relative; }
        .slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
        }
        .slide.active { opacity: 1; pointer-events: auto; }
      </style>
      <main class="stage">
        <section class="slide active">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </main>
    `;
    const srcdoc = buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    );
    const script = extractDeckBridgeScript(srcdoc);
    const dom = new JSDOM(srcdoc, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    flushTimers();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    flushTimers();

    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(slides.every((slide) => !slide.hasAttribute('data-od-deck-host-hidden'))).toBe(true);
    expect(win.getComputedStyle(slides[0]!).opacity).toBe('0');
    expect(win.getComputedStyle(slides[1]!).opacity).toBe('1');
    win.close();
  });

  it('navigates decks whose only visibility rule is .slide:first-child', () => {
    const bodyHtml = `
      <style>
        .stage { width: 1920px; height: 1080px; position: relative; }
        .slide { display: none !important; }
        .slide:first-child { display: flex !important; }
      </style>
      <main class="stage">
        <section class="slide">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </main>
    `;
    const script = extractDeckBridgeScript(buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    ));
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    flushTimers();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    flushTimers();

    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(slides.map((slide) => win.getComputedStyle(slide).display)).toEqual([
      'none',
      'flex',
      'none',
    ]);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 2 },
    }));
    flushTimers();

    expect(slides.map((slide) => win.getComputedStyle(slide).display)).toEqual([
      'none',
      'none',
      'flex',
    ]);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });
    win.close();
  });

  it('preserves each slide layout mode in class-driven decks', () => {
    const bodyHtml = `
      <style>
        .stage { width: 1920px; height: 1080px; position: relative; }
        .slide { position: absolute; inset: 0; }
        .slide:not(.active) { display: none; }
        .slide-layout-flex { display: flex; }
        .slide-layout-grid { display: grid; }
      </style>
      <main class="stage">
        <section class="slide slide-layout-flex active">One</section>
        <section class="slide slide-layout-grid">Two</section>
      </main>
    `;
    const script = extractDeckBridgeScript(buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    ));
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    flushTimers();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    flushTimers();

    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(win.getComputedStyle(slides[0]!).display).toBe('none');
    expect(win.getComputedStyle(slides[1]!).display).toBe('grid');
    expect(slides[1]!.style.display).toBe('');
    win.close();
  });

  it('fits a fixed slide canvas inside a smaller iframe viewport', () => {
    const bodyHtml = `
      <style>
        .stage { width: 1920px; height: 1080px; position: relative; }
        .slide { position: absolute; inset: 0; }
        .slide:not(:first-child) { display: none; }
      </style>
      <main class="stage" data-od-id="deck-stage">
        <section class="slide">One</section>
        <section class="slide">Two</section>
      </main>
    `;
    const script = extractDeckBridgeScript(buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    ));
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', {
      configurable: true,
      value: 1518,
    });
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: 870,
    });
    for (const root of [win.document.documentElement, win.document.body]) {
      Object.defineProperty(root, 'clientWidth', {
        configurable: true,
        value: 1518,
      });
      Object.defineProperty(root, 'scrollWidth', {
        configurable: true,
        value: 1920,
      });
    }
    const stage = win.document.querySelector<HTMLElement>('.stage');
    if (!stage) throw new Error('stage not found');
    Object.defineProperty(stage, 'offsetWidth', {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(stage, 'offsetHeight', {
      configurable: true,
      value: 1080,
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    flushTimers();

    expect(stage.dataset.odDeckAutoFit).toBe('true');
    expect(stage.style.position).toBe('fixed');
    expect(stage.style.left).toBe('0px');
    expect(stage.style.top).toBe('0px');
    expect(stage.style.transformOrigin).toBe('top left');
    expect(stage.style.transform).toContain('scale(0.790625)');
    expect(stage.style.transform).toContain('translate(0px, 8.0625px)');
    win.close();
  });

  it('takes over a fixed slide canvas whose native transform is clipped by flex centering', () => {
    const bodyHtml = `
      <style>
        .viewport { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
        .stage { width: 1920px; height: 1080px; position: relative; transform-origin: 0 0; transform: translate(0px, 36px) scale(0.321875); }
        .slide { position: absolute; inset: 0; }
        .slide:not(:first-child) { display: none; }
      </style>
      <main class="viewport">
        <div class="stage">
          <section class="slide">One</section>
          <section class="slide">Two</section>
        </div>
      </main>
    `;
    const script = extractDeckBridgeScript(buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    ));
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', {
      configurable: true,
      value: 618,
    });
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: 420,
    });
    const stage = win.document.querySelector<HTMLElement>('.stage');
    if (!stage) throw new Error('stage not found');
    Object.defineProperty(stage, 'offsetWidth', {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(stage, 'offsetHeight', {
      configurable: true,
      value: 1080,
    });
    stage.getBoundingClientRect = vi.fn(() => ({
      bottom: 72,
      height: 347.625,
      left: -651,
      right: -33,
      top: -275.625,
      width: 618,
      x: -651,
      y: -275.625,
      toJSON: () => ({}),
    } as DOMRect));
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    flushTimers();

    expect(stage.dataset.odDeckAutoFit).toBe('true');
    expect(stage.style.position).toBe('fixed');
    expect(stage.style.transformOrigin).toBe('top left');
    expect(stage.style.transform).toContain('translate(0px, 36.1875px)');
    expect(stage.style.transform).toContain('scale(0.321875)');

    stage.style.transform = 'translate(0px, 36px) scale(0.321875)';
    win.dispatchEvent(new win.Event('resize'));

    expect(stage.dataset.odDeckAutoFit).toBe('true');
    expect(stage.style.transform).toContain('translate(0px, 36.1875px)');
    win.close();
  });

  it('restores host-owned layout when a late native fit runtime takes over', () => {
    const bodyHtml = `
      <style>
        .stage {
          width: 1920px;
          height: 1080px;
        }
        .slide { position: absolute; inset: 0; }
        .slide:not(:first-child) { display: none; }
      </style>
      <main
        class="stage"
        style="position: relative; left: 12px; top: 8px; right: 4px; bottom: 2px; transform-origin: center center;"
      >
        <section class="slide">One</section>
        <section class="slide">Two</section>
      </main>
    `;
    const script = extractDeckBridgeScript(buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    ));
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: 540,
    });
    const stage = win.document.querySelector<HTMLElement>('.stage');
    if (!stage) throw new Error('stage not found');
    Object.defineProperty(stage, 'offsetWidth', {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(stage, 'offsetHeight', {
      configurable: true,
      value: 1080,
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    flushTimers();

    expect(stage.dataset.odDeckAutoFit).toBe('true');
    expect(stage.style.position).toBe('fixed');
    stage.style.transform = 'translate(6px, 4px) scale(0.48)';
    win.dispatchEvent(new win.Event('resize'));
    flushTimers();

    expect(stage.dataset.odDeckAutoFit).toBeUndefined();
    expect(stage.style.transform).toBe('translate(6px, 4px) scale(0.48)');
    expect(stage.style.transformOrigin).toBe('center center');
    expect(stage.style.position).toBe('relative');
    expect(stage.style.left).toBe('12px');
    expect(stage.style.top).toBe('8px');
    expect(stage.style.right).toBe('4px');
    expect(stage.style.bottom).toBe('2px');
    win.close();
  });

  it('does not add fallback fitting to framework decks with their own fit runtime', () => {
    const bodyHtml = `
      <div class="deck-shell">
        <div class="deck-stage" id="deck-stage">
          <section class="slide active">One</section>
          <section class="slide">Two</section>
        </div>
      </div>
    `;
    const script = extractDeckBridgeScript(buildSrcdoc(
      `<!doctype html><html><body>${bodyHtml}</body></html>`,
      { deck: true },
    ));
    const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const win = dom.window;
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(win, 'innerWidth', {
      configurable: true,
      value: 1518,
    });
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: 870,
    });
    const stage = win.document.getElementById('deck-stage') as HTMLElement;
    Object.defineProperty(stage, 'offsetWidth', {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(stage, 'offsetHeight', {
      configurable: true,
      value: 1080,
    });
    const flushTimers = installQueuedTimers(win);

    new win.Function(script).call(win);
    win.dispatchEvent(new win.Event('load'));
    flushTimers();

    expect(stage.dataset.odDeckAutoFit).toBeUndefined();
    expect(stage.style.transform).toBe('');
    win.close();
  });
});
