import { describe, expect, it } from 'vitest';

import {
  normalizeDaemonProxyOriginHeader,
  resolveDaemonProxyTarget,
} from '../sidecar/server';

describe('resolveDaemonProxyTarget', () => {
  it('proxies allowlisted relative paths to the daemon origin', () => {
    const target = resolveDaemonProxyTarget('http://127.0.0.1:7456', '/api/projects?limit=10');

    expect(target?.href).toBe('http://127.0.0.1:7456/api/projects?limit=10');
  });

  it('does not let absolute request URLs replace the daemon origin', () => {
    const target = resolveDaemonProxyTarget(
      'http://127.0.0.1:7456',
      'http://169.254.169.254/api/latest/meta-data?token=1',
    );

    expect(target?.href).toBe('http://127.0.0.1:7456/api/latest/meta-data?token=1');
  });

  it('rejects non-daemon paths', () => {
    expect(resolveDaemonProxyTarget('http://127.0.0.1:7456', '/settings')).toBeNull();
  });
});

describe('normalizeDaemonProxyOriginHeader', () => {
  it('normalizes the current web origin to the daemon origin', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'http://127.0.0.1:3000',
        webPort: 3000,
      }),
    ).toBe('http://127.0.0.1:7456');
  });

  it('accepts localhost as an equivalent loopback web origin', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'http://localhost:3000',
        webPort: 3000,
      }),
    ).toBe('http://127.0.0.1:7456');
  });

  it('does not rewrite unrelated browser origins', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'https://example.com',
        webPort: 3000,
      }),
    ).toBe('https://example.com');
  });

  it('preserves absent and null origins for daemon policy to handle', () => {
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: undefined,
        webPort: 3000,
      }),
    ).toBeUndefined();
    expect(
      normalizeDaemonProxyOriginHeader({
        daemonOrigin: 'http://127.0.0.1:7456',
        origin: 'null',
        webPort: 3000,
      }),
    ).toBe('null');
  });
});
