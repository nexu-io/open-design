import { describe, it, expect } from 'vitest';
import {
  assertExternalAssetUrl,
  assertAndFetchExternalAsset,
  validateBaseUrlResolved,
  createAssetValidatingLookup,
} from '../src/connectionTest.js';
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

  it('accepts legitimate public IP asset URLs', async () => {
    const result = await assertExternalAssetUrl('http://93.184.216.34/image.png');
    expect(result.ok).toBe(true);
  });

  it('accepts https asset URLs with paths (IP literal)', async () => {
    const result = await assertExternalAssetUrl('https://198.51.100.1/v1/assets/abc123.png');
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

describe('DNS rebinding — resolved-address pinning (issue #5478)', () => {
  it('validateBaseUrlResolved attaches validated addresses to the result', async () => {
    const dns: DnsLookupFn = async () => [{ address: '93.184.216.34', family: 4 }];
    const result = await validateBaseUrlResolved(
      'http://cdn.example.com/image.png',
      dns,
      { forbidLoopback: true },
    );
    expect(result.parsed).toBeDefined();
    expect(result.resolvedAddresses).toBeDefined();
    expect(result.resolvedAddresses).toHaveLength(1);
    expect(result.resolvedAddresses![0]!.address).toBe('93.184.216.34');
  });

  it('resolved addresses capture the public IP from the first lookup only', async () => {
    let callCount = 0;
    const rebindDns: DnsLookupFn = async () => {
      callCount++;
      if (callCount <= 1) return [{ address: '93.184.216.34', family: 4 }];
      return [{ address: '127.0.0.1', family: 4 }];
    };

    const result = await validateBaseUrlResolved(
      'http://rebind.attacker.com/image.png',
      rebindDns,
      { forbidLoopback: true },
    );

    expect(result.parsed).toBeDefined();
    expect(result.error).toBeUndefined();

    const addresses = result.resolvedAddresses!;
    expect(addresses).toHaveLength(1);
    expect(addresses[0]!.address).toBe('93.184.216.34');
    expect(addresses[0]!.address).not.toBe('127.0.0.1');

    expect(callCount).toBe(1);
  });

  it('multiple validated addresses are all attached (round-robin DNS)', async () => {
    const dns: DnsLookupFn = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.35', family: 4 },
    ];
    const result = await validateBaseUrlResolved(
      'http://cdn.example.com/image.png',
      dns,
      { forbidLoopback: true },
    );
    expect(result.resolvedAddresses).toBeDefined();
    expect(result.resolvedAddresses).toHaveLength(2);
    expect(result.resolvedAddresses!.map((a) => a.address)).toEqual(
      expect.arrayContaining(['93.184.216.34', '93.184.216.35']),
    );
  });

  it('IP-literal URLs do not get resolvedAddresses (no DNS lookup needed)', async () => {
    const result = await validateBaseUrlResolved(
      'http://93.184.216.34/image.png',
      async () => [{ address: '127.0.0.1', family: 4 }],
      { forbidLoopback: true },
    );
    expect(result.parsed).toBeDefined();
    expect(result.resolvedAddresses).toBeUndefined();
  });
});

describe('DNS lookup failure — fail-closed behavior (issue #5478)', () => {
  it('validateBaseUrlResolved fails closed when DNS throws and forbidLoopback is true', async () => {
    const throwingDns: DnsLookupFn = async () => {
      throw new Error('ENOTFOUND');
    };
    const result = await validateBaseUrlResolved(
      'http://attacker.example.com/image.png',
      throwingDns,
      { forbidLoopback: true },
    );
    expect(result.forbidden).toBe(true);
    expect(result.error).toContain('DNS resolution failed');
  });

  it('validateBaseUrlResolved returns sync result when DNS throws and forbidLoopback is false', async () => {
    // Provider endpoints should still return success on DNS failure — the
    // actual fetch will surface the resolution error.
    const throwingDns: DnsLookupFn = async () => {
      throw new Error('ENOTFOUND');
    };
    const result = await validateBaseUrlResolved(
      'http://provider.example.com/v1',
      throwingDns,
      { forbidLoopback: false },
    );
    expect(result.forbidden).toBeUndefined();
    expect(result.parsed).toBeDefined();
  });

  it('assertExternalAssetUrl returns ok=false when DNS throws', async () => {
    // The default DNS lookup will be used and may succeed for example.com,
    // so test the fail-closed path through validateBaseUrlResolved directly.
    const throwingDns: DnsLookupFn = async () => {
      throw new Error('SERVFAIL');
    };
    const result = await validateBaseUrlResolved(
      'http://fail-then-rebind.attacker.test/image.png',
      throwingDns,
      { forbidLoopback: true },
    );
    expect(result.forbidden).toBe(true);
    expect(result.error).toContain('DNS resolution failed');
  });
});

describe('createAssetValidatingLookup — connect-time guard (issue #5478)', () => {
  // Mock dns.lookup implementation that returns loopback
  const lookupReturnsLoopback = (
    _hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address: string, family: number) => void,
  ): void => {
    cb(null, '127.0.0.1', 4);
  };

  // Mock dns.lookup that returns a public address
  const lookupReturnsPublic = (
    _hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address: string, family: number) => void,
  ): void => {
    cb(null, '93.184.216.34', 4);
  };

  // Mock dns.lookup that returns an RFC1918 address
  const lookupReturnsInternal = (
    _hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address: string, family: number) => void,
  ): void => {
    cb(null, '10.0.0.5', 4);
  };

  // Mock dns.lookup that returns metadata service IP
  const lookupReturnsMetadata = (
    _hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address: string, family: number) => void,
  ): void => {
    cb(null, '169.254.169.254', 4);
  };

  it('rejects loopback addresses at connect time', () => {
    const lookup = createAssetValidatingLookup(
      lookupReturnsLoopback as never,
    );
    return new Promise<void>((resolve) => {
      lookup('attacker.test', {}, (...args: unknown[]) => {
        const err = args[0] as Error | null;
        expect(err).toBeInstanceOf(Error);
        expect(err!.message).toContain('non-public');
        resolve();
      });
    });
  });

  it('rejects RFC1918 addresses at connect time', () => {
    const lookup = createAssetValidatingLookup(
      lookupReturnsInternal as never,
    );
    return new Promise<void>((resolve) => {
      lookup('internal.test', {}, (...args: unknown[]) => {
        const err = args[0] as Error | null;
        expect(err).toBeInstanceOf(Error);
        expect(err!.message).toContain('non-public');
        resolve();
      });
    });
  });

  it('rejects cloud metadata service IP (169.254.169.254)', () => {
    const lookup = createAssetValidatingLookup(
      lookupReturnsMetadata as never,
    );
    return new Promise<void>((resolve) => {
      lookup('metadata.test', {}, (...args: unknown[]) => {
        const err = args[0] as Error | null;
        expect(err).toBeInstanceOf(Error);
        expect(err!.message).toContain('non-public');
        resolve();
      });
    });
  });

  it('allows public addresses through', () => {
    const lookup = createAssetValidatingLookup(
      lookupReturnsPublic as never,
    );
    return new Promise<void>((resolve) => {
      lookup('cdn.example.com', {}, (...args: unknown[]) => {
        const err = args[0] as Error | null;
        const address = args[1];
        expect(err).toBeNull();
        expect(address).toBe('93.184.216.34');
        resolve();
      });
    });
  });
});

