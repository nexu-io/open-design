import { describe, expect, it } from 'vitest';
import {
  createProjectPreviewScopeRegistry,
  isLoopbackHostname,
  isLoopbackPeerAddress,
  localOriginFromHeader,
  normalizeLocalAuthority,
  parseProjectPreviewAssetPath,
} from '../../src/runtimes/local-request.js';

describe('local request helpers', () => {
  it('normalizes safe loopback authorities and rejects ambiguous values', () => {
    expect(normalizeLocalAuthority(' [::1]:8787 ')).toEqual({ hostname: '[::1]', port: '8787' });
    expect(normalizeLocalAuthority('localhost')).toEqual({ hostname: 'localhost', port: '' });
    expect(normalizeLocalAuthority('localhost/path')).toBeNull();
    expect(normalizeLocalAuthority('user@localhost')).toBeNull();
  });

  it('recognizes loopback hostnames and peer address forms', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('127.42.0.1')).toBe(true);
    expect(isLoopbackHostname('192.168.1.1')).toBe(false);
    expect(isLoopbackPeerAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackPeerAddress('::1')).toBe(true);
    expect(isLoopbackPeerAddress('10.0.0.1')).toBe(false);
  });

  it('accepts only exact loopback origins', () => {
    expect(localOriginFromHeader('http://localhost:8787')).toBe('http://localhost:8787');
    expect(localOriginFromHeader('https://[::1]:8787/')).toBe('https://[::1]:8787');
    expect(localOriginFromHeader('https://localhost:8787/path')).toBeNull();
    expect(localOriginFromHeader('https://example.com')).toBeNull();
    expect(localOriginFromHeader('http://localhost:8787, https://example.com')).toBeNull();
  });

  it('parses preview asset identity without accepting malformed escapes', () => {
    expect(parseProjectPreviewAssetPath('/projects/my%20project/preview/scope/index.html')).toEqual({
      projectId: 'my project',
      scope: 'scope',
    });
    expect(parseProjectPreviewAssetPath('/projects/%E0%A4%A/preview/scope/index.html')).toBeNull();
    expect(parseProjectPreviewAssetPath('/projects/project/preview/scope')).toBeNull();
  });

  it('scopes preview access to the minted project and expiry window', () => {
    const registry = createProjectPreviewScopeRegistry();
    const scope = registry.mint('project-a');
    expect(registry.validate('project-a', scope)).toBe(true);
    expect(registry.validate('project-b', scope)).toBe(false);
    expect(registry.validate('project-a', 'other')).toBe(false);
  });
});
