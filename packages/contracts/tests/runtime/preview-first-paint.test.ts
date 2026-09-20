import { describe, expect, it } from 'vitest';
import {
  PREVIEW_BRIDGE_PAINT_DETECTORS,
  PREVIEW_FIRST_PAINT_ATTACH_TOKEN_LIMIT,
  PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
  PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
  PREVIEW_FIRST_PAINT_TIMEOUT_MS,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
  PREVIEW_WHITE_SCREEN_TIMEOUT_MS,
  buildPreviewObservabilityBridge,
  parsePreviewFirstPaintMessage,
  parsePreviewObservabilityMessage,
  previewFirstPaintPhaseDetail,
} from '../../src/runtime/preview-observability.js';
import { PREVIEW_PHASE_PAINT_DETECTORS } from '../../src/runtime/preview-phase-events.js';

describe('preview first-visible-paint report', () => {
  it('keeps the bridge detector vocabulary inside the phase contract and refuses to claim the host', () => {
    for (const detector of PREVIEW_BRIDGE_PAINT_DETECTORS) {
      expect(PREVIEW_PHASE_PAINT_DETECTORS).toContain(detector);
    }
    // A document is untrusted. It may report what it observed; it may never
    // claim to be the host's own observation.
    expect(PREVIEW_BRIDGE_PAINT_DETECTORS as readonly string[]).not.toContain('host_observer');
  });

  it('gives its verdict before the white-screen probe reaches one', () => {
    // The two answer the same moment from opposite sides. If paint gave up
    // after white_screen had already fired, the coverage panel and the blank
    // panel would disagree about which document was measured first.
    expect(PREVIEW_FIRST_PAINT_TIMEOUT_MS).toBeLessThan(PREVIEW_WHITE_SCREEN_TIMEOUT_MS);
  });

  it('carries a one-shot paint report that never polls', () => {
    const bridge = buildPreviewObservabilityBridge();

    expect(bridge).toContain(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
    expect(bridge).toContain("reportFirstPaint('timeout'");
    expect(bridge).toContain("reportFirstPaint('raf_probe'");
    expect(bridge).toContain("reportFirstPaint('bridge_report'");
    // Reuses the single existing visibility judgement rather than growing a
    // second definition of "painted".
    expect(bridge).toContain('visiblePaintCount()');
    // Free observation of what the browser already recorded, ahead of any
    // probe of our own.
    expect(bridge).toContain("getEntriesByType('paint')");
    expect(bridge).toContain('PerformanceObserver');
    // Hard constraint: no polling, no repeating timers, no DOM churn.
    expect(bridge).not.toContain('setInterval');
    expect(bridge).not.toContain('MutationObserver');
    expect(bridge).not.toContain("dispatchEvent(new Event('resize'))");
  });

  it('keeps the paint report off the failure channel', () => {
    // reportPreviewIframeMessage() ends in a catch-all that turns any parsed
    // observability message into client_preview_runtime_error. A successful
    // paint arriving there would publish one fabricated runtime error per
    // healthy preview, so the paint report travels as its own message type.
    expect(parsePreviewObservabilityMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'first_visible_paint',
      paint_observed: true,
    })).toBeNull();
    expect(parsePreviewFirstPaintMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'white_screen',
    })).toBeNull();
  });

  it('accepts a bounded paint report and normalizes untrusted numbers', () => {
    expect(parsePreviewFirstPaintMessage({
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'bridge_report',
      paint_observed: true,
      visible_element_count: 3.4,
      elapsed_ms: 412.7,
      ready_state: '  complete  ',
      visibility_state: 'visible',
      attach_token: 'a'.repeat(PREVIEW_FIRST_PAINT_ATTACH_TOKEN_LIMIT + 40),
      authored_dom: '<h1>secret</h1>',
    })).toEqual({
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'bridge_report',
      paint_observed: true,
      visible_element_count: 3,
      elapsed_ms: 413,
      ready_state: 'complete',
      visibility_state: 'visible',
      attach_token: 'a'.repeat(PREVIEW_FIRST_PAINT_ATTACH_TOKEN_LIMIT),
    });
  });

  it('records a given-up probe as an absent measurement rather than a zero one', () => {
    const timedOut = parsePreviewFirstPaintMessage({
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'timeout',
      paint_observed: false,
      visible_element_count: 0,
      elapsed_ms: PREVIEW_FIRST_PAINT_TIMEOUT_MS,
    });

    expect(timedOut).toMatchObject({ detector: 'timeout', paint_observed: false });
    // The row exists. A dashboard that drops it turns the slowest previews
    // into missing rows, and the coverage panel reads as though they got fast.
    expect(previewFirstPaintPhaseDetail(timedOut!)).toEqual({
      detector: 'timeout',
      paint_observed: false,
      visible_element_count: 0,
    });
  });

  it('refuses a report whose detector and verdict contradict each other', () => {
    // "gave up" and "saw paint" cannot both be true. Admitting the pair would
    // let a document forge coverage it never earned.
    expect(parsePreviewFirstPaintMessage({
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'timeout',
      paint_observed: true,
      visible_element_count: 4,
      elapsed_ms: 10,
    })).toBeNull();
    expect(parsePreviewFirstPaintMessage({
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'raf_probe',
      paint_observed: false,
      visible_element_count: 0,
      elapsed_ms: 10,
    })).toBeNull();
  });

  it('rejects a forged detector, a wrong version, and a non-boolean verdict', () => {
    const base = {
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'bridge_report',
      paint_observed: true,
      visible_element_count: 1,
      elapsed_ms: 10,
    };

    expect(parsePreviewFirstPaintMessage({ ...base, detector: 'host_observer' })).toBeNull();
    expect(parsePreviewFirstPaintMessage({ ...base, detector: 'anything' })).toBeNull();
    expect(parsePreviewFirstPaintMessage({ ...base, version: 2 })).toBeNull();
    expect(parsePreviewFirstPaintMessage({ ...base, paint_observed: 'true' })).toBeNull();
    expect(parsePreviewFirstPaintMessage({ ...base, elapsed_ms: '10' })).toBeNull();
    expect(parsePreviewFirstPaintMessage({ ...base, attach_token: 12 })).toBeNull();
    expect(parsePreviewFirstPaintMessage(null)).toBeNull();
  });

  it('never emits the promotion gate the product removed', () => {
    const detail = previewFirstPaintPhaseDetail({
      type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
      version: PREVIEW_FIRST_PAINT_PROTOCOL_VERSION,
      detector: 'raf_probe',
      paint_observed: true,
      visible_element_count: 2,
      elapsed_ms: 90,
      attach_token: 'attach-7',
    });

    // The phase detail carries measurement only. Identity echoes stay on the
    // transport so nothing routes an opaque host token into analytics, and no
    // field here can be read as permission to promote, retain, or discard.
    expect(Object.keys(detail).sort()).toEqual([
      'detector',
      'paint_observed',
      'visible_element_count',
    ]);
  });
});
