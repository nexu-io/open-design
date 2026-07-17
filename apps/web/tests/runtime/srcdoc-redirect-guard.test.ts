// Redirect-loop guard end-to-end verification for nexu-io/open-design#710.
//
// A generated (or hand-edited) artifact can carry a `<meta http-equiv="refresh">`
// that reloads the same document — or a cycle of refreshes — which loops the
// preview iframe forever and freezes the design workspace. buildSrcdoc always
// injects `injectPreviewRedirectGuard`; this file proves the injected script
// actually breaks the loop by:
//
//   1. asserting buildSrcdoc emits the guard, before the author's content, and
//   2. running the REAL injected script (not a re-implementation) through a VM
//      that models a sandboxed iframe reloading itself — `window.name` persists
//      across "loads" exactly as it does for a browsing context navigating
//      itself — and checking the hop budget, the window reset, the immediate
//      self-refresh kill, the chain-break on a clean document, and the
//      `od:redirect-loop-blocked` message the host listens for.

import { describe, expect, it } from 'vitest';
import * as vm from 'node:vm';
import {
  buildSrcdoc,
  nextRedirectGuardState,
  PREVIEW_REDIRECT_GUARD_MAX_HOPS,
  PREVIEW_REDIRECT_GUARD_WINDOW_MS,
  PREVIEW_REDIRECT_LOOP_MESSAGE,
} from '../../src/runtime/srcdoc';

const GUARD_MARKER = 'data-od-preview-redirect-guard';

function extractGuardBody(doc: string): string {
  const match = doc.match(
    new RegExp(`<script ${GUARD_MARKER}>([\\s\\S]*?)<\\/script>`),
  );
  if (!match) throw new Error('redirect guard script not found in srcDoc');
  return match[1] ?? '';
}

// A fake <meta> node the guard can read + remove.
function makeMeta(content: string, httpEquiv = 'refresh') {
  const meta = {
    _removed: false,
    getAttribute(name: string): string | null {
      if (name === 'http-equiv') return httpEquiv;
      if (name === 'content') return content;
      return null;
    },
    parentNode: {
      removeChild(node: { _removed: boolean }) {
        node._removed = true;
      },
    },
  };
  return meta;
}

// A VM context that models a sandboxed preview iframe. `window` is its own
// globalThis, `window.name` persists across guard runs (the browsing-context
// store the guard relies on), and the parent's postMessage is captured.
function createIframeHarness(
  opts: { href?: string; baseURI?: string } = {},
) {
  const href = opts.href ?? 'https://preview.local/index.html';
  const baseURI = opts.baseURI ?? href;
  const posted: Array<{ type?: string; hops?: number }> = [];
  const clock = { now: 1_000 };
  const ctx = vm.createContext({});
  vm.runInContext('this.window = this; this.globalThis = this;', ctx);
  const context = ctx as unknown as {
    window: { name: string; parent: unknown; stop: () => void };
    document: {
      readyState: string;
      baseURI: string;
      _metas: ReturnType<typeof makeMeta>[];
      getElementsByTagName(tag: string): unknown[];
      addEventListener(): void;
    };
    location: { href: string };
    Date: { now(): number };
    URL: typeof URL;
  };
  context.location = { href };
  context.document = {
    readyState: 'complete',
    baseURI,
    _metas: [],
    getElementsByTagName(tag: string) {
      return tag === 'meta' ? this._metas : [];
    },
    addEventListener() {},
  };
  context.URL = URL;
  context.Date = { now: () => clock.now };
  context.window.name = '';
  context.window.parent = { postMessage: (msg: { type?: string; hops?: number }) => posted.push(msg) };
  context.window.stop = () => {};
  return {
    ctx,
    posted,
    setClock(ms: number) {
      clock.now = ms;
    },
    load(metas: ReturnType<typeof makeMeta>[], guardBody: string) {
      context.document._metas = metas;
      vm.runInContext(guardBody, ctx);
    },
    windowName(): string {
      return context.window.name;
    },
  };
}

