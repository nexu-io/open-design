import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
  PREVIEW_OBSERVABILITY_PROTOCOL_VERSION,
  buildPreviewBaseHrefBridge,
  buildPreviewObservabilityBridge,
  parsePreviewObservabilityMessage,
} from '../../src/runtime/preview-observability.js';

// Run the already-evaluated bridge string (not raw .ts source text) so a
// template-literal escaping regression (#7008) would surface here the same
// way it reaches the browser.
function runPreviewBaseHrefBridge(context: Record<string, unknown>): void {
  const bridge = buildPreviewBaseHrefBridge({ href: 'http://preview.local/api/projects/p1/preview/scope-1/', expiresAt: 0 });
  const scriptStart = bridge.indexOf('>') + 1; // past the opening <script ...> tag; the IIFE starts on the same line
  const scriptEnd = bridge.lastIndexOf('</script>');
  vm.runInNewContext(bridge.slice(scriptStart, scriptEnd), context);
}

// Mirrors real reflected-URL-attribute semantics: the raw attribute is
// whatever was last set (relative or absolute, verbatim), while the `.src`
// IDL property always resolves that raw value against the CURRENT document
// base at access time — not whatever base was active when it was set. The
// rebase fix under test depends on this exact distinction.
function makeMockFrame(initialSrc: string, resolveBase: () => string) {
  const attrs: Record<string, string> = { src: initialSrc };
  const loadListeners: Array<() => void> = [];
  return {
    getAttribute(name: string) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name: string, value: string) { attrs[name] = value; },
    get src() {
      const rawSrc = attrs.src ?? '';
      try { return new URL(rawSrc, resolveBase()).href; } catch { return rawSrc; }
    },
    set src(value: string) { attrs.src = value; },
    addEventListener(type: string, listener: () => void) { if (type === 'load') loadListeners.push(listener); },
    dispatchLoad() { loadListeners.forEach((listener) => listener()); },
  };
}

describe('preview observability contract', () => {
  it('builds one bounded bridge for runtime, resource, console, and white-screen failures', () => {
    const bridge = buildPreviewObservabilityBridge();

    expect(bridge).toContain(PREVIEW_OBSERVABILITY_BRIDGE_MARKER);
    expect(bridge).toContain(PREVIEW_OBSERVABILITY_MESSAGE_TYPE);
    expect(bridge).toContain("send('runtime_error'");
    expect(bridge).toContain("send('unhandled_rejection'");
    expect(bridge).toContain("send('console_error'");
    expect(bridge).toContain("send('resource_error'");
    expect(bridge).toContain("send('white_screen'");
    expect(bridge).toContain('stack: text(value.stack, 2000)');
    expect(bridge).toContain('detail.source_url = text(event && event.filename, 1000)');
    expect(bridge).toContain('var MAX_EVENTS = 12');
    expect(bridge).not.toContain('JSON.stringify(arguments)');
  });

  // OPEND-2147: a deck whose stage collapses to scale ~0 renders as an empty
  // frame while every existing signal stays clean -- the artifact loaded, no
  // script threw, and `visiblePaintCount()` still sees painted chrome, so
  // `white_screen` never fires.
  //
  // This only checks that the bridge carries the probe and its fields at all.
  // Whether the probe fires on the shapes decks are actually authored in --
  // `<deck-stage>` shadow canvas, `.deck-stage`, template `.stage` -- is
  // behavioural and is covered by executing the bridge in
  // apps/web/tests/observability/preview-deck-stage-probe.test.ts. A
  // string-contains assertion cannot tell those apart.
  it('carries the deck stage probe and its measurement fields', () => {
    const bridge = buildPreviewObservabilityBridge();
    expect(bridge).toContain('deck_stage_unscaled');
    for (const field of ['stage_scale_permille', 'stage_transform', 'stage_kind', 'canvas_width', 'elapsed_ms']) {
      expect(bridge).toContain(field);
    }
    // The selector family the export path already targets, so the two cannot
    // drift apart silently.
    for (const selector of ['deck-stage', '#deck-stage, .deck-stage', '.canvas']) {
      expect(bridge).toContain(selector);
    }
  });

  it('accepts only the versioned preview observability wire shape', () => {
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      message: 'boom',
    })).toMatchObject({ event: 'runtime_error', message: 'boom' });

    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 2,
      event: 'runtime_error',
    })).toBeNull();
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'arbitrary_event',
    })).toBeNull();
  });

  it('normalizes untrusted fields before returning a bounded payload', () => {
    const parsed = parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      message: `  ${'x'.repeat(600)}  `,
      stack: 'line one\nline two',
      line: 12.6,
      viewport_width: 20_000_000,
      blank_observation_count: 2,
      sample_interval_ms: 1_500,
      ignored: 'not part of the protocol',
    });

    expect(parsed).toMatchObject({
      event: 'runtime_error',
      message: 'x'.repeat(500),
      stack: 'line one line two',
      line: 13,
      viewport_width: 10_000_000,
      blank_observation_count: 2,
      sample_interval_ms: 1_500,
    });
    expect(parsed).not.toHaveProperty('ignored');
  });

  it('accepts the deck stage measurement as a versioned event', () => {
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: PREVIEW_OBSERVABILITY_PROTOCOL_VERSION,
      event: 'deck_stage_unscaled',
      stage_scale_permille: 0,
      stage_transform: 'matrix',
      stage_kind: 'deck-stage',
      stage_width: 0,
      stage_height: 0,
      canvas_width: 1920,
      canvas_height: 1080,
      viewport_width: 1075,
      viewport_height: 530,
      elapsed_ms: 5000,
    })).toMatchObject({
      event: 'deck_stage_unscaled',
      stage_kind: 'deck-stage',
      stage_transform: 'matrix',
      stage_width: 0,
      canvas_width: 1920,
      canvas_height: 1080,
      elapsed_ms: 5000,
    });
  });

  it('rejects known fields with invalid types', () => {
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      message: { nested: 'boom' },
    })).toBeNull();
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      line: '12',
    })).toBeNull();
  });
});

