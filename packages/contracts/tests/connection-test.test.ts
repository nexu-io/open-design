import { describe, expect, it } from 'vitest';
import {
  isAllowlistedInternalHost,
  isLoopbackApiHost,
  validateBaseUrl,
} from '../src/api/connectionTest';

describe('provider base URL validation', () => {
  it('allows public endpoints and loopback local providers', () => {
    for (const baseUrl of [
      'https://api.openai.com/v1',
      'http://localhost:11434/v1',
      'http://127.0.0.1:11434/v1',
      'http://[::1]:11434/v1',
      'http://[::ffff:127.0.0.1]:11434/v1',
    ]) {
      expect(validateBaseUrl(baseUrl).error).toBeUndefined();
    }
  });

  it('identifies trailing-dot FQDN forms of loopback hosts as loopback', () => {
    // Direct assertion against isLoopbackApiHost — validateBaseUrl alone
    // can't distinguish "passed because loopback" from "passed because
    // not blocked", which the previous test revision conflated.
    for (const host of ['localhost.', '127.0.0.1.', '127.0.0.5.']) {
      expect(isLoopbackApiHost(host)).toBe(true);
    }
  });

  it('blocks private, link-local, CGNAT, multicast, and mapped forms', () => {
    for (const baseUrl of [
      'http://0.0.0.0:11434/v1',
      'http://10.0.0.5:11434/v1',
      'http://100.64.0.1:11434/v1',
      'http://169.254.169.254/latest/meta-data',
      'http://172.16.0.5:11434/v1',
      'http://192.168.1.5:11434/v1',
      'http://224.0.0.1:11434/v1',
      'http://[::]/v1',
      'http://[fd00::1]:11434/v1',
      'http://[fe80::1]:11434/v1',
      'http://[::ffff:192.168.1.5]:11434/v1',
    ]) {
      expect(validateBaseUrl(baseUrl)).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });

  it('blocks trailing-dot FQDN bypass across every blocked IPv4 range', () => {
    // The trailing-dot strip in normalizeBracketedIpv6 must apply to
    // every range isBlockedIpv4 covers — not just the three originally
    // demonstrated. One representative case per range:
    for (const baseUrl of [
      'http://0.0.0.0.:11434/v1',              // 0.0.0.0/8
      'http://10.0.0.5.:11434/v1',             // 10/8
      'http://100.64.0.1.:11434/v1',           // 100.64/10 CGNAT
      'http://169.254.169.254./latest/meta-data', // 169.254/16 metadata
      'http://172.16.0.5.:11434/v1',           // 172.16/12
      'http://192.168.1.5.:11434/v1',          // 192.168/16
      'http://224.0.0.1.:11434/v1',            // multicast >=224
    ]) {
      expect(validateBaseUrl(baseUrl)).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });
});

// Issue #3225: operators running an internally-hosted LLM gateway (e.g. a
// VPN-only LiteLLM endpoint on an RFC1918 address) need an explicit,
// opt-in escape hatch from the default-deny SSRF guard. The allowlist
// loosens the block ONLY for hosts the operator has deliberately declared
// trusted; everything else stays blocked.
describe('internal-host allowlist (#3225)', () => {
  it('matches a private IPv4 literal against the allowlist (case/format-insensitive)', () => {
    expect(isAllowlistedInternalHost('10.0.0.5', ['10.0.0.5'])).toBe(true);
    // Trailing-dot FQDN form and uppercase must normalize before matching,
    // mirroring the normalization the block-list itself applies.
    expect(isAllowlistedInternalHost('10.0.0.5.', ['10.0.0.5'])).toBe(true);
    expect(isAllowlistedInternalHost('LiteLLM.Internal.Corp', ['litellm.internal.corp'])).toBe(true);
  });

  it('does not match hosts that are absent from the allowlist', () => {
    expect(isAllowlistedInternalHost('10.0.0.6', ['10.0.0.5'])).toBe(false);
    expect(isAllowlistedInternalHost('169.254.169.254', ['10.0.0.5'])).toBe(false);
    expect(isAllowlistedInternalHost('10.0.0.5', [])).toBe(false);
    expect(isAllowlistedInternalHost('10.0.0.5', undefined)).toBe(false);
  });

  it('permits an allowlisted private IPv4 base URL that would otherwise be blocked', () => {
    // Without the allowlist this is a hard block (proven by the suites above).
    expect(validateBaseUrl('http://10.0.0.5:4000/v1')).toMatchObject({
      error: 'Internal IPs blocked',
      forbidden: true,
    });
    // With the operator-declared allowlist the same URL is permitted.
    const allowed = validateBaseUrl('http://10.0.0.5:4000/v1', {
      allowedInternalHosts: ['10.0.0.5'],
    });
    expect(allowed.error).toBeUndefined();
    expect(allowed.parsed?.hostname).toBe('10.0.0.5');
  });

  it('keeps blocking private hosts that are not on the allowlist', () => {
    // A non-empty allowlist must not become a blanket bypass: an address
    // the operator did not list stays blocked.
    expect(
      validateBaseUrl('http://192.168.1.5:4000/v1', {
        allowedInternalHosts: ['10.0.0.5'],
      }),
    ).toMatchObject({ error: 'Internal IPs blocked', forbidden: true });
  });
});
