// Runtime behavior of the Deck presentation bridge.
//
// The full-screen presentation overlay used to rebuild the deck from source
// with `buildSrcdoc({ hideDeckChrome, deckClickNavigation })`, which threw away
// the live document's JS heap, canvases, and timers. This bridge applies the
// same two effects to the already-running real-URL document over postMessage,
// so the assertions below are the behavioral contract the host wires against:
// enter hides chrome (including the <deck-stage> shadow DOM path) and turns
// clicks into navigation intents; exit restores the document exactly.

import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  DECK_PRESENTATION_APPLIED_MESSAGE_TYPE,
  DECK_PRESENTATION_BRIDGE_MARKER,
  DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE,
  DECK_PRESENTATION_PROTOCOL_VERSION,
  DECK_PRESENTATION_READY_MESSAGE_TYPE,
  DECK_PRESENTATION_SET_MESSAGE_TYPE,
  DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID,
  buildDeckPresentationBridge,
} from '@open-design/contracts/runtime/deck-presentation';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: Record<string, unknown>) => any;
};

const IDENTITY = { sessionId: 'session-1', documentVersion: 'version-1' };

function bridgeSource(): string {
  const bridge = buildDeckPresentationBridge();
  const match = bridge.match(/^<script\b[^>]*>([\s\S]*)<\/script>$/u);
  if (!match?.[1]) throw new Error('deck presentation bridge must be one script element');
  return match[1];
}

