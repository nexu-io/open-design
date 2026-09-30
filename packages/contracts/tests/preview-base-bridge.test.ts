import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { buildPreviewBaseHrefBridge } from '../src/runtime/preview-observability.js';

interface FakeElement {
  scrolled: Array<Record<string, unknown>>;
  scrollIntoView(options: Record<string, unknown>): void;
}

interface FakeClickEvent {
  defaultPrevented: boolean;
}

/**
 * The bridge ships as a script string injected into previewed artifacts, so
 * the behavior under test only exists once that string runs against a DOM.
 * Same approach as `apps/daemon/tests/frame-runtime.test.ts`: execute it in a
 * sandbox whose document exposes exactly the surface the script touches.
 */
function runBridge(options: { withContainmentBase: boolean; targets?: readonly string[] }) {
  const elements: Record<string, FakeElement> = {};
  for (const id of options.targets ?? []) {
    const scrolled: Array<Record<string, unknown>> = [];
    elements[id] = {
      scrolled,
      scrollIntoView(received: Record<string, unknown>) {
        scrolled.push(received);
      },
    };
  }
  // One ordered list per target, because registration order is exactly what
  // decides whether the bridge or the artifact sees a click first.
  const windowClickHandlers: Array<(event: unknown) => void> = [];
  const documentClickHandlers: Array<(event: unknown) => void> = [];
  const domReadyHandlers: Array<() => void> = [];
  const pendingTasks: Array<() => void> = [];
  const scrollToCalls: Array<readonly [number, number]> = [];

  const document = {
    baseURI: 'http://127.0.0.1:8796/api/projects/p1/preview/scope-1/',
    // The preview injects this bridge while the document is still parsing.
    readyState: 'loading',
    documentElement: { scrollIntoView() {} },
    addEventListener(type: string, handler: (event: unknown) => void) {
      if (type === 'click') documentClickHandlers.push(handler);
      if (type === 'DOMContentLoaded') domReadyHandlers.push(handler as () => void);
    },
    querySelector(selector: string) {
      if (selector !== 'base[data-od-project-preview-base]') return null;
      return options.withContainmentBase ? { setAttribute() {} } : null;
    },
    getElementById(id: string) {
      return elements[id] ?? null;
    },
    getElementsByName() {
      return [];
    },
  };

  const sandbox = {
    document,
    URL,
    setTimeout(callback: () => void) {
      pendingTasks.push(callback);
      return 0;
    },
    window: {
      document,
      parent: { postMessage() {} },
      addEventListener(type: string, handler: (event: unknown) => void) {
        if (type === 'click') windowClickHandlers.push(handler);
      },
      scrollTo(left: number, top: number) {
        scrollToCalls.push([left, top]);
      },
    },
  };

  const script = buildPreviewBaseHrefBridge({
    href: '/api/projects/p1/preview/scope-1/',
    expiresAt: 1_700_000_000_000,
  })
    .replace(/^<script data-od-preview-base-bridge>/, '')
    .replace(/<\/script>$/, '');
  runInNewContext(script, sandbox);
  // Nothing is listening yet: the fallback must not outrank scripts the page
  // has not even parsed.
  expect(windowClickHandlers).toHaveLength(0);

  const finishLoading = () => {
    const before = windowClickHandlers.length;
    for (const handler of domReadyHandlers) handler();
    const tasks = pendingTasks.splice(0, pendingTasks.length);
    for (const task of tasks) task();
    // The fallback installs exactly once, behind whatever the page registered.
    expect(windowClickHandlers).toHaveLength(before + 1);
  };

  const click = (
    link: { href: string; target?: string; download?: boolean },
    overrides: Record<string, unknown> = {},
  ): FakeClickEvent => {
    const node = {
      getAttribute(name: string) {
        if (name === 'href') return link.href;
        if (name === 'target') return link.target ?? null;
        return null;
      },
      hasAttribute(name: string) {
        return name === 'download' && link.download === true;
      },
      closest(selector: string) {
        return selector === 'a[href]' ? node : null;
      },
    };
    const event = {
      target: node,
      button: 0,
      defaultPrevented: false,
      preventDefault() {
        event.defaultPrevented = true;
      },
      ...overrides,
    };
    // Real dispatch order: document listeners while the event bubbles, then
    // window listeners in the order they were registered.
    for (const handler of documentClickHandlers) handler(event);
    for (const handler of windowClickHandlers) handler(event);
    return event;
  };

  return {
    click,
    elements,
    scrollToCalls,
    finishLoading,
    registerArtifactDocumentHandler: (handler: (event: unknown) => void) => {
      documentClickHandlers.push(handler);
    },
    registerArtifactWindowHandler: (handler: (event: unknown) => void) => {
      windowClickHandlers.push(handler);
    },
  };
}

