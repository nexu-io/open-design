import { describe, expect, it } from 'vitest';
import {
  buildPreviewFocusGuard,
  buildPreviewRedirectGuard,
  buildPreviewSandboxShim,
  PREVIEW_URL_GUARD_MAX_HTML_BYTES,
  previewHtmlHasLoadTimeLocationNavigation,
  previewHtmlNeedsFocusGuard,
  previewHtmlNeedsPoweredPreview,
  previewHtmlNeedsRedirectGuard,
  previewHtmlNeedsSandboxShim,
} from '../../src/runtime/preview-guards';

describe('preview document guards', () => {
  it('builds inert scripts with stable markers for transport-level deduplication', () => {
    expect(buildPreviewSandboxShim()).toContain('<script data-od-sandbox-shim>');
    expect(buildPreviewFocusGuard()).toContain('<script data-od-preview-focus-guard>');
    expect(buildPreviewRedirectGuard()).toContain('<script data-od-preview-redirect-guard>');
  });

  it('embeds the load-time redirect decision in the redirect guard', () => {
    expect(buildPreviewRedirectGuard()).toContain('BLOCK_LOAD_TIME_SCRIPT_REDIRECT = false');
    expect(buildPreviewRedirectGuard({ blockLoadTimeScriptRedirect: true }))
      .toContain('BLOCK_LOAD_TIME_SCRIPT_REDIRECT = true');
  });

  it('detects authored load-time location navigation without matching comparisons', () => {
    expect(previewHtmlHasLoadTimeLocationNavigation('<script>location.reload()</script>')).toBe(true);
    expect(previewHtmlHasLoadTimeLocationNavigation('<script>window.location = "/next"</script>')).toBe(true);
    expect(previewHtmlHasLoadTimeLocationNavigation('<script>if (location.href === expected) ready()</script>')).toBe(false);
  });

  it('shares passive guard detection across daemon and web runtimes', () => {
    expect(previewHtmlNeedsSandboxShim('<script type=text/babel src=app.jsx></script>')).toBe(true);
    expect(previewHtmlNeedsSandboxShim('<main>Static</main>')).toBe(false);
    expect(previewHtmlNeedsFocusGuard('<input autofocus>')).toBe(true);
    expect(previewHtmlNeedsFocusGuard('<main>Static</main>')).toBe(false);
    expect(previewHtmlNeedsRedirectGuard('<meta http-equiv="refresh" content="0">')).toBe(true);
    expect(previewHtmlNeedsRedirectGuard('<script>if (location.href === expected) ready()</script>')).toBe(false);
  });

  it('shares powered-preview detection across daemon and web runtimes', () => {
    expect(previewHtmlNeedsPoweredPreview('<script>new Worker("./worker.js")</script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script>WebAssembly.instantiateStreaming(fetch("a.wasm"))</script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script>canvas.getContext("webgl2")</script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script type="text/babel" src="./app.jsx"></script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script src="./app.jsx" defer type=text/babel></script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script type="module" src="./main.js"></script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script src="nested/main.js" type=module></script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script type="module">import("./dynamic.js")</script>')).toBe(true);
    expect(previewHtmlNeedsPoweredPreview('<script type="module" src="https://cdn.example/main.js"></script>')).toBe(false);
    expect(previewHtmlNeedsPoweredPreview('<script src="./support.js"></script>')).toBe(false);
    expect(previewHtmlNeedsPoweredPreview('<script type="text/babel">const value = 1;</script>')).toBe(false);
    expect(previewHtmlNeedsPoweredPreview('<main>Static document</main>')).toBe(false);
  });

  it('keeps the URL injection limit aligned with the streaming boundary', () => {
    expect(PREVIEW_URL_GUARD_MAX_HTML_BYTES).toBe(2 * 1024 * 1024);
  });
});
