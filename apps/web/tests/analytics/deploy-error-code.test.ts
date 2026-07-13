import { describe, expect, it } from 'vitest';

import { deployErrorCode } from '../../src/analytics/deploy-error-code';

describe('deployErrorCode', () => {
  it('prefers a structured .code over message classification', () => {
    const err = Object.assign(new Error('502 Bad Gateway'), { code: 'UPSTREAM_UNAVAILABLE' });
    expect(deployErrorCode(err)).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('ignores generic envelope codes and falls through to status/message bucketing', () => {
    // The daemon wraps non-404 provider failures as `BAD_REQUEST` (404 as
    // `FILE_NOT_FOUND`) — those carry no signal and must not shortcut the real
    // status/message classification. Safety net in case one reaches here.
    expect(deployErrorCode(Object.assign(new Error('403 Forbidden'), { code: 'BAD_REQUEST' }))).toBe('FORBIDDEN');
    expect(deployErrorCode(Object.assign(new Error('deploy failed (500)'), { code: 'BAD_REQUEST' }))).toBe('HTTP_500');
    expect(deployErrorCode(Object.assign(new Error('file not found'), { code: 'FILE_NOT_FOUND' }))).toBe('NOT_FOUND');
  });

  it('returns UNKNOWN for non-Error throwables', () => {
    expect(deployErrorCode('nope')).toBe('UNKNOWN');
    expect(deployErrorCode(undefined)).toBe('UNKNOWN');
    expect(deployErrorCode(null)).toBe('UNKNOWN');
  });

  it('classifies the daemon↔desktop sidecar version skew before renderer-unavailable', () => {
    const err = new Error(
      'desktop renderer unavailable: unknown desktop sidecar message: render-slides',
    );
    expect(deployErrorCode(err)).toBe('DESKTOP_SIDECAR_UNKNOWN_MESSAGE');
  });

  it('classifies a plain renderer-unavailable failure separately from the skew', () => {
    expect(deployErrorCode(new Error('desktop renderer unavailable: connection refused'))).toBe(
      'DESKTOP_RENDERER_UNAVAILABLE',
    );
  });

  it('buckets transport failures as NETWORK', () => {
    expect(deployErrorCode(new Error('fetch failed'))).toBe('NETWORK');
    expect(deployErrorCode(new TypeError('Failed to fetch'))).toBe('NETWORK');
    expect(deployErrorCode(new Error('connect ECONNREFUSED 1.2.3.4:443'))).toBe('NETWORK');
    expect(deployErrorCode(new Error('getaddrinfo ENOTFOUND api.cloudflare.com'))).toBe('NETWORK');
  });

  it('buckets timeouts as TIMEOUT', () => {
    expect(deployErrorCode(new Error('deploy request timed out after 30s'))).toBe('TIMEOUT');
    expect(deployErrorCode(new Error('ETIMEDOUT'))).toBe('TIMEOUT');
  });

  it('buckets rate limiting as RATE_LIMITED', () => {
    expect(deployErrorCode(new Error('Cloudflare API rate limit exceeded'))).toBe('RATE_LIMITED');
    expect(deployErrorCode(new Error('request failed with 429'))).toBe('RATE_LIMITED');
  });

  it('buckets auth failures as FORBIDDEN (keyword wins over bare status)', () => {
    expect(deployErrorCode(new Error('403 Forbidden'))).toBe('FORBIDDEN');
    expect(deployErrorCode(new Error('401 Unauthorized'))).toBe('FORBIDDEN');
    expect(deployErrorCode(new Error('Invalid API token'))).toBe('FORBIDDEN');
  });

  it('buckets remaining HTTP failures by status code', () => {
    expect(deployErrorCode(new Error('Vercel returned 500 Internal Server Error'))).toBe('HTTP_500');
    expect(deployErrorCode(new Error('deploy failed (502 Bad Gateway)'))).toBe('HTTP_502');
  });

  it('classifies not-found messages without an explicit status', () => {
    expect(deployErrorCode(new Error('project not found'))).toBe('NOT_FOUND');
  });

  it('does not misread a non-status number as an HTTP code', () => {
    // Multi-digit ids / durations must not collapse to HTTP_xxx.
    expect(deployErrorCode(new Error('deploy 50012 failed'))).toBe('Error');
    expect(deployErrorCode(new Error('took 404ms'))).toBe('Error');
  });

  it('falls back to the error name for a truly unclassified failure (documents the residual)', () => {
    expect(deployErrorCode(new Error('something went wrong'))).toBe('Error');
    expect(deployErrorCode(new RangeError('boom'))).toBe('RangeError');
  });
});
