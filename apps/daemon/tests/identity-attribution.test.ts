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

  it('reads source IP from X-Forwarded-For (first comma-separated entry)', () => {
    const req = {
      headers: { 'x-forwarded-for': '100.113.57.7, 10.0.0.1, 172.16.0.1' },
      socket: { remoteAddress: '::1' },
    };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('100.113.57.7');
  });

  it('falls back to socket.remoteAddress when no X-Forwarded-For', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('127.0.0.1');
  });

  it('strips whitespace from X-Forwarded-For entries', () => {
    const req = {
      headers: { 'x-forwarded-for': '  100.113.57.7  ' },
      socket: { remoteAddress: '::1' },
    };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('100.113.57.7');
  });

  it('treats empty X-Forwarded-For as missing, falls back to socket', () => {
    const req = {
      headers: { 'x-forwarded-for': '' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('127.0.0.1');
  });

  it('returns null source IP when neither header nor socket has a usable value', () => {
    const req = { headers: {}, socket: { remoteAddress: null } };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBeNull();
  });

  it('ignores non-string X-Forwarded-For (e.g., array from multiple headers)', () => {
    const req = {
      headers: { 'x-forwarded-for': ['100.113.57.7', '10.0.0.1'] as unknown as string },
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(attributionFromIdentity(IDENTITY, req).actorSourceIp).toBe('127.0.0.1');
  });
});
