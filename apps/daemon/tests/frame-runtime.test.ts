import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  URL_PREVIEW_SCROLL_BRIDGE,
  URL_PREVIEW_SELECTION_BRIDGE,
} from '../src/routes/project/index.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

const frameFiles = [
  'iphone-15-pro.html',
  'android-pixel.html',
  'ipad-pro.html',
  'macbook.html',
  'browser-chrome.html',
] as const;

function frameScriptFor(frameFile: string): string {
  const html = readFileSync(
    path.join(repoRoot, 'assets', 'frames', frameFile),
    'utf8',
  );
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  if (!script?.[1]) {
    throw new Error(`Missing runtime script in ${frameFile}`);
  }
  return script[1];
}

function resolveFrameScreenSrc({
  frameFile,
  screen,
  referrer = 'http://preview.local/api/projects/project-1/raw/index.html',
}: {
  frameFile: string;
  screen: string;
  referrer?: string;
}): string {
  const frameUrl = new URL(`http://preview.local/frames/${frameFile}`);
  frameUrl.searchParams.set('screen', screen);

  let iframeSrc = 'about:blank';
  const iframe = {};
  Object.defineProperty(iframe, 'src', {
    get() {
      return iframeSrc;
    },
    set(value: string) {
      iframeSrc = new URL(value, frameUrl.href).toString();
    },
  });

  const urlText = { textContent: '' };
  const context = {
    URL,
    URLSearchParams,
    location: {
      href: frameUrl.href,
      search: frameUrl.search,
    },
    document: {
      referrer,
      getElementById(id: string) {
        if (id === 'screen') return iframe;
        if (id === 'url-text') return urlText;
        return null;
      },
    },
  };

  vm.runInNewContext(frameScriptFor(frameFile), context, {
    filename: `assets/frames/${frameFile}`,
  });

  return iframeSrc;
}

// Read the already-evaluated bridge constant (not the raw .ts source text):
// the constant is a template literal, and TS/JS unescape `\\/` to `\/` when
// the literal is evaluated. Slicing the source file's raw text instead would
// skip that unescaping and silently pass scripts a browser would reject with
// a SyntaxError (#7008) — this must match what actually reaches the browser.
function urlPreviewBridgeScript(name: 'URL_PREVIEW_SCROLL_BRIDGE' | 'URL_PREVIEW_SELECTION_BRIDGE'): string {
  const evaluated = name === 'URL_PREVIEW_SCROLL_BRIDGE'
    ? URL_PREVIEW_SCROLL_BRIDGE
    : URL_PREVIEW_SELECTION_BRIDGE;
  const scriptStart = evaluated.indexOf('\n') + 1;
  const scriptEnd = evaluated.lastIndexOf('</script>');
  if (scriptStart <= 0 || scriptEnd < 0) throw new Error(`Missing script body for ${name}`);
  return evaluated.slice(scriptStart, scriptEnd);
}

describe('shared frame runtime', () => {
  it.each(frameFiles)(
    'resolves project-relative screen paths against the embedding artifact for %s',
    (frameFile) => {
      expect(resolveFrameScreenSrc({
        frameFile,
        screen: 'screens/tablet-edition.html',
      })).toBe('http://preview.local/api/projects/project-1/raw/screens/tablet-edition.html');
    },
  );

  it.each(frameFiles)(
    'keeps root-relative screen paths rooted at the preview origin for %s',
    (frameFile) => {
      expect(resolveFrameScreenSrc({
        frameFile,
        screen: '/api/projects/project-1/raw/screens/tablet-edition.html',
      })).toBe('http://preview.local/api/projects/project-1/raw/screens/tablet-edition.html');
    },
  );

  it.each(frameFiles)(
    'keeps absolute screen URLs unchanged for %s',
    (frameFile) => {
      expect(resolveFrameScreenSrc({
        frameFile,
        screen: 'https://cdn.example.test/screens/tablet-edition.html',
      })).toBe('https://cdn.example.test/screens/tablet-edition.html');
    },
  );
});

