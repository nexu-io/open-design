// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeckProjectCoverFrame } from '../../src/components/project-cover';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeckProjectCoverFrame', () => {
  it('does not fetch an offscreen deck cover until it scrolls into view (#2648)', async () => {
    const src = '/api/projects/project-deck/files/index.html?v=1';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    // IntersectionObserver that never reports intersecting — simulates an
    // offscreen card. The cover must not fetch until it is observed.
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(_cb: IntersectionObserverCallback) {
          // Never invoke _cb → the cover stays "offscreen".
        }
        observe(...args: unknown[]) {
          observe(...(args as [Element]));
        }
        disconnect() {
          disconnect();
        }
        unobserve = vi.fn();
      },
    );

    render(
      <DeckProjectCoverFrame
        src={src}
        initial="D"
        iframeClassName="thumb-iframe"
        glyphClassName="card-glyph"
        diagnostic="project-deck:index.html"
      />,
    );

    // The host was observed for visibility but never intersects, so the deck
    // fetch never fires.
    expect(observe).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      src,
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('fetches the deck body once the cover scrolls into view', async () => {
    const src = '/api/projects/project-deck/files/index.html?v=1';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        '<!DOCTYPE html><html><body><div class="slide">x</div>' +
        '<style>.slide{width:1280px;height:720px;background:#fff}</style></body></html>',
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    // Observer that immediately reports the cover as intersecting on observe.
    let cb: IntersectionObserverCallback | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          cb = callback;
        }
        observe(target: Element) {
          // Immediately intersect.
          cb?.(
            [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );

    render(
      <DeckProjectCoverFrame
        src={src}
        initial="D"
        iframeClassName="thumb-iframe"
        glyphClassName="card-glyph"
        diagnostic="project-deck:index.html"
      />,
    );

    // Once visible, the deck body is fetched exactly once.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      src,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
