import { describe, expect, it } from 'vitest';
import {
  buildPreviewFocusGuard,
  buildPreviewInPageLinkGuard,
  buildPreviewRedirectGuard,
  buildPreviewSandboxShim,
  PREVIEW_URL_GUARD_MAX_HTML_BYTES,
  previewHtmlHasLoadTimeLocationNavigation,
} from '../../src/runtime/preview-guards';

describe('preview document guards', () => {
  it('builds inert scripts with stable markers for transport-level deduplication', () => {
    expect(buildPreviewSandboxShim()).toContain('<script data-od-sandbox-shim>');
    expect(buildPreviewFocusGuard()).toContain('<script data-od-preview-focus-guard>');
    expect(buildPreviewRedirectGuard()).toContain('<script data-od-preview-redirect-guard>');
    expect(buildPreviewInPageLinkGuard())
      .toContain('<script data-od-preview-in-page-link-guard>');
  });

  // The shim covers what the opaque origin takes away; the link guard covers
  // what the containment base changes. They ship on different conditions, so a
  // shim that still owned link clicks would put the fix behind an unrelated
  // Web Storage heuristic (OPEND-2970).
  it('keeps in-page link handling out of the opaque-origin shim', () => {
    expect(buildPreviewSandboxShim()).not.toContain("addEventListener('click'");
    expect(buildPreviewInPageLinkGuard()).toContain("addEventListener('click'");
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

  it('keeps the URL injection limit aligned with the streaming boundary', () => {
    expect(PREVIEW_URL_GUARD_MAX_HTML_BYTES).toBe(2 * 1024 * 1024);
  });
});
