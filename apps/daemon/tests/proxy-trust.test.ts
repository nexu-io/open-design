import { describe, expect, it, afterEach } from 'vitest';
import {
  isProxyTrusted,
  extractEffectivePeer,
  effectivePeerFromReq,
  isLocalManagementRequest,
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

  it('uses X-Forwarded-For when proxy is trusted and peer is loopback', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('picks the leftmost (first) IP from X-Forwarded-For', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', '10.0.0.1, 172.16.0.1')).toBe('10.0.0.1');
  });

  it('fails closed when X-Forwarded-For is empty string under proxy trust', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', '')).toBe('');
  });

  it('returns empty string when X-Forwarded-For is absent under proxy trust (fail closed)', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('127.0.0.1', undefined)).toBe('');
  });

  it('returns empty string when both are undefined', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer(undefined, undefined)).toBe('');
  });
});

describe('extractEffectivePeer — spoofing prevention', () => {
  it('ignores X-Forwarded-For from a non-loopback direct peer (LAN attacker)', () => {
    process.env.OD_TRUST_PROXY = '1';
    // A direct LAN client spoofs X-Forwarded-For: 127.0.0.1 to bypass auth.
    // The TCP peer is 192.168.1.50 (not loopback), so the header must be ignored.
    expect(extractEffectivePeer('192.168.1.50', '127.0.0.1')).toBe('192.168.1.50');
  });

  it('ignores X-Forwarded-For from a non-loopback IPv6 peer', () => {
    process.env.OD_TRUST_PROXY = 'cloudflare';
    expect(extractEffectivePeer('2001:db8::1', '127.0.0.1')).toBe('2001:db8::1');
  });

  it('honors X-Forwarded-For from ::1 (IPv6 loopback)', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('::1', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('honors X-Forwarded-For from IPv4-mapped IPv6 loopback', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(extractEffectivePeer('::ffff:127.0.0.1', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('honors X-Forwarded-For from 127.x.x.x (loopback range)', () => {
    process.env.OD_TRUST_PROXY = 'nginx';
    expect(extractEffectivePeer('127.0.0.1', '203.0.113.5')).toBe('203.0.113.5');
    expect(extractEffectivePeer('127.1.2.3', '203.0.113.5')).toBe('203.0.113.5');
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

  it('returns forwarded IP when proxy is trusted and peer is loopback', () => {
    process.env.OD_TRUST_PROXY = 'cloudflare';
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.5' },
    };
    expect(effectivePeerFromReq(req)).toBe('203.0.113.5');
  });

  it('ignores forwarded IP when peer is not loopback', () => {
    process.env.OD_TRUST_PROXY = 'cloudflare';
    const req = {
      socket: { remoteAddress: '192.168.1.100' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };
    expect(effectivePeerFromReq(req)).toBe('192.168.1.100');
  });

  it('returns empty string when XFF absent under proxy trust (fail closed)', () => {
    process.env.OD_TRUST_PROXY = 'nginx';
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    };
    expect(effectivePeerFromReq(req)).toBe('');
  });

  it('fails closed when XFF is empty string under proxy trust', () => {
    process.env.OD_TRUST_PROXY = 'nginx';
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '' },
    };
    expect(effectivePeerFromReq(req)).toBe('');
  });
});

describe('isLocalManagementRequest', () => {
  it('returns true for direct loopback without proxy trust', () => {
    delete process.env.OD_TRUST_PROXY;
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    })).toBe(true);
  });

  it('returns false for non-loopback peer', () => {
    delete process.env.OD_TRUST_PROXY;
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '192.168.1.5' },
      headers: {},
    })).toBe(false);
  });

  it('returns true when proxy trusted and XFF shows loopback client', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })).toBe(true);
  });

  it('returns false when proxy trusted and XFF shows remote client', () => {
    process.env.OD_TRUST_PROXY = 'cloudflare';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.5' },
    })).toBe(false);
  });

  it('returns false when proxy trusted but XFF absent (fail closed)', () => {
    process.env.OD_TRUST_PROXY = 'nginx';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    })).toBe(false);
  });

  it('fails closed when proxy trusted but XFF is empty string', () => {
    process.env.OD_TRUST_PROXY = 'caddy';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '' },
    })).toBe(false);
  });

  it('fails closed when proxy trusted but XFF is whitespace only', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '  ' },
    })).toBe(false);
  });
});

describe('regression: proxy trust helpers fail closed without XFF', () => {
  it('rejects management request when proxy trusted but no XFF', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    })).toBe(false);
    expect(extractEffectivePeer('127.0.0.1', undefined)).toBe('');
  });

  it('rejects proxied remote client accessing management endpoint', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.5' },
    })).toBe(false);
    expect(extractEffectivePeer('127.0.0.1', '203.0.113.5')).toBe('203.0.113.5');
  });

  it('allows direct loopback when proxy trust is off', () => {
    delete process.env.OD_TRUST_PROXY;
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: {},
    })).toBe(true);
    expect(extractEffectivePeer('127.0.0.1', undefined)).toBe('127.0.0.1');
  });

  it('allows proxied loopback client when XFF shows loopback', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })).toBe(true);
  });

  it('fails closed when XFF is present but empty or garbage', () => {
    process.env.OD_TRUST_PROXY = '1';
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '' },
    })).toBe(false);
    expect(isLocalManagementRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '  ' },
    })).toBe(false);
    expect(extractEffectivePeer('127.0.0.1', '')).toBe('');
  });
});
