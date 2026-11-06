import { describe, expect, it } from 'vitest';
import * as bridge from '../src/api/share';

const rect = { left: 10, top: 20, width: 28, height: 28, viewportWidth: 1440, viewportHeight: 904 };

describe('share bridge pin snapshot metadata (not receiver state)', () => {
  it('keeps legacy payloads and adds metadata without changing item shapes', () => {
    const legacy: bridge.ShareBridgePinsPayload = { items: [] };
    const clear: bridge.ShareBridgePinsPayload = {
      items: [], snapshot: { epoch: 1, offset: 0, total: 0 },
    };
    expect(Object.keys(legacy)).toEqual(['items']);
    expect(bridge.isShareBridgePinsSnapshot(clear.snapshot, clear.items.length)).toBe(true);
  });
  it.each([
    [0, 200, 1], [0, 200, 200], [199, 200, 1], [0, 1, 1], [0, 0, 0],
  ])('accepts offset %i, total %i, count %i', (offset, total, count) => {
    expect(bridge.isShareBridgePinsSnapshot({ epoch: 1, offset, total }, count)).toBe(true);
  });
  it.each([
    [0, 201, 1], [200, 200, 1], [199, 200, 2], [1, 0, 0], [0, 0, 1],
    [0, 1, 0], [1, 1, 0], [0, 200, 201],
  ])('rejects offset %i, total %i, count %i', (offset, total, count) => {
    expect(bridge.isShareBridgePinsSnapshot({ epoch: 1, offset, total }, count)).toBe(false);
  });
  it.each(['epoch', 'offset', 'total', 'itemCount'])('requires safe integer %s', key => {
    for (const invalid of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined]) {
      const metadata = { epoch: 1, offset: 0, total: 1 };
      expect(bridge.isShareBridgePinsSnapshot(
        key === 'itemCount' ? metadata : { ...metadata, [key]: invalid },
        key === 'itemCount' ? invalid : 1,
      )).toBe(false);
    }
    expect(bridge.isShareBridgePinsSnapshot({ epoch: 0, offset: 0, total: 1 }, 1)).toBe(false);
  });
  it.each([
    null, [], {}, { epoch: 1, offset: 0 }, { epoch: 1, total: 1 }, { offset: 0, total: 1 },
    { epoch: 1, offset: 0, total: 1, group: 'extra' },
    { epoch: 1, offset: 0, total: 1, extra: undefined },
    Object.create({ epoch: 1, offset: 0, total: 1 }),
  ])('rejects non-exact metadata %j', value => {
    expect(bridge.isShareBridgePinsSnapshot(value, 1)).toBe(false);
  });
  it('validates the epoch domain without claiming to reject temporally stale epochs', () => {
    for (const epoch of [1, Number.MAX_SAFE_INTEGER, 2, 1]) {
      const metadata = Object.freeze({ epoch, offset: 0, total: 1 });
      expect(bridge.isShareBridgePinsSnapshot(metadata, 1)).toBe(true);
      expect(metadata).toEqual({ epoch, offset: 0, total: 1 });
    }
    const invalid = Object.freeze({ epoch: 1, offset: 1, total: 1 });
    expect(bridge.isShareBridgePinsSnapshot(invalid, 1)).toBe(false);
    expect(invalid).toEqual({ epoch: 1, offset: 1, total: 1 });
  });
});