function createHarness(bodyHtml = '') {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${bodyHtml}</body></html>`,
    { runScripts: 'outside-only', url: 'http://localhost/deck.html' },
  );
  const posted: any[] = [];
  const timers: Array<{ callback: () => void; cancelled: boolean }> = [];
  const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
  const parentStub = { postMessage: (message: unknown) => posted.push(message) };
  Object.defineProperty(context, 'parent', { configurable: true, value: parentStub });
  context.setTimeout = (callback: () => void) => {
    timers.push({ callback, cancelled: false });
    return timers.length;
  };
  context.clearTimeout = (id: number) => {
    const timer = timers[id - 1];
    if (timer) timer.cancelled = true;
  };
  vm.runInContext(bridgeSource(), context);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  function send(message: Record<string, unknown>) {
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: message,
      source: parentStub,
    }));
  }

  function setPresenting(presenting: boolean, revision: number) {
    send({
      type: DECK_PRESENTATION_SET_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      ...IDENTITY,
      presenting,
      revision,
    });
    return posted.filter((m) => m?.type === DECK_PRESENTATION_APPLIED_MESSAGE_TYPE).at(-1);
  }

  function click(target: any, clientX: number) {
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX,
    });
    target.dispatchEvent(event);
    return event;
  }

  function drainTimers(limit = 10) {
    for (let round = 0; round < limit; round += 1) {
      const pending = timers.filter((timer) => !timer.cancelled);
      if (!pending.length) return;
      for (const timer of pending) {
        timer.cancelled = true;
        timer.callback();
      }
    }
  }

  return { click, dom, drainTimers, posted, send, setPresenting };
}

function chromeStyle(dom: any): any {
  return dom.window.document.querySelector('style[data-od-deck-chrome-hidden]');
}

function navigateMessages(posted: any[]) {
  return posted.filter((m) => m?.type === DECK_PRESENTATION_NAVIGATE_MESSAGE_TYPE);
}

describe('deck presentation bridge', () => {
  it('carries the shared injection marker', () => {
    expect(buildDeckPresentationBridge()).toContain(DECK_PRESENTATION_BRIDGE_MARKER);
  });

  it('announces itself once the document is parsed', () => {
    const { posted } = createHarness();
    expect(posted.filter((m) => m?.type === DECK_PRESENTATION_READY_MESSAGE_TYPE)).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      type: DECK_PRESENTATION_READY_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
    });
  });

  it('hides deck chrome on enter and restores it on exit', () => {
    const { dom, setPresenting } = createHarness('<div class="deck-nav">chrome</div>');
    expect(chromeStyle(dom)).toBeNull();

    const entered = setPresenting(true, 1);
    expect(entered).toMatchObject({
      revision: 1,
      presenting: true,
      chromeHidden: true,
      clickNavigation: true,
      ...IDENTITY,
    });
    const style = chromeStyle(dom);
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('.deck-nav');

    const exited = setPresenting(false, 2);
    expect(exited).toMatchObject({ revision: 2, presenting: false, chromeHidden: false });
    expect(chromeStyle(dom)).toBeNull();
  });

  it('hides and restores deck-stage shadow chrome', () => {
    const { dom, drainTimers, setPresenting } = createHarness();
    const stage = dom.window.document.createElement('deck-stage');
    dom.window.document.body.appendChild(stage);
    const shadow = stage.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div class="tapzones"></div><div class="overlay"></div>';

    const entered = setPresenting(true, 1);
    drainTimers();
    expect(entered).toMatchObject({ deckStageCount: 1, deckStagesHidden: 1 });
    const injected = shadow.getElementById(DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID);
    expect(injected).not.toBeNull();
    expect(injected!.textContent).toContain('.tapzones');

    const exited = setPresenting(false, 2);
    expect(exited).toMatchObject({ deckStagesHidden: 0 });
    expect(shadow.getElementById(DECK_STAGE_SHADOW_CHROME_HIDE_STYLE_ID)).toBeNull();
  });

  it('turns half-screen clicks into navigation intents only while presenting', () => {
    const { click, dom, posted, setPresenting } = createHarness('<p id="body-text">Slide</p>');
    const target = dom.window.document.getElementById('body-text');

    click(target, 100);
    expect(navigateMessages(posted)).toHaveLength(0);

    setPresenting(true, 1);
    const left = click(target, 100);
    const right = click(target, dom.window.innerWidth - 100);
    expect(left.defaultPrevented).toBe(true);
    expect(right.defaultPrevented).toBe(true);
    expect(navigateMessages(posted).map((m) => m.direction)).toEqual(['prev', 'next']);
    expect(navigateMessages(posted)[0]).toMatchObject({
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      revision: 1,
      ...IDENTITY,
    });

    setPresenting(false, 2);
    const afterExit = click(target, 100);
    expect(afterExit.defaultPrevented).toBe(false);
    expect(navigateMessages(posted)).toHaveLength(2);
  });

  it('leaves interactive targets and modified clicks to the artifact', () => {
    const { click, dom, posted, setPresenting } = createHarness(
      '<button id="cta">Go</button><p id="plain">Slide</p>',
    );
    setPresenting(true, 1);

    click(dom.window.document.getElementById('cta'), 100);
    expect(navigateMessages(posted)).toHaveLength(0);

    const plain = dom.window.document.getElementById('plain');
    plain.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      metaKey: true,
    }));
    expect(navigateMessages(posted)).toHaveLength(0);

    plain.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      button: 1,
    }));
    expect(navigateMessages(posted)).toHaveLength(0);
  });

  it('ignores malformed and foreign presentation messages', () => {
    const { dom, posted, send } = createHarness();
    const appliedCount = () =>
      posted.filter((m) => m?.type === DECK_PRESENTATION_APPLIED_MESSAGE_TYPE).length;

    send({
      type: DECK_PRESENTATION_SET_MESSAGE_TYPE,
      protocolVersion: 99,
      ...IDENTITY,
      presenting: true,
      revision: 1,
    });
    send({
      type: DECK_PRESENTATION_SET_MESSAGE_TYPE,
      protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
      ...IDENTITY,
      presenting: 'yes',
      revision: 1,
    });
    send({ type: 'od:slide', action: 'next' });
    expect(appliedCount()).toBe(0);
    expect(chromeStyle(dom)).toBeNull();

    // A message forged by artifact content is not the host.
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: {
        type: DECK_PRESENTATION_SET_MESSAGE_TYPE,
        protocolVersion: DECK_PRESENTATION_PROTOCOL_VERSION,
        ...IDENTITY,
        presenting: true,
        revision: 1,
      },
      source: dom.window,
    }));
    expect(appliedCount()).toBe(0);
    expect(chromeStyle(dom)).toBeNull();
  });

  it('stays idempotent across repeated enter requests', () => {
    const { dom, setPresenting } = createHarness();
    setPresenting(true, 1);
    const second = setPresenting(true, 2);
    expect(second).toMatchObject({ revision: 2, presenting: true, chromeHidden: true });
    expect(dom.window.document.querySelectorAll('style[data-od-deck-chrome-hidden]')).toHaveLength(1);
  });
});
