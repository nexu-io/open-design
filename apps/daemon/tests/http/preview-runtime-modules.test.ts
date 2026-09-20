import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
  buildPreviewObservabilityBridge,
  parsePreviewObservabilityMessage,
} from '@open-design/contracts/runtime/preview-observability';
import { buildPreviewRuntimeBootstrap } from '../../src/http/preview-runtime-bootstrap.js';
import {
  buildInstalledScriptRuntimeModule,
  buildLazyScriptRuntimeModule,
  buildManualEditRuntimeModule,
  buildDeckRuntimeModule,
  buildPaletteRuntimeModule,
  buildScrollAndMeasurementRuntimeModule,
  buildSharedLazyScriptRuntimeModule,
  buildTweaksRuntimeModule,
} from '../../src/http/preview-runtime-modules.js';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: Record<string, unknown>) => any;
};

function createObservabilityRuntimeHarness(options: {
  bodyHtml?: string;
} = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${options.bodyHtml ?? ''}</body></html>`,
    { runScripts: 'outside-only', url: 'http://n-scope.localhost/index.html' },
  );
  const posted: unknown[] = [];
  const scheduled: Array<{
    callback: () => void;
    cancelled: boolean;
    delay: number;
    id: number;
  }> = [];
  const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
  context.parent = { postMessage: (message: unknown) => posted.push(message) };
  context.setTimeout = (callback: () => void, delay = 0) => {
    const id = scheduled.length + 1;
    scheduled.push({ callback, cancelled: false, delay: Number(delay) || 0, id });
    return id;
  };
  context.clearTimeout = (id: number) => {
    const timer = scheduled.find((candidate) => candidate.id === id);
    if (timer) timer.cancelled = true;
  };
  dom.window.Element.prototype.getBoundingClientRect = () => ({
    bottom: 300,
    height: 300,
    left: 0,
    right: 800,
    top: 0,
    width: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const source = buildPreviewRuntimeBootstrap({
    sessionId: 'session-1',
    documentVersion: 'version-1',
    availableCapabilities: ['observability'],
    modules: [buildInstalledScriptRuntimeModule(
      'observability',
      buildPreviewObservabilityBridge(),
      PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
    )],
  }).replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
  vm.runInContext(source, context);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  return {
    dom,
    posted,
    flushImmediateTimers() {
      for (let index = 0; index < scheduled.length; index += 1) {
        const timer = scheduled[index];
        if (timer && !timer.cancelled && timer.delay === 0) {
          timer.cancelled = true;
          timer.callback();
        }
      }
    },
  };
}

describe('preview runtime modules', () => {
  it('installs observability without emitting visual readiness signals', () => {
    const harness = createObservabilityRuntimeHarness({ bodyHtml: '<main>Rendered</main>' });
    const rendered = harness.dom.window.document.createElement('main');
    rendered.textContent = 'Rendered asynchronously';
    harness.dom.window.document.body.appendChild(rendered);
    harness.flushImmediateTimers();

    expect(harness.posted.map(parsePreviewObservabilityMessage).filter(Boolean)).toEqual([]);
    harness.dom.window.close();
  });

  it('builds the same Deck runtime from streamed source facts and installs the stage fallback early', () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body><deck-stage><section class="slide">One</section></deck-stage></body></html>',
      { runScripts: 'outside-only', url: 'http://n-scope.localhost/index.html' },
    );
    let hooks: { enable: () => void; disable: () => void } | null = null;
    const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
    context.parent = dom.window;
    context.register = (_capability: string, create: () => typeof hooks) => { hooks = create(); };
    const runtime = buildDeckRuntimeModule('', {
      hasDeckStageElement: true,
      isFrameworkDeck: true,
      artifactHasKeydownNavigation: true,
      hasInlineSlideMessageListener: true,
      hasInlineHashNavigation: true,
      inlineHashIndexPrefix: '#/',
    });

    expect(runtime.source).toContain('__odDeckStageFallbackInstalled');
    vm.runInContext(runtime.source, context);
    expect(dom.window.customElements.get('deck-stage')).toBeDefined();
    expect(hooks).not.toBeNull();
    dom.window.close();
  });

  it('keeps direct Deck page jumps atomic after URL-runtime negotiation', async () => {
    const slides = Array.from({ length: 5 }, (_, index) =>
      `<section class="slide${index === 0 ? ' active' : ''}" data-title="Slide ${index + 1}">${index + 1}</section>`,
    ).join('');
    const dom = new JSDOM(
      `<!doctype html><html><head><style>.slide{display:none}.slide.active{display:block}</style></head>`
        + `<body><main class="deck">${slides}</main></body></html>`,
      { runScripts: 'outside-only', url: 'http://n-scope.localhost/index.html' },
    );
    let hooks: { enable: () => void; disable: () => void } | null = null;
    const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
    context.parent = dom.window;
    context.register = (_capability: string, create: () => typeof hooks) => { hooks = create(); };
    vm.runInContext(buildDeckRuntimeModule(dom.serialize()).source, context);
    hooks!.enable();
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    const visibleHistory: number[] = [];
    const observer = new dom.window.MutationObserver(() => {
      const active = Array.from(dom.window.document.querySelectorAll('.slide'))
        .findIndex((slide: any) => slide.classList.contains('active'));
      if (active >= 0 && visibleHistory.at(-1) !== active) visibleHistory.push(active);
    });
    observer.observe(dom.window.document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 4 },
    }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const renderedSlides = Array.from(dom.window.document.querySelectorAll('.slide')) as any[];
    expect(renderedSlides.findIndex((slide) => slide.classList.contains('active'))).toBe(4);
    expect(visibleHistory.filter((index) => index > 0 && index < 4)).toEqual([]);
    observer.disconnect();
    dom.window.close();
  });

  it('applies and restores palette state without replacing the document', () => {
    const dom = new JSDOM(
      '<!doctype html><html><head><style>:root{--accent:rgb(220,40,40)}</style></head>'
        + '<body><div id="card" style="background-color:rgb(220,40,40)">Card</div></body></html>',
      { runScripts: 'outside-only', url: 'http://n-scope.localhost/index.html' },
    );
    let hooks: { enable: () => void; disable: () => void } | null = null;
    const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
    context.parent = dom.window;
    context.send = () => {};
    context.register = (_capability: string, create: () => typeof hooks) => { hooks = create(); };
    vm.runInContext(buildPaletteRuntimeModule().source, context);
    expect(hooks).not.toBeNull();
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    hooks!.enable();

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: dom.window,
      data: { type: 'od:palette', palette: 'electric' },
    }));
    const root = dom.window.document.documentElement;
    const card = dom.window.document.querySelector('#card');
    expect(root.style.getPropertyValue('--accent')).not.toBe('');
    expect(card.hasAttribute('data-od-palette-fix')).toBe(true);

    hooks!.disable();
    expect(root.style.getPropertyValue('--accent')).toBe('');
    expect(card.hasAttribute('data-od-palette-fix')).toBe(false);
    expect(card.style.backgroundColor).toBe('rgb(220, 40, 40)');
    dom.window.close();
  });

  it('prevents Tweaks panel flash and activates host control only after negotiation', async () => {
    const source = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['tweaks'],
      modules: [buildTweaksRuntimeModule()],
    }).replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const posted: any[] = [];
    const listeners = new Map<string, Array<(event: any) => void>>();
    const rootAttributes = new Set<string>();
    const panelClasses = new Set<string>();
    const panel = {
      classList: {
        contains: (name: string) => panelClasses.has(name),
        toggle: (name: string, force: boolean) => force ? panelClasses.add(name) : panelClasses.delete(name),
      },
    };
    const documentElement = {
      setAttribute: (name: string) => rootAttributes.add(name),
      toggleAttribute: (name: string, force: boolean) => force ? rootAttributes.add(name) : rootAttributes.delete(name),
    };
    const head = { appendChild: () => {} };
    const addListener = (type: string, listener: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    const document = {
      readyState: 'complete',
      documentElement,
      head,
      querySelector: (selector: string) => selector === '.tw-panel' ? panel : null,
      createElement: () => ({ setAttribute: () => {}, textContent: '' }),
      addEventListener: addListener,
    };
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    const context: Record<string, any> = {
      document,
      parent,
      MutationObserver: class { observe() {} },
      Promise,
      Set,
      queueMicrotask: (callback: () => void) => callback(),
      requestAnimationFrame: (callback: () => void) => callback(),
      addEventListener: addListener,
    };
    context.window = context;
    vm.runInNewContext(source, context);
    expect(rootAttributes.has('data-od-tweaks-hidden')).toBe(false);
    expect(posted.some((message) => message.type === 'od:tweaks-available')).toBe(false);

    const dispatch = (data: Record<string, unknown>) => {
      for (const listener of listeners.get('message') ?? []) listener({ source: parent, data });
    };
    dispatch({
      type: 'od:preview:set-capabilities',
      protocolVersion: 1,
      sessionId: 'session-1',
      documentVersion: 'version-1',
      enabledCapabilities: ['tweaks'],
    });
    expect(posted).toContainEqual(expect.objectContaining({
      type: 'od:tweaks-available',
      available: true,
    }));
    expect(posted).toContainEqual(expect.objectContaining({
      type: 'od:tweaks-panel-state',
      visible: true,
    }));

    dispatch({ type: 'od:tweaks-panel-visible', visible: false });
    await Promise.resolve();
    expect(panelClasses.has('tw-hidden')).toBe(true);
    expect(rootAttributes.has('data-od-tweaks-hidden')).toBe(true);
  });

  it('keeps the artifact restore control reachable once its Tweaks panel is closed', () => {
    // Mirrors the visibility contract of the shipped tweaks template
    // (`design-templates/tweaks/example.html`): the floating restore button is
    // `display: none` until the artifact's own close handler adds `tw-show`.
    // The preview runtime must not override that contract — if it does, an
    // artifact whose panel has been closed has no pointer-reachable way back.
    const dom = new JSDOM(
      `<!doctype html><html><head><style>
        .tw-panel { position: fixed; }
        .tw-panel.tw-hidden { opacity: 0; }
        .tw-restore { display: none; align-items: center; }
        .tw-restore.tw-show { display: flex; }
      </style></head><body>
        <aside class="tw-panel" id="tw-panel">Tweaks</aside>
        <button class="tw-restore" id="tw-restore" title="Show panel (T)">T</button>
      </body></html>`,
      { runScripts: 'outside-only', url: 'http://n-scope.localhost/index.html' },
    );
    const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
    context.parent = { postMessage: () => {} };
    const source = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['tweaks'],
      modules: [buildTweaksRuntimeModule()],
    }).replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    vm.runInContext(source, context);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    // Exactly what the artifact's own `× close` handler does.
    const panel = dom.window.document.getElementById('tw-panel');
    const restore = dom.window.document.getElementById('tw-restore');
    panel.classList.add('tw-hidden');
    restore.classList.add('tw-show');

    const style = dom.window.getComputedStyle(restore);
    expect(style.display).not.toBe('none');
    expect(style.visibility).not.toBe('hidden');
    expect(style.pointerEvents).not.toBe('none');

    // While the panel is open the artifact keeps the button out of the way on
    // its own; the runtime must not force it visible either.
    panel.classList.remove('tw-hidden');
    restore.classList.remove('tw-show');
    expect(dom.window.getComputedStyle(restore).display).toBe('none');

    dom.window.close();
  });

  it('installs passive scripts immediately and interaction scripts only on first enable', () => {
    const modules = [
      buildInstalledScriptRuntimeModule(
        'observability',
        '<script data-passive>window.passiveInstalls=(window.passiveInstalls||0)+1;</script>',
        'data-passive',
      ),
      buildLazyScriptRuntimeModule(
        'snapshot',
        '<script data-lazy>window.lazyInstalls=(window.lazyInstalls||0)+1;</script>',
        'data-lazy',
      ),
    ];
    const source = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['snapshot', 'observability'],
      modules,
    }).replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const listeners = new Map<string, Array<(event: any) => void>>();
    const parent = { postMessage: () => {} };
    const context: Record<string, any> = {
      document: { readyState: 'complete' },
      parent,
      Set,
      queueMicrotask: (callback: () => void) => callback(),
      requestAnimationFrame: (callback: () => void) => callback(),
    };
    context.window = context;
    context.addEventListener = (type: string, listener: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    vm.runInNewContext(source, context);
    expect(context.passiveInstalls).toBe(1);
    expect(context.lazyInstalls).toBeUndefined();

    const command = (enabledCapabilities: string[]) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          source: parent,
          data: {
            type: 'od:preview:set-capabilities',
            protocolVersion: 1,
            sessionId: 'session-1',
            documentVersion: 'version-1',
            enabledCapabilities,
          },
        });
      }
    };
    command(['snapshot', 'observability']);
    command([]);
    command(['snapshot', 'observability']);
    expect(context.lazyInstalls).toBe(1);
    expect(context.passiveInstalls).toBe(1);
  });

  it('installs one shared interaction bridge when multiple negotiated capabilities enable it', () => {
    const bootstrap = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['selection', 'comment', 'inspect', 'draw'],
      modules: [buildSharedLazyScriptRuntimeModule(
        ['selection', 'comment', 'inspect', 'draw'],
        '<script data-shared>window.sharedInstalls=(window.sharedInstalls||0)+1;</script>',
        'data-shared',
      )],
    });
    const source = bootstrap.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const listeners = new Map<string, Array<(event: any) => void>>();
    const parent = { postMessage: () => {} };
    const context: Record<string, any> = {
      document: { readyState: 'complete' },
      parent,
      queueMicrotask: (callback: () => void) => callback(),
      requestAnimationFrame: (callback: () => void) => callback(),
      Set,
    };
    context.window = context;
    context.addEventListener = (type: string, listener: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    vm.runInNewContext(source, context);

    for (const listener of listeners.get('message') ?? []) {
      listener({
        source: parent,
        data: {
          type: 'od:preview:set-capabilities',
          protocolVersion: 1,
          sessionId: 'session-1',
          documentVersion: 'version-1',
          enabledCapabilities: ['comment', 'inspect', 'draw'],
        },
      });
    }
    expect(context.sharedInstalls).toBe(1);
  });

  it('installs the edit bridge once and toggles edit mode through capability negotiation', () => {
    const dom = new JSDOM(
      '<!doctype html><html><head></head><body><h1 data-od-source-path="source-0">Title</h1></body></html>',
      { runScripts: 'outside-only', url: 'http://n-scope.localhost/index.html' },
    );
    let hooks: { enable: () => void; disable: () => void } | null = null;
    const context = dom.getInternalVMContext() as vm.Context & Record<string, any>;
    context.parent = dom.window;
    context.register = (_capability: string, create: () => typeof hooks) => { hooks = create(); };

    vm.runInContext(buildManualEditRuntimeModule().source, context);
    expect(dom.window.document.querySelectorAll('[data-od-edit-bridge-style]')).toHaveLength(1);
    expect(dom.window.document.documentElement.hasAttribute('data-od-edit-mode')).toBe(false);

    hooks!.enable();
    expect(dom.window.document.documentElement.hasAttribute('data-od-edit-mode')).toBe(true);
    expect(dom.window.document.querySelectorAll('[data-od-edit-bridge]')).toHaveLength(0);

    hooks!.disable();
    expect(dom.window.document.documentElement.hasAttribute('data-od-edit-mode')).toBe(false);
    hooks!.enable();
    expect(dom.window.document.querySelectorAll('[data-od-edit-bridge-style]')).toHaveLength(1);
    dom.window.close();
  });

  it('keeps scroll and measurement dormant until independently enabled', () => {
    const source = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['content_measurement', 'scroll'],
      modules: [buildScrollAndMeasurementRuntimeModule()],
    }).replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const posted: any[] = [];
    const listeners = new Map<string, Array<(event: any) => void>>();
    const frame = {
      scrollLeft: 4,
      scrollTop: 7,
      scrollWidth: 640,
      clientWidth: 320,
      scrollTo(left: number, top: number) { this.scrollLeft = left; this.scrollTop = top; },
      scrollBy({ left, top }: { left: number; top: number }) {
        this.scrollLeft += left;
        this.scrollTop += top;
      },
    };
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    const addListener = (type: string, listener: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    const document = {
      readyState: 'complete',
      documentElement: frame,
      body: frame,
      scrollingElement: frame,
      fonts: { ready: Promise.resolve() },
      querySelector: () => null,
      addEventListener: addListener,
    };
    const context: Record<string, any> = {
      document,
      parent,
      location: { search: '?odPreviewEpoch=epoch-1' },
      URLSearchParams,
      Number,
      Math,
      Set,
      setTimeout: (callback: () => void) => callback(),
      queueMicrotask: (callback: () => void) => callback(),
      requestAnimationFrame: (callback: () => void) => callback(),
      addEventListener: addListener,
    };
    context.window = context;
    vm.runInNewContext(source, context);

    const dispatch = (data: Record<string, unknown>) => {
      for (const listener of listeners.get('message') ?? []) listener({ source: parent, data });
    };
    const command = (enabledCapabilities: string[]) => dispatch({
      type: 'od:preview:set-capabilities',
      protocolVersion: 1,
      sessionId: 'session-1',
      documentVersion: 'version-1',
      enabledCapabilities,
    });

    dispatch({ type: 'od:preview-scroll-by', left: 10, top: 20 });
    expect(frame.scrollLeft).toBe(4);
    command(['scroll']);
    expect(posted.some((message) => message.type === 'od:preview-scroll-request')).toBe(true);
    dispatch({ type: 'od:preview-scroll-by', left: 10, top: 20 });
    expect(frame.scrollLeft).toBe(14);
    expect(frame.scrollTop).toBe(27);

    dispatch({
      type: 'od:preview-content-size-request',
      measurementId: 'measure-before-enable',
      generation: 'generation-1',
    });
    expect(posted.some((message) => message.measurementId === 'measure-before-enable')).toBe(false);
    command(['scroll', 'content_measurement']);
    dispatch({
      type: 'od:preview-content-size-request',
      measurementId: 'measure-enabled',
      generation: 'generation-1',
    });
    expect(posted).toContainEqual(expect.objectContaining({
      type: 'od:preview-content-size',
      measurementId: 'measure-enabled',
      documentEpoch: 'epoch-1',
      scrollWidth: 640,
      clientWidth: 320,
    }));

    command([]);
    dispatch({ type: 'od:preview-scroll-by', left: 10, top: 20 });
    expect(frame.scrollLeft).toBe(14);
  });

  // The host cannot read scroll out of an opaque-origin document, so before a
  // mode change it asks the document for its exact position and waits, keyed by
  // `requestId`, with a 120 ms budget. Only the legacy srcDoc bridge ever
  // answered that request; the converged transport never did, so every capture
  // burned the full budget and silently degraded to whatever unsolicited
  // scroll report happened to be the most recent one.
  it('answers the host exact-scroll capture request with its requestId', () => {
    const source = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['scroll'],
      modules: [buildScrollAndMeasurementRuntimeModule()],
    }).replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
    const posted: any[] = [];
    const listeners = new Map<string, Array<(event: any) => void>>();
    const frame = {
      scrollLeft: 11,
      scrollTop: 23,
      scrollWidth: 640,
      clientWidth: 320,
      scrollTo(left: number, top: number) { this.scrollLeft = left; this.scrollTop = top; },
      scrollBy({ left, top }: { left: number; top: number }) {
        this.scrollLeft += left;
        this.scrollTop += top;
      },
    };
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    const addListener = (type: string, listener: (event: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    };
    const document = {
      readyState: 'complete',
      documentElement: frame,
      scrollingElement: frame,
      body: frame,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: addListener,
      createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }),
    };
    const context: any = {
      parent,
      document,
      JSON,
      Math,
      Set,
      setTimeout: (callback: () => void) => callback(),
      queueMicrotask: (callback: () => void) => callback(),
      requestAnimationFrame: (callback: () => void) => callback(),
      addEventListener: addListener,
    };
    context.window = context;
    vm.runInNewContext(source, context);

    const dispatch = (data: Record<string, unknown>) => {
      for (const listener of listeners.get('message') ?? []) listener({ source: parent, data });
    };
    dispatch({
      type: 'od:preview:set-capabilities',
      protocolVersion: 1,
      sessionId: 'session-1',
      documentVersion: 'version-1',
      enabledCapabilities: ['scroll'],
    });

    posted.length = 0;
    dispatch({ type: 'od:preview-scroll-capture', requestId: 'preview-scroll-7' });

    // The reply must carry the requestId, or the host cannot match it to the
    // pending capture and lets the request time out instead.
    expect(posted).toContainEqual(expect.objectContaining({
      type: 'od:preview-scroll',
      requestId: 'preview-scroll-7',
      frameLeft: 11,
      frameTop: 23,
    }));
  });
});
