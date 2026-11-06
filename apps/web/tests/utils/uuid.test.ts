import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUUID } from '../../src/utils/uuid';

// RFC 4122 v4 format: 8-4-4-4-12 hex with version `4` (third group) and
// variant `10xx` (first nibble of fourth group is 8/9/a/b).
const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('randomUUID (issue #849)', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    // vitest's jsdom env supplies a real `crypto` object — restore it
    // after every test so later runs don't inherit the mocks.
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('returns a v4 UUID under the secure-context happy path (tier 1)', () => {
    // jsdom's crypto already has randomUUID — exercise the live path.
    const uuid = randomUUID();
    expect(uuid).toMatch(V4_RE);
  });

  it('delegates to crypto.randomUUID when available (tier 1)', () => {
    const sentinel = '11111111-1111-4111-8111-111111111111';
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => sentinel,
        // getRandomValues still present so a regression that flipped
        // tier order would silently pass — the equality check below
        // is what catches it.
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });
    expect(randomUUID()).toBe(sentinel);
  });

  it('falls back to crypto.getRandomValues when randomUUID is missing (tier 2)', () => {
    // Non-secure context shape: `crypto.randomUUID` is undefined but
    // `crypto.getRandomValues` is still around. This is the exact LAN-IP
    // / Docker self-hosting scenario the bug report describes.
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: undefined,
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });

    const uuid = randomUUID();
    expect(uuid).toMatch(V4_RE);
    // A real RFC 4122 v4 UUID has the version nibble fixed at `4`
    // (first char of group 3) and variant bits 10xx in the first
    // nibble of group 4 (one of 8/9/a/b). The regex above checks
    // both, but assert them explicitly so a future refactor that
    // accidentally returns a v1/v3/v5 UUID under tier 2 fails with
    // a more pointed error.
    const [, , versionGroup, variantGroup] = uuid.split('-');
    expect(versionGroup![0]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(variantGroup![0]!.toLowerCase());
  });

  it('falls back to Math.random when neither crypto API is available (tier 3)', () => {
    // Strip crypto entirely. Real environments without Web Crypto are
    // rare in 2026 (it's been baseline for years), but the helper has
    // to keep behaving rather than throw — the IDs we produce are
    // session-scoped and don't need crypto-quality entropy for that
    // narrow fallback.
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const uuid = randomUUID();
    expect(uuid).toMatch(V4_RE);
  });

  it('does not throw when crypto.randomUUID is missing (the #849 root cause)', () => {
    // The original bug: calling `crypto.randomUUID()` directly in a
    // non-secure context throws TypeError, the surrounding try/catch
    // returns null, and the Create button silently no-ops. Pin that
    // the helper never throws even when the native call would.
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: undefined,
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });
    expect(() => randomUUID()).not.toThrow();
  });

  it('produces unique values across many calls under tier 2', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: undefined,
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(randomUUID());
    expect(seen.size).toBe(1000);
  });
});
