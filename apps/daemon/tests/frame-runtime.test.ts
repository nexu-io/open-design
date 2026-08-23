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
    const childWindow = { postMessage: (message: unknown) => received.push(message) };
    const frame = {
      contentWindow: childWindow,
      src: 'child.html',
      getAttribute(name: string) { return name === 'src' ? 'child.html' : null; },
      toggleAttribute() {},
      getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; },
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
  });
});