describe('buildSrcdoc injects the redirect-loop guard (#710)', () => {
  it('emits the guard for every previewed document', () => {
    expect(buildSrcdoc('<h1>hi</h1>')).toContain(GUARD_MARKER);
    expect(buildSrcdoc('<!doctype html><html><head></head><body>x</body></html>')).toContain(GUARD_MARKER);
  });

  it('installs the guard BEFORE the author content so its meta tags are already parsed when it evaluates', () => {
    const doc = buildSrcdoc(
      '<!doctype html><html><head><meta http-equiv="refresh" content="0"></head><body>x</body></html>',
    );
    const guardIdx = doc.indexOf(GUARD_MARKER);
    const authorMetaIdx = doc.indexOf('http-equiv="refresh"');
    expect(guardIdx).toBeGreaterThan(0);
    expect(authorMetaIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(authorMetaIdx);
  });
});

describe('injected redirect guard breaks meta-refresh loops (#710)', () => {
  const guardBody = extractGuardBody(buildSrcdoc('<h1>hi</h1>'));

  it('kills an immediate self-refresh on the very first load', () => {
    const h = createIframeHarness();
    const meta = makeMeta('0'); // reload this same document, no delay
    h.load([meta], guardBody);
    expect(meta._removed).toBe(true);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.type).toBe(PREVIEW_REDIRECT_LOOP_MESSAGE);
    // Once broken, the persisted counter is cleared so a later clean run starts fresh.
    expect(h.windowName()).toBe('');
  });

  it('kills an immediate same-artifact URL target while the iframe URL is about:srcdoc', () => {
    const h = createIframeHarness({
      href: 'about:srcdoc',
      baseURI: 'https://preview.local/index.html',
    });
    const meta = makeMeta('0; url=index.html');
    h.load([meta], guardBody);
    expect(meta._removed).toBe(true);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.type).toBe(PREVIEW_REDIRECT_LOOP_MESSAGE);
    expect(h.windowName()).toBe('');
  });

  it('blocks fast URL-target refreshes before a srcdoc iframe leaves the injected guard', () => {
    const h = createIframeHarness({
      href: 'about:srcdoc',
      baseURI: 'https://preview.local/a.html',
    });
    const meta = makeMeta('0; url=./b.html');
    h.load([meta], guardBody);
    expect(meta._removed).toBe(true);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.type).toBe(PREVIEW_REDIRECT_LOOP_MESSAGE);
    expect(h.windowName()).toBe('');
  });

  it('counts no-meta load-time script redirects before author code can keep reloading', () => {
    const scriptRedirectGuard = extractGuardBody(
      buildSrcdoc('<!doctype html><html><head><script>location.reload()</script></head><body>x</body></html>'),
    );
    const h = createIframeHarness({
      href: 'about:srcdoc',
      baseURI: 'https://preview.local/index.html',
    });
    for (let hop = 1; hop <= PREVIEW_REDIRECT_GUARD_MAX_HOPS; hop++) {
      h.setClock(1_000 + hop);
      h.load([], scriptRedirectGuard);
      expect(h.posted, `hop ${hop} must not report`).toHaveLength(0);
    }
    h.setClock(1_000 + PREVIEW_REDIRECT_GUARD_MAX_HOPS + 1);
    h.load([], scriptRedirectGuard);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.type).toBe(PREVIEW_REDIRECT_LOOP_MESSAGE);
    expect(h.posted[0]?.hops).toBe(PREVIEW_REDIRECT_GUARD_MAX_HOPS + 1);
    expect(h.windowName()).toBe('');
  });

  it('does not park legitimate click handlers or prose mentions on first render', () => {
    const clickHandlerGuard = extractGuardBody(
      buildSrcdoc('<!doctype html><html><body><button onclick="location.reload()">Refresh</button></body></html>'),
    );
    const proseGuard = extractGuardBody(
      buildSrcdoc('<!doctype html><html><body><p>Use location.reload() to refresh.</p></body></html>'),
    );
    const clickHarness = createIframeHarness({
      href: 'about:srcdoc',
      baseURI: 'https://preview.local/index.html',
    });
    clickHarness.load([], clickHandlerGuard);
    expect(clickHarness.posted).toHaveLength(0);

    const proseHarness = createIframeHarness({
      href: 'about:srcdoc',
      baseURI: 'https://preview.local/index.html',
    });
    proseHarness.load([], proseGuard);
    expect(proseHarness.posted).toHaveLength(0);
  });

  it('resets no-meta script redirect candidates after the window for slow auto-refresh pages', () => {
    const slowRefreshGuard = extractGuardBody(
      buildSrcdoc('<!doctype html><html><head><script>setTimeout(() => location.reload(), 30000)</script></head><body>x</body></html>'),
    );
    const h = createIframeHarness({
      href: 'about:srcdoc',
      baseURI: 'https://preview.local/index.html',
    });
    for (let hop = 0; hop < PREVIEW_REDIRECT_GUARD_MAX_HOPS + 2; hop++) {
      h.setClock(1_000 + hop * (PREVIEW_REDIRECT_GUARD_WINDOW_MS + 500));
      h.load([], slowRefreshGuard);
    }
    expect(h.posted).toHaveLength(0);
  });

  it('allows a bounded non-self chain but trips once the hop budget is exceeded', () => {
    const h = createIframeHarness();
    // A refresh to a DIFFERENT url is a legitimate hop, not an instant self loop.
    for (let hop = 1; hop <= PREVIEW_REDIRECT_GUARD_MAX_HOPS; hop++) {
      const meta = makeMeta('1; url=./next.html');
      h.setClock(1_000 + hop); // all inside one window
      h.load([meta], guardBody);
      expect(meta._removed, `hop ${hop} must not be broken`).toBe(false);
      expect(h.posted, `hop ${hop} must not report`).toHaveLength(0);
    }
    // The hop past the budget is the loop — break it and tell the host.
    const tripping = makeMeta('1; url=./next.html');
    h.setClock(1_000 + PREVIEW_REDIRECT_GUARD_MAX_HOPS + 1);
    h.load([tripping], guardBody);
    expect(tripping._removed).toBe(true);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.type).toBe(PREVIEW_REDIRECT_LOOP_MESSAGE);
    expect(h.posted[0]?.hops).toBe(PREVIEW_REDIRECT_GUARD_MAX_HOPS + 1);
  });

  it('resets the hop count when a refresh lands after the window closes (timeout safeguard)', () => {
    const h = createIframeHarness();
    h.setClock(1_000);
    h.load([makeMeta('1; url=./next.html')], guardBody);
    const afterFirst = JSON.parse(h.windowName().replace('__odRedirectGuard=', ''));
    expect(afterFirst.hops).toBe(1);
    // Second refresh arrives well after the window — a slow auto-refresh, not a loop.
    h.setClock(1_000 + PREVIEW_REDIRECT_GUARD_WINDOW_MS + 500);
    h.load([makeMeta('1; url=./next.html')], guardBody);
    const afterSecond = JSON.parse(h.windowName().replace('__odRedirectGuard=', ''));
    expect(afterSecond.hops).toBe(1);
    expect(h.posted).toHaveLength(0);
  });

  it('breaks the accumulating chain when a document without a refresh loads', () => {
    const h = createIframeHarness();
    h.load([makeMeta('1; url=./next.html')], guardBody);
    expect(h.windowName()).not.toBe('');
    // A plain page (no meta refresh) means the chain ended; forget the count.
    h.load([], guardBody);
    expect(h.windowName()).toBe('');
    expect(h.posted).toHaveLength(0);
  });

  it('ignores non-refresh meta tags entirely', () => {
    const h = createIframeHarness();
    h.load([makeMeta('text/html', 'content-type')], guardBody);
    expect(h.windowName()).toBe('');
    expect(h.posted).toHaveLength(0);
  });
});