describe('preview base href bridge', () => {
  it('scrolls an in-page anchor instead of leaving the previewed document', () => {
    const bridge = runBridge({ withContainmentBase: true, targets: ['proposal-02'] });
    bridge.finishLoading();

    const event = bridge.click({ href: '#proposal-02' });

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([
      { behavior: 'auto', block: 'start' },
    ]);
  });

  it('claims a fragment that resolves to nothing rather than letting it unload the preview', () => {
    const bridge = runBridge({ withContainmentBase: true });
    bridge.finishLoading();

    const event = bridge.click({ href: '#missing-section' });

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.scrollToCalls).toEqual([]);
  });

  it('sends a bare hash to the top of the document', () => {
    const bridge = runBridge({ withContainmentBase: true });
    bridge.finishLoading();

    const event = bridge.click({ href: '#' });

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.scrollToCalls).toEqual([[0, 0]]);
  });

  it('leaves fragment links alone when no containment base governs the document', () => {
    const bridge = runBridge({ withContainmentBase: false, targets: ['proposal-02'] });
    bridge.finishLoading();

    const event = bridge.click({ href: '#proposal-02' });

    expect(event.defaultPrevented).toBe(false);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([]);
  });

  it('keeps file links, new-tab links, and downloads on their normal path', () => {
    const bridge = runBridge({ withContainmentBase: true, targets: ['proposal-02'] });
    bridge.finishLoading();

    expect(bridge.click({ href: 'gallery.html' }).defaultPrevented).toBe(false);
    expect(bridge.click({ href: '#proposal-02', target: '_blank' }).defaultPrevented).toBe(false);
    expect(bridge.click({ href: '#proposal-02', download: true }).defaultPrevented).toBe(false);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([]);
  });

  it('ignores modified and non-primary clicks so open-in-new-tab still works', () => {
    const bridge = runBridge({ withContainmentBase: true, targets: ['proposal-02'] });
    bridge.finishLoading();

    expect(bridge.click({ href: '#proposal-02' }, { metaKey: true }).defaultPrevented).toBe(false);
    expect(bridge.click({ href: '#proposal-02' }, { button: 1 }).defaultPrevented).toBe(false);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([]);
  });

  it('yields to an artifact that claims a fragment click on the document', () => {
    const bridge = runBridge({ withContainmentBase: true, targets: ['proposal-02'] });
    bridge.finishLoading();
    let artifactHandled = 0;
    bridge.registerArtifactDocumentHandler((event) => {
      artifactHandled += 1;
      (event as { preventDefault(): void }).preventDefault();
    });

    const event = bridge.click({ href: '#proposal-02' });

    expect(artifactHandled).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([]);
    expect(bridge.scrollToCalls).toEqual([]);
  });

  it('yields to an artifact that delegates fragment clicks on window', () => {
    const bridge = runBridge({ withContainmentBase: true, targets: ['proposal-02'] });
    // An authored script parsed after the bridge: on one target, listeners run
    // in registration order, so this only works because the bridge defers.
    let artifactHandled = 0;
    bridge.registerArtifactWindowHandler((event) => {
      artifactHandled += 1;
      (event as { preventDefault(): void }).preventDefault();
    });
    bridge.finishLoading();

    const event = bridge.click({ href: '#proposal-02' });

    expect(artifactHandled).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([]);
    expect(bridge.scrollToCalls).toEqual([]);
  });

  it('treats an uppercase _SELF target as same-context navigation', () => {
    const bridge = runBridge({ withContainmentBase: true, targets: ['proposal-02'] });
    bridge.finishLoading();

    const event = bridge.click({ href: '#proposal-02', target: '_SELF' });

    expect(event.defaultPrevented).toBe(true);
    expect(bridge.elements['proposal-02']?.scrolled).toEqual([
      { behavior: 'auto', block: 'start' },
    ]);
  });
});
