import { describe, expect, it } from 'vitest';
import {
  byokAllowlistFromResponse,
  isLoopbackApiHost,
  parseByokPrivateAllowlistFromEnv,
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

describe('BYOK private target allowlist (#2986)', () => {
  it('parses host and CIDR entries from env vars', () => {
    const allowlist = parseByokPrivateAllowlistFromEnv({
      OD_BYOK_PRIVATE_HOST_ALLOWLIST: 'host.docker.internal, LiteLLM.internal.',
      OD_BYOK_PRIVATE_CIDR_ALLOWLIST: '192.168.0.0/16, 10.0.0.0/8',
    });
    expect([...allowlist.hostnames]).toEqual(['host.docker.internal', 'litellm.internal']);
    expect(allowlist.cidrs).toEqual(['192.168.0.0/16', '10.0.0.0/8']);
  });

  it('allows allowlisted hostnames and CIDRs while keeping default blocks', () => {
    const allowlist = byokAllowlistFromResponse({
      hostnames: ['host.docker.internal'],
      cidrs: ['192.168.0.0/16'],
    });
    expect(validateBaseUrl('http://host.docker.internal:1234/v1', { allowlist }).error).toBeUndefined();
    expect(validateBaseUrl('http://192.168.1.50:4000/v1', { allowlist }).error).toBeUndefined();
    expect(validateBaseUrl('http://10.0.0.5:11434/v1', { allowlist })).toMatchObject({
      error: 'Internal IPs blocked',
      forbidden: true,
    });
    expect(validateBaseUrl('http://10.0.0.5:11434/v1')).toMatchObject({
      error: 'Internal IPs blocked',
      forbidden: true,
    });
  });
});
