import { describe, expect, it, afterEach } from 'vitest';
import {
  isProxyTrusted,
  extractEffectivePeer,
  effectivePeerFromReq,
} from '../src/proxy-trust.js';

const PREVIOUS = process.env.OD_TRUST_PROXY;

afterEach(() => {
  if (PREVIOUS === undefined) delete process.env.OD_TRUST_PROXY;
  else process.env.OD_TRUST_PROXY = PREVIOUS;
});

describe('isProxyTrusted', () => {
  it('returns false when OD_TRUST_PROXY is not set', () => {
    delete process.env.OD_TRUST_PROXY;
    expect(isProxyTrusted()).toBe(false);
  });

  it('returns true for accepted values', () => {
    for (const val of ['1', 'true', 'yes', 'cloudflare', 'nginx', 'caddy', 'tunnel']) {
      process.env.OD_TRUST_PROXY = val;
      expect(isProxyTrusted(), `OD_TRUST_PROXY=${val}`).toBe(true);
    }
  });

  it('returns false for unrecognized values', () => {
    process.env.OD_TRUST_PROXY = 'nope';
    expect(isProxyTrusted()).toBe(false);
  });
});

describe('extractEffectivePeer', () => {
  it('returns remoteAddress when proxy is not trusted', () => {
    delete process.env.OD_TRUST_PROXY;
    expect(extractEffectivePeer('127.0.0.1', '10.0.0.1')).toBe('127.0.0.1');
  });

  it('uses X-Forwarded-For when proxy is trusted', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('picks the leftmost (first) IP from X-Forwarded-For', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', '10.0.0.1, 172.16.0.1')).toBe('10.0.0.1');
  });

  it('falls back to remoteAddress when X-Forwarded-For is empty', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', '')).toBe('127.0.0.1');
    expect(extractEffectivePeer('127.0.0.1', undefined)).toBe('127.0.0.1');
  });

  it('returns empty string when both are undefined', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer(undefined, undefined)).toBe('');
  });
});

describe('effectivePeerFromReq', () => {
  it('returns remoteAddress when no proxy trust', () => {
    delete process.env.OD_TRUST_PROXY;
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '10.0.0.1' },
    };
    expect(effectivePeerFromReq(req)).toBe('127.0.0.1');
  });

  it('returns forwarded IP when proxy is trusted', () => {
    process.env.OD_TRUST_PROXY = 'cloudflare';
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.5' },
    };
    expect(effectivePeerFromReq(req)).toBe('203.0.113.5');
  });

  it('handles missing x-forwarded-for gracefully', () => {
    process.env.OD_TRUST_PROXY = 'nginx';
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    };
    expect(effectivePeerFromReq(req)).toBe('127.0.0.1');
  });
});