describe('preview base href bridge (#7008 nested-iframe rebase)', () => {
  // Updating <base> alone does not move an iframe that already navigated:
  // an iframe's src resolves against the document's base URL only once, at
  // navigation time. This suite pins the rebase-and-reload behavior added
  // alongside the <base> update, since only an e2e case for a late-mounted
  // child previously covered any of this path.
  function setUp(iframeSrc: string, ownerDir = '') {
    const baseEl = { href: `http://preview.local/api/projects/p1/preview/scope-1/${ownerDir}`, setAttribute(_: string, value: string) { this.href = value; } };
    const frame = makeMockFrame(iframeSrc, () => baseEl.href);
    const childWindow = {};
    Object.assign(frame, { contentWindow: childWindow });
    const parentMessages: unknown[] = [];
    const messageListeners: Array<(event: { source: unknown; data: unknown }) => void> = [];
    const window = {
      __odPreviewBaseBridge: false,
      parent: { postMessage: (message: unknown) => parentMessages.push(message) },
      addEventListener(type: string, listener: (event: { source: unknown; data: unknown }) => void) {
        if (type === 'message') messageListeners.push(listener);
      },
    };
    const document = {
      get baseURI() { return baseEl.href; },
      querySelector(selector: string) { return selector === 'base[data-od-project-preview-base]' ? baseEl : null; },
      querySelectorAll(selector: string) { return selector === 'iframe[src]' ? [frame] : []; },
    };
    runPreviewBaseHrefBridge({ window, document, URL });
    // The daemon includes the owner file's own directory in the scope
    // rotation href too (see injectProjectPreviewBase), so the next scope's
    // href carries the same ownerDir suffix as the current one.
    const send = (scope: string) =>
      messageListeners.forEach((listener) => listener({ source: window.parent, data: { type: 'od:preview-base-update', href: `http://preview.local/api/projects/p1/preview/${scope}/${ownerDir}` } }));
    const ready = (href: string, source: unknown = childWindow) =>
      messageListeners.forEach((listener) => listener({ source, data: { type: 'od:url-selection-bridge-ready', href } }));
    return { baseEl, frame, parentMessages, ready, send };
  }

  it('does not resurrect a self-navigated child that later left for a destination with no ready ping (#7296 review R8-3)', () => {
    const { frame, ready, send } = setUp('child.html');
    send('scope-2');
    ready('http://preview.local/api/projects/p1/preview/scope-2/slide-2.html');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');

    // The child leaves for a destination with no bridge/ready ping (an
    // external site, a non-HTML file) via its OWN internal navigation --
    // the parent's src ATTRIBUTE is never touched by that (same staleness
    // as the child's original self-navigation to slide-2.html), but a real
    // browser still fires the frame's native `load` event regardless of
    // what the child navigated to. That must clear this bridge's
    // confirmed-path cache, not leave the stale "slide-2.html" behind.
    frame.dispatchLoad();

    // A later scope rotation must fall back to the frame's still-declared
    // "child.html" attribute, NOT rebase back to the stale cached
    // "slide-2.html" -- which is a real project path, so without the fix
    // this would silently "resurrect" a destination the child left long ago.
    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/child.html');
  });

  it('preserves a self-navigated child’s query and hash across a scope rotation (#7296 review R9-3)', () => {
    const { frame, ready, send } = setUp('child.html');
    send('scope-2');
    ready('http://preview.local/api/projects/p1/preview/scope-2/slide-2.html?slide=2#section');

    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/slide-2.html?slide=2#section');
  });

  it('rebases and reloads an already-navigated project-relative child iframe to the new scope', () => {
    const { baseEl, frame, send } = setUp('child.html');
    send('scope-2');
    expect(baseEl.href).toBe('http://preview.local/api/projects/p1/preview/scope-2/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');
  });

  it('keeps rebasing from the original relative ref across repeated scope updates', () => {
    // If the rebase logic re-derived "original" from the now-absolute
    // .src after the first update instead of the cached attribute, a
    // second update would compound the previous scope into the new one.
    const { frame, send } = setUp('child.html');
    send('scope-2');
    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/child.html');
  });

  it('does not rebase an absolute or cross-origin iframe src', () => {
    const { frame, send } = setUp('https://example.com/embed');
    send('scope-2');
    expect(frame.src).toBe('https://example.com/embed');
  });

  it('carries a dynamically changed child src forward across a later scope rotation', () => {
    // #7008 review (nettee): caching the "original" relative ref on first
    // sight goes stale the moment a deck navigates the frame to a different
    // slide between two scope rotations — a later rotation (renewal, daemon
    // restart) must rebase the CURRENT src, not revert to the first slide.
    const { frame, send } = setUp('child.html');
    send('scope-2');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');

    // Simulate the deck's own navigation setting a new relative src directly.
    frame.src = 'slide-2.html';
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/slide-2.html');

    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/slide-2.html');
  });

  it('rebases to the child-confirmed live path when the child navigated itself, not the stale src attribute (#7008 review: frame.src staleness)', () => {
    const { frame, ready, send } = setUp('child.html');
    send('scope-2');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');

    // A child self-navigation leaves frame.src untouched. Its ready ping is
    // independently recorded by this bridge's private cache.
    ready('http://preview.local/api/projects/p1/preview/scope-2/slide-2.html');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');

    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/slide-2.html');
  });

  it('falls back to the current src synchronously after a parent src mutation', () => {
    const { frame, ready, send } = setUp('child.html');
    send('scope-2');
    ready('http://preview.local/api/projects/p1/preview/scope-2/slide-2.html');
    frame.setAttribute('src', 'slide-3.html');

    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/slide-3.html');
  });

  it('ignores a ready ping outside the current preview scope and falls back to src', () => {
    const { frame, ready, send } = setUp('child.html');
    send('scope-2');
    ready('http://preview.local/api/projects/p1/preview/other-scope/slide-2.html');

    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/child.html');
  });

  it('rebases a sibling-directory iframe src that crosses the owner file directory boundary (Codex review)', () => {
    // The daemon's injected <base> includes the owner FILE's own directory
    // (deck/), not just the scope root -- see injectProjectPreviewBase. A
    // project-local child in a SIBLING directory, like
    // <iframe src="../slides/one.html"> from deck/index.html, resolves
    // OUTSIDE .../preview/<scope>/deck/ but is still well within
    // .../preview/<scope>/. Stripping against the owner-specific prefix
    // (instead of the scope root) would incorrectly treat this as
    // ineligible and never rebase it.
    const { baseEl, frame, send } = setUp('../slides/one.html', 'deck/');
    expect(baseEl.href).toBe('http://preview.local/api/projects/p1/preview/scope-1/deck/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-1/slides/one.html');

    send('scope-2');
    expect(baseEl.href).toBe('http://preview.local/api/projects/p1/preview/scope-2/deck/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/slides/one.html');
  });

  it('carries a sibling-directory child that navigated dynamically across a scope rotation', () => {
    const { frame, send } = setUp('../slides/one.html', 'deck/');
    send('scope-2');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/slides/one.html');

    frame.src = '../slides/two.html';
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/slides/two.html');

    send('scope-3');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/slides/two.html');
  });
});
