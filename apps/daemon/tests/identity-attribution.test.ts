import { describe, expect, it } from 'vitest';
import { attributionFromIdentity } from '../src/identity/attribution.js';
import type { Identity } from '../src/identity/types.js';

const IDENTITY: Identity = {
  id: 'local:default',
  displayName: 'Local User',
  source: 'local-fallback',
};

describe('attributionFromIdentity', () => {
  it('returns all-null when identity is null', () => {
    expect(attributionFromIdentity(null)).toEqual({
      actorIdentityId: null,
      actorDisplayName: null,
      actorSourceIp: null,
    });
  });

  it('returns all-null when identity is undefined', () => {
    expect(attributionFromIdentity(undefined)).toEqual({
      actorIdentityId: null,
      actorDisplayName: null,
      actorSourceIp: null,
    });
  });

  it('extracts id and displayName from identity, source IP null without req', () => {
    expect(attributionFromIdentity(IDENTITY)).toEqual({
      actorIdentityId: 'local:default',
      actorDisplayName: 'Local User',
      actorSourceIp: null,
    });
  });

  it('reads source IP from req.ip (Express trust-proxy-resolved client IP)', () => {
    // Express populates req.ip according to the app's `trust proxy`
    // setting. When trust-proxy is unset, req.ip is the raw socket
    // peer. When trust-proxy is configured, req.ip is the resolved
    // forwarded IP from trusted hops. Either way, the helper trusts
    // req.ip as the right answer.
    const req = { ip: '100.113.57.7', socket: { remoteAddress: '127.0.0.1' } };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('100.113.57.7');
  });

  it('falls back to socket.remoteAddress when req.ip is undefined (synthetic test contexts)', () => {
    // For test contexts that don't go through Express, req.ip won't
    // be populated. The helper degrades gracefully to socket.remoteAddress
    // so existing tests / non-Express callers still get a sensible answer.
    const req = { socket: { remoteAddress: '127.0.0.1' } };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('127.0.0.1');
  });

  it('SECURITY — never reads X-Forwarded-For header (spoofable when trust-proxy is unset)', () => {
    // P0-fix #15 — before the fix this helper parsed X-Forwarded-For
    // directly from req.headers, making `actor_source_ip` trivially
    // spoofable by direct callers (Express's trust-proxy was never
    // consulted). After the fix, X-Forwarded-For is invisible to this
    // helper; only Express's `req.ip` (which honors trust-proxy) is
    // trusted. This test simulates an attacker sending a spoofed XFF
    // with no trust-proxy configured — the value MUST be ignored.
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.99' }, // attacker-controlled
      // req.ip is what Express resolved with trust-proxy unset:
      // the real socket peer, NOT the spoofed XFF.
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };
    // The helper sees only req.ip — the spoofed header is invisible.
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('127.0.0.1');
    // Sanity: the spoofed value DOES NOT appear in any field
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).not.toBe('203.0.113.99');
  });

  it('honors req.ip even when an attacker-spoofed X-Forwarded-For is present (trust-proxy enforced upstream)', () => {
    // Mirrors the post-fix expectation: when trust-proxy IS configured
    // (e.g., 'loopback' for a same-host Tailscale Serve), Express
    // resolves req.ip from the forwarded chain. The helper trusts
    // that resolution. Tests this by populating req.ip with the
    // "Express resolved" value and showing the helper uses it.
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.99' }, // ignored by us
      ip: '100.113.57.7', // Express's resolved client IP (post-trust-proxy)
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('100.113.57.7');
  });

  it('returns null source IP when neither req.ip nor socket has a usable value', () => {
    const req = { socket: { remoteAddress: null } };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBeNull();
  });

  it('treats empty-string req.ip as missing, falls back to socket', () => {
    const req = { ip: '', socket: { remoteAddress: '127.0.0.1' } };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('127.0.0.1');
  });
});
