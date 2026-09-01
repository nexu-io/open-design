// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found in srcdoc');
  return match[1];
}

function setupDeckStage(markup: string) {
  const source = `<!doctype html><html><body>
    ${markup}
    <script>document.addEventListener('keydown', function deckKeyboardNavigation() {});</script>
  </body></html>`;
  const script = extractDeckBridgeScript(buildSrcdoc(source, { deck: true }));
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'https://example.test/deck.html',
  });
  const win = dom.window;
  const parentPostMessage = vi.fn();
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  const timerCallbacks: Array<() => void> = [];
  Object.defineProperty(win, 'setTimeout', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      if (typeof callback === 'function') timerCallbacks.push(callback);
      return timerCallbacks.length;
    }),
  });
  Object.defineProperty(win, 'clearTimeout', {
    configurable: true,
    value: vi.fn(),
  });

  let syntheticKeyEvents = 0;
  win.document.addEventListener('keydown', () => {
    syntheticKeyEvents += 1;
  });

  win.eval(`
    customElements.define('deck-stage', class extends HTMLElement {
      connectedCallback() {
        this._slides = Array.from(this.children);
        this._index = 0;
        this.calls = [];
        this._apply('init');
      }
      get index() { return this._index; }
      get length() { return this._slides.length; }
      _apply(reason) {
        this._slides.forEach((slide, index) => {
          slide.toggleAttribute('data-deck-active', index === this._index);
        });
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail: { index: this._index, total: this._slides.length, reason },
          bubbles: true,
          composed: true,
        }));
      }
      goTo(index) {
        this.calls.push(['goTo', index]);
        this._index = Math.max(0, Math.min(this._slides.length - 1, index));
        this._apply('api');
      }
      next() {
        this.calls.push(['next']);
        this.goTo(this._index + 1);
      }
      prev() {
        this.calls.push(['prev']);
        this.goTo(this._index - 1);
      }
      reset() {
        this.calls.push(['reset']);
        this.goTo(0);
      }
    });
  `);

  const evaluate = new win.Function(script);
  evaluate.call(win);

  const stage = win.document.querySelector('deck-stage') as HTMLElement & {
    calls: unknown[][];
    index: number;
    goTo(index: number): void;
  };
  return {
    dom,
    flushTimers() {
      for (let i = 0; i < 100 && timerCallbacks.length; i += 1) {
        timerCallbacks.shift()?.();
      }
    },
    parentPostMessage,
    stage,
    syntheticKeyEvents: () => syntheticKeyEvents,
    win,
  };
}

function lastSlideState(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message?.type === 'od:slide-state')
    .at(-1);
}

describe('deck bridge - deck-stage public API compatibility', () => {
  it('navigates data-screen-label-only decks through the stage API', () => {
    const { dom, flushTimers, parentPostMessage, stage, syntheticKeyEvents, win } = setupDeckStage(`
      <deck-stage>
        <section class="cover" data-screen-label="01 Cover">One</section>
        <section class="agenda" data-screen-label="02 Agenda">Two</section>
        <section class="statement" data-screen-label="03 Statement">Three</section>
      </deck-stage>
    `);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 2 },
    }));
    flushTimers();

    expect(stage.index).toBe(2);
    expect(stage.calls).toContainEqual(['goTo', 2]);
    expect(syntheticKeyEvents()).toBe(0);
    expect(stage.children[2]?.hasAttribute('data-deck-active')).toBe(true);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });

    dom.window.close();
  });

  it('routes sequential and boundary navigation through the stage API', () => {
    const { dom, flushTimers, stage, syntheticKeyEvents, win } = setupDeckStage(`
      <deck-stage>
        <section data-screen-label="01 Cover">One</section>
        <section data-screen-label="02 Agenda">Two</section>
        <section data-screen-label="03 Close">Three</section>
      </deck-stage>
    `);
    const send = (action: 'next' | 'prev' | 'first' | 'last') => {
      win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'od:slide', action },
      }));
      flushTimers();
    };

    send('next');
    expect(stage.index).toBe(1);
    send('last');
    expect(stage.index).toBe(2);
    send('prev');
    expect(stage.index).toBe(1);
    send('first');
    expect(stage.index).toBe(0);

    expect(stage.calls).toContainEqual(['next']);
    expect(stage.calls).toContainEqual(['goTo', 2]);
    expect(stage.calls).toContainEqual(['prev']);
    expect(stage.calls).toContainEqual(['reset']);
    expect(syntheticKeyEvents()).toBe(0);

    dom.window.close();
  });

  it('counts mixed legacy and modern slide markers once and in document order', () => {
    const { dom, flushTimers, parentPostMessage, stage, win } = setupDeckStage(`
      <deck-stage>
        <section class="slide" data-screen-label="01 Both">One</section>
        <section class="agenda" data-screen-label="02 Modern">Two</section>
        <section class="deck-slide">Three</section>
        <section class="ppt-slide">Four</section>
      </deck-stage>
    `);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 3 },
    }));
    flushTimers();

    expect(stage.index).toBe(3);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 3, count: 4 });

    dom.window.close();
  });

  it('prefers an explicit deck-stage over unrelated screen labels elsewhere in the document', () => {
    const { dom, flushTimers, parentPostMessage, stage, win } = setupDeckStage(`
      <aside data-screen-label="Prototype navigation">Not a slide</aside>
      <deck-stage>
        <section data-screen-label="01 Cover">One</section>
        <section data-screen-label="02 Agenda">Two</section>
      </deck-stage>
    `);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 1 },
    }));
    flushTimers();

    expect(stage.index).toBe(1);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 2 });

    dom.window.close();
  });

  it('reports direct deck-stage navigation back to host-owned chrome', () => {
    const { dom, parentPostMessage, stage } = setupDeckStage(`
      <deck-stage>
        <section data-screen-label="01 Cover">One</section>
        <section data-screen-label="02 Agenda">Two</section>
      </deck-stage>
    `);
    parentPostMessage.mockClear();

    stage.goTo(1);

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 2 });

    dom.window.close();
  });
});
