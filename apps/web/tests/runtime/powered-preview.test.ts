import { describe, expect, it } from 'vitest';

import { buildProjectPoweredFileUrl } from '@open-design/contracts';
import {
  resolvePoweredBaseOrigin,
  swapLoopbackHost,
} from '../../src/runtime/powered-preview';

describe('swapLoopbackHost', () => {
  it('swaps 127.0.0.1 <-> localhost, preserving scheme and port', () => {
    expect(swapLoopbackHost('http://127.0.0.1:17456')).toBe('http://localhost:17456');
    expect(swapLoopbackHost('http://localhost:17456')).toBe('http://127.0.0.1:17456');
  });

  it('leaves non-loopback hosts unchanged (no safe swap exists)', () => {
    expect(swapLoopbackHost('http://192.168.1.20:8080')).toBe('http://192.168.1.20:8080');
    expect(swapLoopbackHost('https://example.com')).toBe('https://example.com');
  });

  it('returns the input unchanged when it is not a valid URL', () => {
    expect(swapLoopbackHost('not a url')).toBe('not a url');
  });
});

describe('resolvePoweredBaseOrigin', () => {
  it('returns the host-swapped loopback origin for powered previews', () => {
    expect(resolvePoweredBaseOrigin('http://127.0.0.1:17456')).toBe('http://localhost:17456');
    expect(resolvePoweredBaseOrigin('http://localhost:17456')).toBe('http://127.0.0.1:17456');
  });

  it('normalizes a base with a trailing path down to its origin', () => {
    expect(resolvePoweredBaseOrigin('http://127.0.0.1:17456/')).toBe('http://localhost:17456');
  });

  it('returns null when no preview-only host swap exists', () => {
    expect(resolvePoweredBaseOrigin('http://192.168.1.20:17456')).toBeNull();
    expect(resolvePoweredBaseOrigin('https://example.com')).toBeNull();
  });

  it('returns null for an unparseable base', () => {
    expect(resolvePoweredBaseOrigin('::::')).toBeNull();
  });
});

describe('buildProjectPoweredFileUrl', () => {
  it('joins an absolute cross-origin base with the /powered/ route', () => {
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', 'index.html')).toBe(
      'http://127.0.0.1:17456/api/projects/p1/powered/index.html',
    );
  });

  it('encodes each path segment but keeps slashes as separators', () => {
    expect(
      buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p 1', 'sub dir/app.html'),
    ).toBe('http://127.0.0.1:17456/api/projects/p%201/powered/sub%20dir/app.html');
  });

  it('strips a trailing slash from the base origin', () => {
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456/', 'p1', 'a.html')).toBe(
      'http://127.0.0.1:17456/api/projects/p1/powered/a.html',
    );
  });

  it('returns null for empty / non-string file paths', () => {
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', '')).toBeNull();
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', undefined)).toBeNull();
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', '///')).toBeNull();
  });
});
