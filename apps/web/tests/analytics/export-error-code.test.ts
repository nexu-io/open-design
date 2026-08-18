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

  it('prefers a SPECIFIC structured .code over message classification', () => {
    const err = Object.assign(new Error('desktop renderer unavailable: something else'), {
      code: 'SIDECAR_UNKNOWN_MESSAGE',
    });
    expect(exportErrorCode(err)).toBe('SIDECAR_UNKNOWN_MESSAGE');
  });

  it('does not let a generic envelope .code outrank message classification', () => {
    // This case used to assert the opposite. `UPSTREAM_UNAVAILABLE` is the
    // daemon's catch-all envelope for the whole 502 branch, not a
    // classification — letting it win meant the version-skew fingerprint in the
    // message was thrown away in favour of a code that says nothing. The daemon
    // now forwards the sidecar's real code (see
    // apps/daemon/src/import-export-routes.ts), so a specific code still wins;
    // only the generic wrappers defer to the message.
    const err = Object.assign(
      new Error('desktop renderer unavailable: unknown desktop sidecar message: render-slides'),
      { code: 'UPSTREAM_UNAVAILABLE' },
    );
    expect(exportErrorCode(err)).toBe('DESKTOP_SIDECAR_UNKNOWN_MESSAGE');
  });

  it('falls back to the error name for unclassified failures', () => {
    expect(exportErrorCode(new TypeError('boom'))).toBe('TypeError');
    // Was asserted as 'Error' — a message carrying an HTTP status is now
    // reported as that status, which is strictly more attributable than the
    // name of the base Error class.
    expect(exportErrorCode(new Error('export request failed (500)'))).toBe('HTTP_500');
    // A genuinely signal-free message still falls back to the name.
    expect(exportErrorCode(new Error('export request failed'))).toBe('Error');
  });

  it('returns UNKNOWN for non-Error throwables', () => {
    expect(exportErrorCode('nope')).toBe('UNKNOWN');
    expect(exportErrorCode(undefined)).toBe('UNKNOWN');
  });
});

/**
 * Export failures run at 8.1% (210 in 24h across 48 devices). Before these
 * branches every capture-stage and transport failure fell through to
 * `err.name`, which is the literal string "Error" for anything thrown as a
 * plain Error — the single largest export bucket named nothing at all.
 */
describe('exportErrorCode — non-sidecar failures', () => {
  it('does not let a generic daemon envelope code outrank message classification', () => {
    // The daemon wraps unrelated failures in BAD_REQUEST/INTERNAL. Those are
    // envelopes, not classifications, so the message must still win.
    const err = Object.assign(new Error('export timed out after 60s'), { code: 'BAD_REQUEST' });
    expect(exportErrorCode(err)).toBe('TIMEOUT');
  });

  it('separates the capture-stage failures from each other', () => {
    expect(exportErrorCode(new Error('nothing was captured'))).toBe('EMPTY_CAPTURE');
    expect(exportErrorCode(new Error('canvas is not available'))).toBe('CANVAS_UNAVAILABLE');
    expect(exportErrorCode(new Error('unreadable response'))).toBe('UNREADABLE_RESPONSE');
    expect(exportErrorCode(new Error('invalid data url'))).toBe('INVALID_DATA_URL');
    expect(exportErrorCode(new Error('download failed'))).toBe('DOWNLOAD_FAILED');
  });

  it('names transport failures instead of leaving them as "Error"', () => {
    expect(exportErrorCode(new Error('fetch failed'))).toBe('NETWORK');
    expect(exportErrorCode(new Error('getaddrinfo ENOTFOUND host'))).toBe('NETWORK');
    expect(exportErrorCode(new Error('ETIMEDOUT'))).toBe('TIMEOUT');
    expect(exportErrorCode(new Error('429 Too Many Requests'))).toBe('RATE_LIMITED');
    expect(exportErrorCode(new Error('unauthorized'))).toBe('FORBIDDEN');
  });

  it('falls back to the HTTP status when the message only carries one', () => {
    expect(exportErrorCode(new Error('render service replied 503'))).toBe('HTTP_503');
  });

  it('still yields a usable code for a bare Error', () => {
    // Cannot do better than the name here, but it must not be empty.
    expect(exportErrorCode(new Error(''))).toBe('Error');
    expect(exportErrorCode('a string throw')).toBe('UNKNOWN');
  });
});
