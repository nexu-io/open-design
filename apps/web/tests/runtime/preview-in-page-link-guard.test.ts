// @vitest-environment jsdom
//
// OPEND-2970. Both preview transports hand the previewed document a
// containment `<base>` so that a URL the artifact builds at runtime resolves
// onto the scoped preview route. A bare `#section` link is a relative URL as
// well, so the browser resolves it against that base too — and the reported
// landing page's top-right `<a href="#join">` then pointed at
// `/api/projects/<id>/preview/<scope>/`, a route that does not serve the
// artifact. Clicking it replaced the preview with the daemon's 404 page, while
// the same file opened from disk — where nothing injects a base — scrolled
// normally.
//
// Which transport a given artifact takes is covered by
// file-viewer-render-mode.test.ts, and the daemon response that carries the
// guard by project-preview-containment.test.ts. This file covers what the
// injected payload does to the click itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPreviewInPageLinkGuard } from '@open-design/contracts/runtime/preview-guards';

const CONTAINMENT_BASE = '/api/projects/p1/preview/scope-1/';

const installedClickListeners: EventListener[] = [];
let scrolledInto: Element[] = [];

/**
 * Run the injected guard against this document, remembering the listener it
 * registers. jsdom keeps one `document` for the whole file, so a listener left
 * behind by an earlier case would answer a later case's click as well.
 */
function installGuard(): void {
  const body = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(buildPreviewInPageLinkGuard())?.[1];
  expect(body, 'guard script body must be present').toBeTruthy();
  const nativeAddEventListener = document.addEventListener.bind(document);
  document.addEventListener = ((type: string, handler: EventListener, options?: unknown) => {
    if (type === 'click') installedClickListeners.push(handler);
    nativeAddEventListener(type, handler, options as AddEventListenerOptions);
  }) as typeof document.addEventListener;
  try {
    new Function(body as string)();
  } finally {
    document.addEventListener = nativeAddEventListener;
  }
}

function renderPreviewedDocument(bodyHtml: string): void {
  document.head.innerHTML = `<base href="${CONTAINMENT_BASE}">`;
  document.body.innerHTML = bodyHtml;
}

function clickIt(link: HTMLAnchorElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  return event;
}

describe('preview in-page link guard', () => {
  beforeEach(() => {
    scrolledInto = [];
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolledInto.push(this);
    } as Element['scrollIntoView'];
    if (window.location.hash) window.location.hash = '';
  });

  afterEach(() => {
    for (const handler of installedClickListeners.splice(0)) {
      document.removeEventListener('click', handler);
    }
    delete (window as unknown as Record<string, unknown>).__odPreviewInPageLinkGuard;
    vi.restoreAllMocks();
  });

  it('reproduces the break: under the containment base an in-page link leaves the document', () => {
    renderPreviewedDocument(
      '<a class="cta" href="#join">Join</a><section id="join">Join the beta</section>',
    );
    const link = document.querySelector('a.cta') as HTMLAnchorElement;

    // Where the browser goes when the link is followed. It is not the document
    // being previewed, so this is a real navigation rather than a scroll.
    expect(new URL(link.href).pathname).toBe(CONTAINMENT_BASE);
    expect(new URL(link.href).pathname).not.toBe(window.location.pathname);

    // Nothing stops that navigation without the guard.
    expect(clickIt(link).defaultPrevented).toBe(false);
  });

  it('keeps the click on the previewed document and moves the fragment there', () => {
    renderPreviewedDocument(
      '<a class="cta" href="#join">Join</a><section id="join">Join the beta</section>',
    );
    const link = document.querySelector('a.cta') as HTMLAnchorElement;
    installGuard();

    expect(clickIt(link).defaultPrevented).toBe(true);
    expect(scrolledInto).toEqual([document.getElementById('join')]);
    // `location.hash` resolves against the document's own URL rather than the
    // base, so the artifact keeps its `:target` match and its history entry.
    expect(window.location.hash).toBe('#join');
    expect(window.location.pathname).not.toBe(CONTAINMENT_BASE);
  });

  // The fragment is matched against the id both raw and percent-decoded, the
  // way the standard's "indicated part" does. An exact `getElementById` on the
  // raw fragment finds nothing here, and the click would be swallowed.
  it('reaches an id that only matches after percent-decoding', () => {
    renderPreviewedDocument(
      '<a class="cta" href="#order%20summary">Summary</a>'
      + '<section id="order summary">Order summary</section>',
    );
    const link = document.querySelector('a.cta') as HTMLAnchorElement;
    installGuard();

    expect(clickIt(link).defaultPrevented).toBe(true);
    expect(scrolledInto).toEqual([document.getElementById('order summary')]);
    expect(window.location.hash).toBe('#order%20summary');
  });

  // Legacy named anchors are part of the same resolution order, after ids.
  it('reaches a legacy named anchor', () => {
    renderPreviewedDocument(
      '<a class="cta" href="#pricing">Pricing</a>'
      + '<a name="pricing"></a><section>Pricing</section>',
    );
    const link = document.querySelector('a.cta') as HTMLAnchorElement;
    installGuard();

    expect(clickIt(link).defaultPrevented).toBe(true);
    expect(scrolledInto).toEqual([document.querySelector('a[name="pricing"]')]);
    expect(window.location.hash).toBe('#pricing');
  });

  // A fragment that matches nothing is still a navigation in the browser: it
  // updates the URL and scrolls nowhere. Swallowing it would leave the artifact
  // unable to move its own fragment at all.
  it('still moves the fragment when nothing matches it', () => {
    renderPreviewedDocument('<a class="cta" href="#missing">Missing</a>');
    const link = document.querySelector('a.cta') as HTMLAnchorElement;
    installGuard();

    expect(clickIt(link).defaultPrevented).toBe(true);
    expect(scrolledInto).toEqual([]);
    expect(window.location.hash).toBe('#missing');
  });

  it('installs one listener even when both the base and the sandbox shim ask for it', () => {
    renderPreviewedDocument('<a class="cta" href="https://example.com/pricing" target="_blank">Pricing</a>');
    const link = document.querySelector('a.cta') as HTMLAnchorElement;
    const open = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(open as unknown as typeof window.open);

    installGuard();
    installGuard();

    expect(clickIt(link).defaultPrevented).toBe(true);
    // A second listener would open two windows for one click.
    expect(open).toHaveBeenCalledTimes(1);
    expect(installedClickListeners).toHaveLength(1);
  });
});