describe('share bridge v2 wire boundaries', () => {
  it('requires v2 and registers geometry only in the frame-to-host direction', () => {
    expect(bridge.SHARE_VIEWER_BRIDGE_VERSION).toBe(2);
    expect(bridge.SHARE_VIEWER_BRIDGE_FRAME_TO_HOST).toContain('share:geometry');
    expect(bridge.SHARE_VIEWER_BRIDGE_HOST_TO_FRAME).not.toContain('share:geometry');
  });
  // This package exports ceilings, not an envelope/anchor parser. Consumer
  // acceptance, nonce/source/mode gates and serialized byte budgets are tested
  // by the receiving runtime; these assertions freeze its length contract.
  it('bounds original selectors and dom: identities in JavaScript UTF-16 units', () => {
    expect(bridge.SHARE_BRIDGE_LIMITS.selectorMaxLength).toBe(4096);
    expect(bridge.SHARE_BRIDGE_LIMITS.elementIdMaxLength).toBe(4100);
    const selector = `#${'a'.repeat(4095)}`;
    const elementId = `dom:${selector}`;
    expect(selector.length).toBe(bridge.SHARE_BRIDGE_LIMITS.selectorMaxLength);
    expect(`${selector}a`.length).toBeGreaterThan(bridge.SHARE_BRIDGE_LIMITS.selectorMaxLength);
    expect(elementId.length).toBe(bridge.SHARE_BRIDGE_LIMITS.elementIdMaxLength);
    expect(`${elementId}a`.length).toBeGreaterThan(bridge.SHARE_BRIDGE_LIMITS.elementIdMaxLength);
  });
  it.each(['界', '😀', 'e\u0301', '\\"'])('counts decoded %j strings, not graphemes or JSON bytes', unit => {
    const selector = unit.repeat(4096 / unit.length);
    const elementId = `dom:${selector}`;
    const decoded = JSON.parse(JSON.stringify({ selector, elementId }));
    expect(decoded).toEqual({ selector, elementId });
    expect(decoded.selector.length).toBe(bridge.SHARE_BRIDGE_LIMITS.selectorMaxLength);
    expect(`${decoded.selector}x`.length).toBeGreaterThan(bridge.SHARE_BRIDGE_LIMITS.selectorMaxLength);
    expect(decoded.elementId.length).toBe(bridge.SHARE_BRIDGE_LIMITS.elementIdMaxLength);
    expect(`${decoded.elementId}x`.length).toBeGreaterThan(bridge.SHARE_BRIDGE_LIMITS.elementIdMaxLength);
    expect(new TextEncoder().encode(JSON.stringify(selector)).length).toBeGreaterThan(selector.length);
  });
  it('keeps ordinary marked and historical dom anchors within the ceilings unchanged', () => {
    for (const anchor of [
      { elementId: 'hero', selector: '[data-od-id="hero"]' },
      { elementId: 'Home', selector: '[data-screen-label="Home"]' },
      { elementId: 'dom:body > div:nth-of-type(1)', selector: 'body > div:nth-of-type(1)' },
    ]) {
      expect(anchor.selector.length).toBeLessThanOrEqual(bridge.SHARE_BRIDGE_LIMITS.selectorMaxLength);
      expect(anchor.elementId.length).toBeLessThanOrEqual(bridge.SHARE_BRIDGE_LIMITS.elementIdMaxLength);
      expect(JSON.parse(JSON.stringify(anchor))).toEqual(anchor);
    }
  });
  it('does not move the other wire ceilings or ordering requirements', () => {
    expect(bridge.SHARE_BRIDGE_LIMITS).toEqual({
      nonceLength: 36, idMaxLength: 200, elementIdMaxLength: 4100,
      selectorMaxLength: 4096, htmlHintMaxLength: 2000,
      coordinateAbsMax: 1_000_000, viewportMax: 32_768,
      pinLabelMaxLength: 3, paletteSize: 30, pinsMaxItems: 200,
      messageMaxBytes: 64 * 1024, messagesPerSecond: 20,
    });
    expect(bridge.SHARE_BRIDGE_ORDERING_AND_REVOCATION_REQUIRED).toBe(true);
    expect(bridge.SHARE_BRIDGE_NONCE_IS_FRESHNESS_NOT_PERMISSION).toBe(true);
    expect(bridge.SHARE_BRIDGE_CARRIES_NO_PATHS_BODIES_OR_CREDENTIALS).toBe(true);
    expect(bridge.SHARE_BRIDGE_SELECTOR_IS_DATA_NOT_CODE).toBe(true);
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
    for (const label of ['1', '200', 'A', '?', 'AB', '林', 'É']) {
      for (const colorIndex of [0, 29]) expect(bridge.isShareBridgePinDisplay({ label, colorIndex })).toBe(true);
    }
    for (const label of ['', '1234', '<b>', 'a b', '\n', 'A\n', '😀', '林冉', 'A林', '林\n', 'é\u0301', '#ff']) {
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
