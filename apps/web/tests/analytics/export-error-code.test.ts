import { describe, expect, it } from 'vitest';

import { exportErrorCode } from '../../src/analytics/export-error-code';

describe('exportErrorCode', () => {
  it('classifies the daemon↔desktop sidecar version skew from its wrapped message', () => {
    // The exact string the daemon surfaces when a freshly-updated daemon sends
    // `render-slides` to an older desktop that predates the message. Before this
    // helper it was reported as the generic "Error", hiding the skew in analytics.
    const err = new Error(
      'desktop renderer unavailable: unknown desktop sidecar message: render-slides',
    );
    expect(exportErrorCode(err)).toBe('DESKTOP_SIDECAR_UNKNOWN_MESSAGE');
  });

  it('classifies a plain renderer-unavailable failure separately from the skew', () => {
    expect(exportErrorCode(new Error('desktop renderer unavailable: connection refused'))).toBe(
      'DESKTOP_RENDERER_UNAVAILABLE',
    );
  });

  it('prefers a structured .code over message classification', () => {
    const err = Object.assign(new Error('desktop renderer unavailable: unknown desktop sidecar message: render-slides'), {
      code: 'UPSTREAM_UNAVAILABLE',
    });
    expect(exportErrorCode(err)).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('falls back to the error name for unclassified failures', () => {
    expect(exportErrorCode(new TypeError('boom'))).toBe('TypeError');
    expect(exportErrorCode(new Error('export request failed (500)'))).toBe('Error');
  });

  it('returns UNKNOWN for non-Error throwables', () => {
    expect(exportErrorCode('nope')).toBe('UNKNOWN');
    expect(exportErrorCode(undefined)).toBe('UNKNOWN');
  });
});
