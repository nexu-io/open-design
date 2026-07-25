import { describe, it, expect } from 'vitest';
import { assertExternalAssetUrl, validateBaseUrlResolved } from '../src/connectionTest.js';
import type { DnsLookupFn } from '../src/connectionTest.js';

describe('assertExternalAssetUrl — loopback rejection (issue #5478)', () => {
  it('rejects 127.0.0.1 asset URLs', async () => {
    const result = await assertExternalAssetUrl('http://127.0.0.1:8080/evil.png');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('blocked');
  });

  it('rejects localhost asset URLs', async () => {
    const result = await assertExternalAssetUrl('http://localhost:3000/image.png');
    expect(result.ok).toBe(false);
  });

  it('rejects ::1 asset URLs', async () => {
    const result = await assertExternalAssetUrl('http://[::1]:8080/video.mp4');
    expect(result.ok).toBe(false);
  });

  it('rejects 127.x.x.x range (not just 127.0.0.1)', async () => {
    const result = await assertExternalAssetUrl('http://127.1.2.3:9999/data');
    expect(result.ok).toBe(false);
  });

  it('accepts legitimate public CDN asset URLs', async () => {
    const result = await assertExternalAssetUrl('https://cdn.example.com/image.png');
    expect(result.ok).toBe(true);
  });

  it('accepts https asset URLs with paths', async () => {
    const result = await assertExternalAssetUrl('https://api.gateway.com/v1/assets/abc123.png');
    expect(result.ok).toBe(true);
  });

  it('rejects empty URLs', async () => {
    const result = await assertExternalAssetUrl('');
    expect(result.ok).toBe(false);
  });

  it('rejects non-string URLs', async () => {
    const result = await assertExternalAssetUrl(null as unknown as string);
    expect(result.ok).toBe(false);
  });
});

describe('validateBaseUrlResolved — DNS-resolved loopback (issue #5478)', () => {
  // A DNS mock that resolves any hostname to a loopback address
  const dnsResolvesLoopback: DnsLookupFn = async (_hostname: string) => [
    { address: '127.0.0.1', family: 4 },
  ];

  const dnsResolvesMixed: DnsLookupFn = async (_hostname: string) => [
    { address: '93.184.216.34', family: 4 },  // public IP
    { address: '127.0.0.1', family: 4 },       // loopback
  ];

  it('rejects DNS-resolved loopback when forbidLoopback is set', async () => {
    const result = await validateBaseUrlResolved(
      'http://attacker-controlled.example.com/evil.png',
      dnsResolvesLoopback,
      { forbidLoopback: true },
    );
    expect(result.error).toBeDefined();
    expect(result.forbidden).toBe(true);
    expect(result.error).toContain('loopback');
  });

  it('rejects when any resolved address is loopback (mixed results)', async () => {
    const result = await validateBaseUrlResolved(
      'http://cdn-lookalike.example.com/data',
      dnsResolvesMixed,
      { forbidLoopback: true },
    );
    expect(result.forbidden).toBe(true);
    expect(result.error).toContain('loopback');
  });

  it('allows DNS-resolved loopback when forbidLoopback is NOT set (provider endpoints)', async () => {
    // User-configured provider endpoints should still work with local gateways
    const result = await validateBaseUrlResolved(
      'http://local-gateway.internal/v1',
      dnsResolvesLoopback,
      { forbidLoopback: false },
    );
    expect(result.forbidden).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.parsed).toBeDefined();
  });

  it('rejects DNS-resolved ::1 when forbidLoopback is set', async () => {
    const dnsResolvesV6Loopback: DnsLookupFn = async (_hostname: string) => [
      { address: '::1', family: 6 },
    ];
    const result = await validateBaseUrlResolved(
      'http://safe-looking.name/video.mp4',
      dnsResolvesV6Loopback,
      { forbidLoopback: true },
    );
    expect(result.forbidden).toBe(true);
    expect(result.error).toContain('loopback');
  });
});