describe('nextRedirectGuardState hop accounting (#710)', () => {
  it('starts a fresh window on the first hop', () => {
    const { state, tripped } = nextRedirectGuardState(null, 5_000);
    expect(state).toEqual({ hops: 1, windowStart: 5_000 });
    expect(tripped).toBe(false);
  });

  it('accumulates hops inside the window', () => {
    const first = nextRedirectGuardState(null, 1_000);
    const second = nextRedirectGuardState(first.state, 1_050);
    expect(second.state).toEqual({ hops: 2, windowStart: 1_000 });
    expect(second.tripped).toBe(false);
  });

  it('resets once the window has elapsed', () => {
    const first = nextRedirectGuardState(null, 1_000, { windowMs: 1_000 });
    const later = nextRedirectGuardState(first.state, 3_000, { windowMs: 1_000 });
    expect(later.state).toEqual({ hops: 1, windowStart: 3_000 });
    expect(later.tripped).toBe(false);
  });

  it('trips only after the hop budget is exceeded', () => {
    let prev = nextRedirectGuardState(null, 0, { maxHops: 3 });
    expect(prev.tripped).toBe(false); // 1
    prev = nextRedirectGuardState(prev.state, 1, { maxHops: 3 });
    expect(prev.tripped).toBe(false); // 2
    prev = nextRedirectGuardState(prev.state, 2, { maxHops: 3 });
    expect(prev.tripped).toBe(false); // 3
    prev = nextRedirectGuardState(prev.state, 3, { maxHops: 3 });
    expect(prev.tripped).toBe(true); // 4 > 3
    expect(prev.state.hops).toBe(4);
  });
});
