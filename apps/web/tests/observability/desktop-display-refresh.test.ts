import { describe, expect, it, vi } from 'vitest';
import { createMockOpenDesignHost } from '@open-design/host/testing';
import type { OpenDesignHostDisplayRefresh } from '@open-design/host';
import { displayRefreshProperties, subscribeDesktopDisplayRefresh } from '../../src/observability/desktop-display-refresh';

const refresh = { reasons: ['resume'], scaleFactor: 2, displayCount: 1 };
describe('desktop display refresh analytics', () => {
  it.each([[1, true], [2, false], [1.5, true]])('compares renderer DPR %s with native scale', (devicePixelRatio, mismatch) => {
    expect(displayRefreshProperties(refresh, { devicePixelRatio, reducedTransparency: true })).toEqual({
      reasons: ['resume'], scale_factor: 2, display_count: 1,
      device_pixel_ratio: devicePixelRatio, page_zoom: null, reduced_transparency: true, scale_mismatch: mismatch,
    });
  });

  it.each([[1, 2, false], [1.25, 2.5, false], [1.1, 2.2, false], [0.9, 1.8, false], [1.25, 2, true]])(
    'normalizes page zoom %s before comparing DPR %s', (zoomFactor, devicePixelRatio, mismatch) => {
      const props = displayRefreshProperties({ ...refresh, zoomFactor }, { devicePixelRatio, reducedTransparency: false });
      expect(props).toMatchObject({ device_pixel_ratio: devicePixelRatio, page_zoom: zoomFactor, scale_mismatch: mismatch });
    });

  it('subscribes to the host and sends only through the supplied consent-gated track', () => {
    let listener!: (value: OpenDesignHostDisplayRefresh) => void;
    const unsubscribe = vi.fn();
    const track = vi.fn();
    const safetyTransport = vi.fn();
    vi.stubGlobal('fetch', safetyTransport);
    const host = createMockOpenDesignHost({ appearance: {
      setTheme: vi.fn(),
      subscribeDisplayRefresh: (next) => { listener = next; return unsubscribe; },
    } });
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    try {
      const dispose = subscribeDesktopDisplayRefresh(host, track);
      listener(refresh);
      expect(track).toHaveBeenCalledExactlyOnceWith('client_display_refresh', {
        reasons: ['resume'], scale_factor: 2, display_count: 1,
        device_pixel_ratio: 1, page_zoom: null, reduced_transparency: true, scale_mismatch: true,
      });
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-transparency: reduce)');
      expect(safetyTransport).not.toHaveBeenCalled();
      dispose();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('supports web and older desktop hosts without the optional subscription', () => {
    const track = vi.fn();
    expect(() => subscribeDesktopDisplayRefresh(null, track)()).not.toThrow();
    expect(() => subscribeDesktopDisplayRefresh(createMockOpenDesignHost(), track)()).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});
