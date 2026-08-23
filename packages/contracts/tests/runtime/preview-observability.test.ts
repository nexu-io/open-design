import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
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
  return {
    getAttribute(name: string) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name: string, value: string) { attrs[name] = value; },
    get src() {
      try { return new URL(attrs.src, resolveBase()).href; } catch { return attrs.src; }
    },
    set src(value: string) { attrs.src = value; },
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
  function setUp(iframeSrc: string) {
    const baseEl = { href: 'http://preview.local/api/projects/p1/preview/scope-1/', setAttribute(_: string, value: string) { this.href = value; } };
    const frame = makeMockFrame(iframeSrc, () => baseEl.href);
    const parentMessages: unknown[] = [];
    let messageListener: ((event: { source: unknown; data: unknown }) => void) | undefined;
    const window = {
      __odPreviewBaseBridge: false,
      parent: { postMessage: (message: unknown) => parentMessages.push(message) },
      addEventListener(type: string, listener: (event: { source: unknown; data: unknown }) => void) {
        if (type === 'message') messageListener = listener;
      },
    };
    const document = {
      get baseURI() { return baseEl.href; },
      querySelector(selector: string) { return selector === 'base[data-od-project-preview-base]' ? baseEl : null; },
      querySelectorAll(selector: string) { return selector === 'iframe[src]' ? [frame] : []; },
    };
    runPreviewBaseHrefBridge({ window, document, URL });
    const send = (href: string) => messageListener?.({ source: window.parent, data: { type: 'od:preview-base-update', href } });
    return { baseEl, frame, parentMessages, send };
  }

  it('rebases and reloads an already-navigated project-relative child iframe to the new scope', () => {
    const { baseEl, frame, send } = setUp('child.html');
    send('http://preview.local/api/projects/p1/preview/scope-2/');
    expect(baseEl.href).toBe('http://preview.local/api/projects/p1/preview/scope-2/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');
  });

  it('keeps rebasing from the original relative ref across repeated scope updates', () => {
    // If the rebase logic re-derived "original" from the now-absolute
    // .src after the first update instead of the cached attribute, a
    // second update would compound the previous scope into the new one.
    const { frame, send } = setUp('child.html');
    send('http://preview.local/api/projects/p1/preview/scope-2/');
    send('http://preview.local/api/projects/p1/preview/scope-3/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/child.html');
  });

  it('does not rebase an absolute or cross-origin iframe src', () => {
    const { frame, send } = setUp('https://example.com/embed');
    send('http://preview.local/api/projects/p1/preview/scope-2/');
    expect(frame.src).toBe('https://example.com/embed');
  });

  it('carries a dynamically changed child src forward across a later scope rotation', () => {
    // #7008 review (nettee): caching the "original" relative ref on first
    // sight goes stale the moment a deck navigates the frame to a different
    // slide between two scope rotations — a later rotation (renewal, daemon
    // restart) must rebase the CURRENT src, not revert to the first slide.
    const { frame, send } = setUp('child.html');
    send('http://preview.local/api/projects/p1/preview/scope-2/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/child.html');

    // Simulate the deck's own navigation setting a new relative src directly.
    frame.src = 'slide-2.html';
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-2/slide-2.html');

    send('http://preview.local/api/projects/p1/preview/scope-3/');
    expect(frame.src).toBe('http://preview.local/api/projects/p1/preview/scope-3/slide-2.html');
  });
});
