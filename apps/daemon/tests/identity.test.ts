import { describe, expect, it } from 'vitest';
import {
  LocalFallbackProvider,
  resolveIdentity,
} from '../src/identity/types.js';

// A minimal request shape that satisfies resolveIdentity's structural
// type without instantiating a real Express Request.
const emptyReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };

describe('LocalFallbackProvider', () => {
  it('returns a default placeholder identity when env is empty', () => {
    // `email` is intentionally absent (not just undefined) under
    // exactOptionalPropertyTypes — the conditional-spread in the
    // provider only includes the property when populated.
    expect(LocalFallbackProvider.resolve(emptyReq, {})).toEqual({
      id: 'local:default',
      displayName: 'Local User',
      source: 'local-fallback',
    });
  });

  it('honors OD_LOCAL_IDENTITY for the display name', () => {
    expect(LocalFallbackProvider.resolve(emptyReq, { OD_LOCAL_IDENTITY: 'Weston' })?.displayName)
      .toBe('Weston');
  });

  it('honors OD_LOCAL_IDENTITY_EMAIL when set, leaves email undefined when unset', () => {
    expect(LocalFallbackProvider.resolve(emptyReq, { OD_LOCAL_IDENTITY_EMAIL: 'weston@example.com' })?.email)
      .toBe('weston@example.com');
    expect(LocalFallbackProvider.resolve(emptyReq, {})?.email).toBeUndefined();
  });

  it('treats whitespace-only env values as unset', () => {
    const id = LocalFallbackProvider.resolve(emptyReq, {
      OD_LOCAL_IDENTITY: '   ',
      OD_LOCAL_IDENTITY_EMAIL: '\t\n ',
    });
    expect(id?.displayName).toBe('Local User');
    expect(id?.email).toBeUndefined();
  });

  it('preserves the placeholder id regardless of env customization', () => {
    expect(LocalFallbackProvider.resolve(emptyReq, {
      OD_LOCAL_IDENTITY: 'Anyone',
      OD_LOCAL_IDENTITY_EMAIL: 'anyone@example.com',
    })?.id).toBe('local:default');
  });
});

describe('resolveIdentity', () => {
  it('returns a valid Identity even for a request with no relevant headers', () => {
    const id = resolveIdentity(emptyReq, {});
    expect(id.id).toBe('local:default');
    expect(id.source).toBe('local-fallback');
  });

  it('uses process.env by default when no env is passed', () => {
    // We don't assert specific values from the ambient env (that would
    // make the test environment-dependent); we just verify the function
    // returns a structurally valid Identity.
    const id = resolveIdentity(emptyReq);
    expect(typeof id.id).toBe('string');
    expect(typeof id.displayName).toBe('string');
    expect(typeof id.source).toBe('string');
  });

  it('reflects the OD_LOCAL_IDENTITY env var through the resolver', () => {
    expect(resolveIdentity(emptyReq, { OD_LOCAL_IDENTITY: 'Test User' }).displayName)
      .toBe('Test User');
  });
});