describe('assertAndFetchExternalAsset — fail-closed paths (issue #5478)', () => {
  it('throws on blocked loopback URL', async () => {
    await expect(
      assertAndFetchExternalAsset('http://127.0.0.1:8080/evil.png'),
    ).rejects.toThrow('blocked');
  });

  it('throws on blocked localhost URL', async () => {
    await expect(
      assertAndFetchExternalAsset('http://localhost:3000/image.png'),
    ).rejects.toThrow('blocked');
  });

  it('throws on empty URL', async () => {
    await expect(
      assertAndFetchExternalAsset(''),
    ).rejects.toThrow();
  });

  it('throws on internal IP URL', async () => {
    await expect(
      assertAndFetchExternalAsset('http://10.0.0.5/image.png'),
    ).rejects.toThrow('blocked');
  });

  it('throws on metadata service IP URL', async () => {
    await expect(
      assertAndFetchExternalAsset('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow('blocked');
  });
});

describe('assertAndFetchExternalAsset — TOCTOU with injectable lookup (issue #5478)', () => {
  it('fetch carries dispatcher so connect-time rebind to loopback is refused', async () => {
    // The validation lookup returns a public IP, so assertExternalAssetUrl passes.
    // The fetch stub receives the request init — assert that `dispatcher` is
    // attached, proving the validating Agent would refuse a connect-time rebind.
    const publicLookup: DnsLookupFn = async () => [{ address: '93.184.216.34', family: 4 }];
    let capturedInit: RequestInit | undefined;
    const stubFetch = async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response('ok', { status: 200 });
    };

    await assertAndFetchExternalAsset(
      'http://rebind.example.com/asset.png',
      {},
      publicLookup,
      stubFetch as never,
    );
    // The dispatcher must be present so production fetch uses the validating Agent
    expect(capturedInit).toBeDefined();
    expect((capturedInit as { dispatcher?: unknown }).dispatcher).toBeDefined();
    expect(capturedInit?.redirect).toBe('error');
  });

  it('rejects without invoking fetch when validation lookup throws', async () => {
    // Attacker makes the validation lookup throw (ENOTFOUND / SERVFAIL).
    // assertAndFetchExternalAsset should throw before fetch is ever called.
    const throwingLookup: DnsLookupFn = async () => {
      throw new Error('SERVFAIL');
    };
    let fetchCalled = false;
    const stubFetch = async () => {
      fetchCalled = true;
      return new Response('should not reach', { status: 200 });
    };

    await expect(
      assertAndFetchExternalAsset(
        'http://fail-then-rebind.example.com/asset.png',
        {},
        throwingLookup,
        stubFetch as never,
      ),
    ).rejects.toThrow('blocked');

    expect(fetchCalled).toBe(false);
  });

  it('IP literal skips DNS validation and calls fetch directly', async () => {
    let fetchCalled = false;
    const stubFetch = async (_url: string, init?: RequestInit) => {
      fetchCalled = true;
      expect(init?.redirect).toBe('error');
      return new Response('ok', { status: 200 });
    };

    const resp = await assertAndFetchExternalAsset(
      'http://93.184.216.34/asset.png',
      {},
      undefined,
      stubFetch as never,
    );
    expect(fetchCalled).toBe(true);
    expect(resp.ok).toBe(true);
  });
});