describe('URL preview nested-frame bridges', () => {
  it('resyncs a ready direct child and routes frame Inspect commands without a scroll-bridge ReferenceError', () => {
    const listeners: Array<(event: { data?: unknown; source?: unknown }) => void> = [];
    const received: unknown[] = [];
    let frameLoad = () => {};
    let resize = () => {};
    let frameY = 0;
    let frameScale = 1;
    let projectFrameMarked = false;
    const childWindow = { postMessage: (message: unknown) => received.push(message) };
    const frame = {
      contentWindow: childWindow,
      src: 'child.html',
      getAttribute(name: string) { return name === 'src' ? 'child.html' : null; },
      addEventListener(type: string, listener: () => void) { if (type === 'load') frameLoad = listener; },
      toggleAttribute(name: string, enabled: boolean) { if (name === 'data-od-project-frame') projectFrameMarked = enabled; },
      getBoundingClientRect() { return { x: 0, y: frameY, width: 100 * frameScale, height: 100 * frameScale }; },
      clientWidth: 100,
      clientHeight: 100,
    };
    const documentElement = {
      toggleAttribute() {},
      setAttribute() {},
      attributes: [],
    };
    const document = {
      baseURI: 'http://preview.local/api/projects/project-1/preview/scope-1/root.html',
      documentElement,
      body: { querySelectorAll: () => [], attributes: [] },
      head: { appendChild() {} },
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll(selector: string) {
        return selector === 'iframe' || (selector === 'iframe[data-od-project-frame]' && projectFrameMarked) ? [frame] : [];
      },
      querySelector() { return null; },
      createElement() { return { setAttribute() {}, textContent: '', isConnected: true }; },
      addEventListener() {},
    };
    const parentMessages: unknown[] = [];
    const window = {
      __odUrlScrollBridge: false,
      __odUrlSelectionBridge: false,
      location: { href: document.baseURI, search: '', hash: '' },
      parent: { postMessage: (message: unknown) => parentMessages.push(message) },
      addEventListener(type: string, listener: (event: { data?: unknown; source?: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
        if (type === 'resize') resize = () => listener({});
      },
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      setTimeout(callback: () => void) { callback(); return 1; },
      clearTimeout() {},
    };
    class MutationObserver {
      constructor(_callback: () => void) {}
      observe() {}
    }
    const context = { window, document, URL, MutationObserver, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };

    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SCROLL_BRIDGE'), context);
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SELECTION_BRIDGE'), context);

    const dispatch = (data: unknown, source: unknown = undefined) => {
      for (const listener of listeners) listener({ data, source });
    };
    const readyPing = parentMessages.find((message) =>
      (message as { type?: string }).type === 'od:url-selection-bridge-ready') as {
        documentToken: string; documentVersion: string;
      };
    expect(readyPing.documentToken).toEqual(expect.any(String));
    expect(readyPing.documentToken).not.toBe('');
    expect(readyPing.documentVersion).toBe('url:' + document.baseURI);
    dispatch({ type: 'od:comment-active-target', elementId: 'absent', selector: '#absent',
      validateForSave: true, requestId: 'root-missing' }, window.parent);
    expect(parentMessages).toContainEqual(expect.objectContaining({
      type: 'od:comment-location-missing', requestId: 'root-missing',
      documentToken: readyPing.documentToken, documentVersion: readyPing.documentVersion,
    }));
    dispatch({ type: 'od:comment-mode', enabled: true, mode: 'picker' });
    dispatch({ type: 'od:inspect-mode', enabled: true });
    received.length = 0;

    dispatch({
      type: 'od:url-selection-bridge-ready',
      href: 'http://preview.local/api/projects/project-1/preview/scope-1/child.html',
    }, childWindow);
    expect(received).toEqual([
      { type: 'od:comment-mode', enabled: true, mode: 'picker' },
      { type: 'od:inspect-mode', enabled: true },
    ]);
    received.length = 0;
    frameLoad();
    expect(projectFrameMarked).toBe(false);
    expect(received).toEqual([{ type: 'od:url-selection-bridge-probe' }]);
    dispatch({ type: 'od:url-selection-bridge-ready', href: 'http://preview.local/api/projects/project-1/preview/scope-1/child.html' }, childWindow);
    expect(projectFrameMarked).toBe(true);
    parentMessages.length = 0;
    dispatch({ type: 'od:comment-targets', targets: [{ elementId: 'hero', selector: '[data-od-id="hero"]', domSelector: 'body > main > h2', position: { x: 10, y: 20, width: 30, height: 40 } }] }, childWindow);
    expect(parentMessages).toContainEqual({ type: 'od:comment-targets', targets: [expect.objectContaining({
      elementId: `frame:${encodeURIComponent(JSON.stringify(['child.html', 'hero']))}`,
      domSelector: 'body > main > h2', position: { x: 10, y: 20, width: 30, height: 40 },
    })] });

    frameY = 100;
    parentMessages.length = 0;
    resize();
    expect(parentMessages).toContainEqual({ type: 'od:comment-targets', targets: [expect.objectContaining({
      domSelector: 'body > main > h2', position: { x: 10, y: 120, width: 30, height: 40 },
    })] });

    frameScale = 0.5;
    for (const type of ['od:comment-target', 'od:comment-hover', 'od:comment-active-target-update']) {
      parentMessages.length = 0;
      dispatch({
        type, elementId: 'hero', selector: '[data-od-id="hero"]', domSelector: 'body > main > h2',
        position: { x: 10, y: 20, width: 30, height: 40 },
        hoverPoint: { x: 4, y: 5 },
      }, childWindow);
      expect(parentMessages).toContainEqual(expect.objectContaining({
        type, domSelector: 'body > main > h2', position: { x: 5, y: 110, width: 15, height: 20 },
        hoverPoint: { x: 2, y: 103 },
      }));
    }


    // The save/locate handshake must survive the relay, but never a child reload.
    const childHref = 'http://preview.local/api/projects/project-1/preview/scope-1/child.html';
    const readyDocument = (documentToken = 'child-document-1') => dispatch({
      type: 'od:url-selection-bridge-ready', href: childHref,
      documentVersion: 'url:' + childHref, documentToken,
    }, childWindow);
    const qualifiedHero = 'frame:' + encodeURIComponent(JSON.stringify(['child.html', 'hero']));
    for (const kind of ['save', 'locate']) {
      readyDocument();
      const request = (requestId: string) => dispatch({ type: 'od:comment-active-target',
        elementId: qualifiedHero, selector: '#hero', requestId,
        ...(kind === 'save' ? { validateForSave: true } : { locate: true }),
      }, window.parent);
      const response = (requestId: string, extra = {}) => dispatch({
        type: 'od:comment-active-target-update', elementId: 'hero', selector: '#hero',
        requestedSelector: '#hero', documentVersion: 'url:' + childHref,
        documentToken: 'child-document-1', requestId,
        position: { x: 10, y: 20, width: 30, height: 40 }, ...extra,
      }, childWindow);
      received.length = 0; parentMessages.length = 0;
      request('success');
      expect(received).toContainEqual(expect.objectContaining({
        requestId: 'success', ...(kind === 'save' ? { validateForSave: true } : { locate: true }),
      }));
      response('success');
      expect(parentMessages).toContainEqual(expect.objectContaining({
        requestId: 'success', elementId: qualifiedHero, requestedSelector: '#hero',
        documentVersion: 'url:' + document.baseURI,
        position: { x: 5, y: 110, width: 15, height: 20 },
      }));
      parentMessages.length = 0;
      response('success');
      expect(parentMessages).toEqual([]);
      request('missing');
      response('missing', { type: 'od:comment-location-missing' });
      expect(parentMessages).toContainEqual(expect.objectContaining({
        requestId: 'missing', type: 'od:comment-location-missing', documentVersion: 'url:' + document.baseURI,
      }));
      parentMessages.length = 0;
      request('reload');
      frameLoad();
      readyDocument('child-document-2');
      response('reload');
      expect(parentMessages).not.toContainEqual(expect.objectContaining({ requestId: 'reload' }));
      readyDocument();
      request('wrong-version');
      response('wrong-version', { documentVersion: 'url:wrong' });
      expect(parentMessages).not.toContainEqual(expect.objectContaining({ requestId: 'wrong-version' }));
      request('wrong-token');
      response('wrong-token', { documentToken: 'departed-document' });
      expect(parentMessages).not.toContainEqual(expect.objectContaining({ requestId: 'wrong-token' }));
      request('invalid-position');
      response('invalid-position', { position: { x: '10', y: 20, width: 30, height: 40 } });
      expect(parentMessages).not.toContainEqual(expect.objectContaining({ requestId: 'invalid-position' }));
      if (kind === 'save') {
        request('wrong-selector');
        response('wrong-selector', { requestedSelector: '#other' });
        expect(parentMessages).not.toContainEqual(expect.objectContaining({ requestId: 'wrong-selector' }));
      }
    }

    received.length = 0;
    dispatch({
      type: 'od:inspect-set',
      elementId: `frame:${encodeURIComponent(JSON.stringify(['child.html', 'hero']))}`,
      prop: 'color',
      value: 'red',
    });
    expect(received).toEqual([
      { type: 'od:inspect-set', elementId: 'hero', prop: 'color', value: 'red' },
    ]);

    // #7008 review: od:comment-leave carries no target identity — it must
    // still reach the host (to dismiss the hover card) even though it has
    // none of the position/elementId/selector fields the target/hover
    // relay branch requires.
    parentMessages.length = 0;
    dispatch({ type: 'od:comment-leave' }, childWindow);
    expect(parentMessages).toEqual([{ type: 'od:comment-leave' }]);

    parentMessages.length = 0;
    dispatch({ type: 'od:comment-leave' }, { unrelated: true });
    expect(parentMessages).toEqual([]);

    // #7008 review: od:inspect-replay's map can contain frame-qualified
    // entries (edits made inside a project child). The root has no
    // matching DOM node for those, so they must be forwarded to the
    // matching child rather than silently dropped by local selector
    // validation. The child is already ready at this point in the test.
    received.length = 0;
    dispatch({
      type: 'od:inspect-replay',
      overrides: {
        [`frame:${encodeURIComponent(JSON.stringify(['child.html', 'hero']))}`]: {
          selector: '[data-od-id="hero"]',
          props: { color: 'blue' },
        },
      },
    });
    expect(received).toEqual([
      { type: 'od:inspect-replay', overrides: { hero: { selector: '[data-od-id="hero"]', props: { color: 'blue' } } } },
    ]);
  });

  it('queues a frame-qualified inspect replay until the child reports ready', () => {
    const listeners: Array<(event: { data?: unknown; source?: unknown }) => void> = [];
    const received: unknown[] = [];
    // A real <iframe>'s contentWindow exists as soon as the element is in
    // the DOM, well before the child document's own script has run far
    // enough to register its message listener -- a postMessage sent in
    // that window lands on no listener and is simply lost, not queued.
    // Model that gap explicitly instead of capturing unconditionally,
    // otherwise this test cannot tell "relayed before ready" (would be
    // lost in a real browser) apart from "relayed after ready" (the
    // od:url-selection-bridge-ready path this test exists to cover).
    let childListening = false;
    const childWindow = { postMessage: (message: unknown) => { if (childListening) received.push(message); } };
    const frame = {
      contentWindow: childWindow,
      src: 'child.html',
      getAttribute(name: string) { return name === 'src' ? 'child.html' : null; },
      addEventListener() {},
      toggleAttribute() {},
      getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; },
      clientWidth: 100,
      clientHeight: 100,
    };
    const documentElement = { toggleAttribute() {}, setAttribute() {}, attributes: [] };
    const document = {
      baseURI: 'http://preview.local/api/projects/project-1/preview/scope-1/root.html',
      documentElement,
      body: { querySelectorAll: () => [], attributes: [] },
      head: { appendChild() {} },
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll(selector: string) { return selector === 'iframe' ? [frame] : []; },
      querySelector() { return null; },
      createElement() { return { setAttribute() {}, textContent: '', isConnected: true }; },
      addEventListener() {},
    };
    const window = {
      __odUrlScrollBridge: false,
      __odUrlSelectionBridge: false,
      location: { href: document.baseURI, search: '', hash: '' },
      parent: { postMessage: () => {} },
      addEventListener(type: string, listener: (event: { data?: unknown; source?: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
      },
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      setTimeout(callback: () => void) { callback(); return 1; },
      clearTimeout() {},
    };
    class MutationObserver { constructor(_callback: () => void) {} observe() {} }
    const context = { window, document, URL, MutationObserver, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SCROLL_BRIDGE'), context);
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SELECTION_BRIDGE'), context);
    const dispatch = (data: unknown, source: unknown = undefined) => {
      for (const listener of listeners) listener({ data, source });
    };

    // Replay arrives BEFORE the child has announced readiness (e.g. right
    // after a reload). It must not be silently dropped.
    dispatch({
      type: 'od:inspect-replay',
      overrides: {
        [`frame:${encodeURIComponent(JSON.stringify(['child.html', 'hero']))}`]: {
          selector: '[data-od-id="hero"]',
          props: { 'font-size': '18px' },
        },
      },
    });
    expect(received).toEqual([]);

    childListening = true;
    dispatch({
      type: 'od:url-selection-bridge-ready',
      href: 'http://preview.local/api/projects/project-1/preview/scope-1/child.html',
    }, childWindow);
    expect(received).toContainEqual(
      { type: 'od:inspect-replay', overrides: { hero: { selector: '[data-od-id="hero"]', props: { 'font-size': '18px' } } } },
    );
  });

  it('accepts a child-ready ping that self-navigated to a different in-scope path, caching the live path (#7008 review: frame.src staleness)', () => {
    // frame.src still reflects the iframe's ORIGINAL attribute ("child.html")
    // because a child navigating itself (an internal link, a
    // window.location assignment) never updates the parent's reflected src.
    // The ready ping's self-reported href is ground truth and must be
    // accepted even though it disagrees with frame.src.
    const listeners: Array<(event: { data?: unknown; source?: unknown }) => void> = [];
    const received: unknown[] = [];
    const childWindow = { postMessage: (message: unknown) => received.push(message) };
    const frameAttrs: Record<string, string> = { src: 'child.html' };
    const frame = {
      contentWindow: childWindow,
      get src() { return frameAttrs.src; },
      getAttribute(name: string) { return Object.prototype.hasOwnProperty.call(frameAttrs, name) ? frameAttrs[name] : null; },
      setAttribute(name: string, value: string) { frameAttrs[name] = value; },
      addEventListener() {},
      toggleAttribute() {},
      getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; },
      clientWidth: 100,
      clientHeight: 100,
    };
    const documentElement = { toggleAttribute() {}, setAttribute() {}, attributes: [] };
    const document = {
      baseURI: 'http://preview.local/api/projects/project-1/preview/scope-1/root.html',
      documentElement,
      body: { querySelectorAll: () => [], attributes: [] },
      head: { appendChild() {} },
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll(selector: string) { return selector === 'iframe' ? [frame] : []; },
      querySelector() { return null; },
      createElement() { return { setAttribute() {}, textContent: '', isConnected: true }; },
      addEventListener() {},
    };
    const window = {
      __odUrlScrollBridge: false,
      __odUrlSelectionBridge: false,
      location: { href: document.baseURI, search: '', hash: '' },
      parent: { postMessage: () => {} },
      addEventListener(type: string, listener: (event: { data?: unknown; source?: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
      },
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      setTimeout(callback: () => void) { callback(); return 1; },
      clearTimeout() {},
    };
    class MutationObserver { constructor(_callback: () => void) {} observe() {} }
    const context = { window, document, URL, MutationObserver, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SCROLL_BRIDGE'), context);
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SELECTION_BRIDGE'), context);
    const dispatch = (data: unknown, source: unknown = undefined) => {
      for (const listener of listeners) listener({ data, source });
    };
    dispatch({ type: 'od:comment-mode', enabled: true, mode: 'picker' });
    dispatch({ type: 'od:inspect-mode', enabled: true });
    received.length = 0;

    dispatch({
      type: 'od:url-selection-bridge-ready',
      href: 'http://preview.local/api/projects/project-1/preview/scope-1/slide-2.html',
    }, childWindow);

    expect(received).toEqual([
      { type: 'od:comment-mode', enabled: true, mode: 'picker' },
      { type: 'od:inspect-mode', enabled: true },
    ]);
    received.length = 0;
    dispatch({
      type: 'od:inspect-set',
      elementId: `frame:${encodeURIComponent(JSON.stringify(['slide-2.html', 'hero']))}`,
      prop: 'color',
      value: 'red',
    });
    expect(received).toEqual([{ type: 'od:inspect-set', elementId: 'hero', prop: 'color', value: 'red' }]);

    // No MutationObserver callback is needed for correctness: comparing the
    // cached src snapshot makes this parent mutation invalidate immediately.
    frameAttrs.src = 'slide-3.html';
    received.length = 0;
    dispatch({
      type: 'od:inspect-set',
      elementId: `frame:${encodeURIComponent(JSON.stringify(['slide-2.html', 'hero']))}`,
      prop: 'color',
      value: 'blue',
    });
    expect(received).toEqual([]);
    dispatch({
      type: 'od:inspect-set',
      elementId: `frame:${encodeURIComponent(JSON.stringify(['slide-3.html', 'hero']))}`,
      prop: 'color',
      value: 'green',
    });
    expect(received).toEqual([{ type: 'od:inspect-set', elementId: 'hero', prop: 'color', value: 'green' }]);
  });

  it('rejects a forged target from a departed document reusing the frame\'s stale declared identity (#7296 review R9-2)', () => {
    const listeners: Array<(event: { data?: unknown; source?: unknown }) => void> = [];
    const loadListeners: Array<() => void> = [];
    const childWindow = { postMessage: () => {} };
    const frame = {
      contentWindow: childWindow,
      src: 'child.html',
      getAttribute(name: string) { return name === 'src' ? 'child.html' : null; },
      addEventListener(type: string, listener: () => void) { if (type === 'load') loadListeners.push(listener); },
      toggleAttribute() {},
      getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; },
      clientWidth: 100,
      clientHeight: 100,
    };
    const documentElement = { toggleAttribute() {}, setAttribute() {}, attributes: [] };
    const document = {
      baseURI: 'http://preview.local/api/projects/project-1/preview/scope-1/root.html',
      documentElement,
      body: { querySelectorAll: () => [], attributes: [] },
      head: { appendChild() {} },
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll(selector: string) { return selector === 'iframe' ? [frame] : []; },
      querySelector() { return null; },
      createElement() { return { setAttribute() {}, textContent: '', isConnected: true }; },
      addEventListener() {},
    };
    const parentMessages: unknown[] = [];
    const window = {
      __odUrlScrollBridge: false,
      __odUrlSelectionBridge: false,
      location: { href: document.baseURI, search: '', hash: '' },
      parent: { postMessage: (message: unknown) => parentMessages.push(message) },
      addEventListener(type: string, listener: (event: { data?: unknown; source?: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
      },
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      setTimeout(callback: () => void) { callback(); return 1; },
      clearTimeout() {},
    };
    class MutationObserver { constructor(_callback: () => void) {} observe() {} }
    const context = { window, document, URL, MutationObserver, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SCROLL_BRIDGE'), context);
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SELECTION_BRIDGE'), context);
    const dispatch = (data: unknown, source: unknown = undefined) => {
      for (const listener of listeners) listener({ data, source });
    };

    // relayProjectFrameSelection only runs while comment or inspect mode is
    // active -- unlike srcdoc.ts's equivalent test (which starts a mode
    // active via buildSrcdoc's commentBridge option), this bridge constant
    // is not parameterized per test and starts both modes off by default.
    dispatch({ type: 'od:comment-mode', enabled: true, mode: 'picker' });

    // The declared child confirms itself normally first.
    dispatch({
      type: 'od:url-selection-bridge-ready',
      href: 'http://preview.local/api/projects/project-1/preview/scope-1/child.html',
    }, childWindow);

    // It then leaves for a destination with no bridge/ready ping. The
    // parent's src attribute is untouched by that internal navigation, but
    // the frame's native load event still fires. The same WindowProxy
    // (childWindow) now belongs to that departed document, which forges a
    // shaped od:comment-target message claiming the frame's old,
    // still-declared "child.html" identity.
    for (const listener of loadListeners) listener();
    parentMessages.length = 0;
    dispatch({
      type: 'od:comment-target', elementId: 'forged', selector: '[data-od-id="forged"]',
      label: 'forged', text: 'forged', position: { x: 1, y: 1, width: 20, height: 20 },
    }, childWindow);

    expect(parentMessages).toEqual([]);
  });

  it('rejects a child-ready ping whose href is outside the current preview scope (#7008 review: frame.src staleness)', () => {
    const listeners: Array<(event: { data?: unknown; source?: unknown }) => void> = [];
    const received: unknown[] = [];
    const childWindow = { postMessage: (message: unknown) => received.push(message) };
    const frameAttrs: Record<string, string> = { src: 'child.html' };
    const frame = {
      contentWindow: childWindow,
      get src() { return frameAttrs.src; },
      getAttribute(name: string) { return Object.prototype.hasOwnProperty.call(frameAttrs, name) ? frameAttrs[name] : null; },
      setAttribute(name: string, value: string) { frameAttrs[name] = value; },
      addEventListener() {},
      toggleAttribute() {},
      getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; },
      clientWidth: 100,
      clientHeight: 100,
    };
    const documentElement = { toggleAttribute() {}, setAttribute() {}, attributes: [] };
    const document = {
      baseURI: 'http://preview.local/api/projects/project-1/preview/scope-1/root.html',
      documentElement,
      body: { querySelectorAll: () => [], attributes: [] },
      head: { appendChild() {} },
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll(selector: string) { return selector === 'iframe' ? [frame] : []; },
      querySelector() { return null; },
      createElement() { return { setAttribute() {}, textContent: '', isConnected: true }; },
      addEventListener() {},
    };
    const window = {
      __odUrlScrollBridge: false,
      __odUrlSelectionBridge: false,
      location: { href: document.baseURI, search: '', hash: '' },
      parent: { postMessage: () => {} },
      addEventListener(type: string, listener: (event: { data?: unknown; source?: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
      },
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      setTimeout(callback: () => void) { callback(); return 1; },
      clearTimeout() {},
    };
    class MutationObserver { constructor(_callback: () => void) {} observe() {} }
    const context = { window, document, URL, MutationObserver, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SCROLL_BRIDGE'), context);
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SELECTION_BRIDGE'), context);
    const dispatch = (data: unknown, source: unknown = undefined) => {
      for (const listener of listeners) listener({ data, source });
    };
    dispatch({ type: 'od:comment-mode', enabled: true, mode: 'picker' });
    dispatch({ type: 'od:inspect-mode', enabled: true });
    received.length = 0;

    dispatch({
      type: 'od:url-selection-bridge-ready',
      // A different scope segment (scope-2 vs this bridge's scope-1) is
      // outside the prefix projectFramePathFromHref requires.
      href: 'http://preview.local/api/projects/project-1/preview/scope-2/child.html',
    }, childWindow);

    expect(received).toEqual([]);
  });

  it('hydrates persisted inspect overrides on boot instead of starting empty (#7008 review: nettee, non-blocking)', () => {
    // Unlike the srcDoc bridge's hydrateOverridesFromDom(), this URL-load
    // bridge previously initialized inspectOverrides empty even when the
    // served document already had a persisted <style
    // data-od-inspect-overrides> block: rebuildInspectStyle() would then
    // replace that element's full text with only the in-memory map on the
    // first edit, dropping every other persisted rule from the live
    // preview.
    const styleEl = {
      textContent: '[data-od-id="title"] { color: #111111 !important; font-weight: 700 !important }',
      isConnected: true,
      setAttribute() {},
    };
    const listeners: Array<(event: { data?: unknown; source?: unknown }) => void> = [];
    const documentElement = { toggleAttribute() {}, setAttribute() {}, attributes: [] };
    const document = {
      baseURI: 'http://preview.local/api/projects/project-1/preview/scope-1/root.html',
      documentElement,
      body: { querySelectorAll: () => [], attributes: [] },
      head: { appendChild() {} },
      scrollingElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll(selector: string) { return selector === 'iframe' ? [] : []; },
      querySelector(selector: string) {
        if (selector === 'style[data-od-inspect-overrides]') return styleEl;
        // inspectSelectorFor re-derives the selector from elementId and
        // confirms the target actually exists in the live DOM before
        // trusting it -- this mock has a stand-in "title" element for that.
        if (selector === '[data-od-id="title"]') return { tagName: 'H1' };
        return null;
      },
      createElement() { return { setAttribute() {}, textContent: '', isConnected: true }; },
      addEventListener() {},
    };
    const window = {
      __odUrlScrollBridge: false,
      __odUrlSelectionBridge: false,
      location: { href: document.baseURI, search: '', hash: '' },
      parent: { postMessage: () => {} },
      addEventListener(type: string, listener: (event: { data?: unknown; source?: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
      },
      requestAnimationFrame(callback: () => void) { callback(); return 1; },
      setTimeout(callback: () => void) { callback(); return 1; },
      clearTimeout() {},
    };
    class MutationObserver { constructor(_callback: () => void) {} observe() {} }
    const context = { window, document, URL, MutationObserver, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SCROLL_BRIDGE'), context);
    vm.runInNewContext(urlPreviewBridgeScript('URL_PREVIEW_SELECTION_BRIDGE'), context);
    const dispatch = (data: unknown) => { for (const listener of listeners) listener({ data }); };

    // Edit the SAME element with a different property. Without hydration,
    // inspectOverrides['title'] starts undefined and applyInspectOverride
    // would create a fresh entry with only { color }, so
    // rebuildInspectStyle() would wipe the persisted font-weight rule from
    // the live style element.
    dispatch({ type: 'od:inspect-set', elementId: 'title', selector: '[data-od-id="title"]', prop: 'color', value: '#222222' });
    expect(styleEl.textContent).toContain('color: #222222 !important');
    expect(styleEl.textContent).toContain('font-weight: 700 !important');
  });
});
