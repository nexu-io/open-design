import { describe, expect, it } from 'vitest';
import {
  normalizeClientRequestId,
  normalizeUpstreamCode,
  parseApiFailureDetail,
} from '../src/api/failure-detail.js';

describe('parseApiFailureDetail', () => {
  it('keeps known tokens and bounded numbers', () => {
    expect(parseApiFailureDetail({
      stage: 'push', reason: 'upstream_http', upstreamStatus: 503, upstreamCode: 'resource_hub_unavailable',
    })).toEqual({ stage: 'push', reason: 'upstream_http', upstreamStatus: 503, upstreamCode: 'resource_hub_unavailable' });
  });

  it('rejects unknown stages or reasons', () => {
    expect(parseApiFailureDetail({ stage: 'push', reason: 'see the logs' })).toBeUndefined();
    expect(parseApiFailureDetail({ stage: 'upload', reason: 'timeout' })).toBeUndefined();
    expect(parseApiFailureDetail('push')).toBeUndefined();
    expect(parseApiFailureDetail([])).toBeUndefined();
  });

  it('drops optional fields that are not token-shaped', () => {
    expect(parseApiFailureDetail({
      stage: 'provider', reason: 'provider_rejected', upstreamStatus: 42, upstreamCode: 'has space',
    })).toEqual({ stage: 'provider', reason: 'provider_rejected' });
  });
});

describe('token normalizers', () => {
  it('accepts numeric provider codes as strings', () => {
    expect(normalizeUpstreamCode(6003)).toBe('6003');
    expect(normalizeUpstreamCode('https://x/y')).toBeUndefined();
  });

  it('accepts only token-shaped request ids', () => {
    expect(normalizeClientRequestId('4b1c2d3e-aaaa-bbbb-cccc-000000000001')).toBe('4b1c2d3e-aaaa-bbbb-cccc-000000000001');
    expect(normalizeClientRequestId('short')).toBeUndefined();
    expect(normalizeClientRequestId('has spaces in it')).toBeUndefined();
  });
});
