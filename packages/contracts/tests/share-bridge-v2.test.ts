import { describe, expect, it } from 'vitest';
import * as bridge from '../src/api/share';

const rect = { left: 10, top: 20, width: 28, height: 28, viewportWidth: 1440, viewportHeight: 904 };

describe('share bridge v2 wire boundaries', () => {
  it('requires v2 and registers geometry only in the frame-to-host direction', () => {
    expect(bridge.SHARE_VIEWER_BRIDGE_VERSION).toBe(2);
    expect(bridge.SHARE_VIEWER_BRIDGE_FRAME_TO_HOST).toContain('share:geometry');
    expect(bridge.SHARE_VIEWER_BRIDGE_HOST_TO_FRAME).not.toContain('share:geometry');
  });
  it('accepts finite fractional viewport coordinates, including offscreen targets', () => {
    expect(bridge.isShareBridgeViewportRect(rect)).toBe(true);
    expect(bridge.isShareBridgeViewportRect({ ...rect, left: -12.5, top: 0.125, width: 0 })).toBe(true);
  });
  it.each([null, [], {}, { ...rect, x: 10 }, { ...rect, viewportWidth: undefined }])('rejects non-exact geometry %j', value => {
    expect(bridge.isShareBridgeViewportRect(value)).toBe(false);
  });
  it.each(['left', 'top', 'width', 'height', 'viewportWidth', 'viewportHeight'])('rejects non-finite and string %s', key => {
    for (const value of [NaN, Infinity, -Infinity, '28']) {
      expect(bridge.isShareBridgeViewportRect({ ...rect, [key]: value })).toBe(false);
    }
  });
  it('bounds sizes, signed coordinates, edges and viewport dimensions', () => {
    const max = bridge.SHARE_BRIDGE_LIMITS.coordinateAbsMax;
    expect(bridge.isShareBridgeViewportRect({ ...rect, left: -max, top: max, width: max, height: 0 })).toBe(true);
    for (const extra of [{ left: max + 1 }, { left: max, width: 1 }, { top: max, height: 1 },
      { width: -1 }, { height: -1 }, { width: max + 1 }, { viewportWidth: 0 },
      { viewportHeight: 32769 }]) {
      expect(bridge.isShareBridgeViewportRect({ ...rect, ...extra })).toBe(false);
    }
    expect(bridge.isShareBridgeViewportRect({ ...rect, viewportWidth: 32768 })).toBe(true);
  });
  it('requires fallback pins to occupy a positive, wholly visible viewport rectangle', () => {
    expect(bridge.isShareBridgeFallbackRect(rect)).toBe(true);
    for (const extra of [{ left: -1 }, { top: -1 }, { width: 0 }, { height: 0 },
      { left: 1430 }, { top: 900 }]) {
      expect(bridge.isShareBridgeFallbackRect({ ...rect, ...extra })).toBe(false);
    }
  });
  it('allows only short text and palette indexes, never identity or styling', () => {
    for (const label of ['1', '200', 'A', '?', 'AB']) {
      for (const colorIndex of [0, 29]) expect(bridge.isShareBridgePinDisplay({ label, colorIndex })).toBe(true);
    }
    for (const label of ['', '1234', '<b>', 'a b', '\n', 'A\n', '😀', '林', '#ff']) {
      expect(bridge.isShareBridgePinDisplay({ label, colorIndex: 0 })).toBe(false);
    }
    for (const colorIndex of [-1, 30, 0.5, NaN, Infinity, '0']) {
      expect(bridge.isShareBridgePinDisplay({ label: '1', colorIndex })).toBe(false);
    }
    for (const extra of [{ authorKey: 'private' }, { html: '<b>1</b>' }, { css: 'color:red' }]) {
      expect(bridge.isShareBridgePinDisplay({ label: '1', colorIndex: 0, ...extra })).toBe(false);
    }
    expect(bridge.isShareBridgePinDisplay(null)).toBe(false);
    expect(bridge.isShareBridgePinDisplay({ label: '1' })).toBe(false);
  });
});
