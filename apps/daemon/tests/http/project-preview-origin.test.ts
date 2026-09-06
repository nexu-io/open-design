import { describe, expect, it } from 'vitest';
import {
  buildProjectPreviewOrigin,
  parseProjectPreviewOriginAuthority,
} from '../../src/http/project-preview-origin.js';

describe('project preview origin authority', () => {
  it('round-trips normal and powered scope origins on the daemon port', () => {
    const scope = '503c9882-b6e7-468a-bb7b-dbb82bf955ca';

    for (const profile of ['normal', 'powered'] as const) {
      const origin = buildProjectPreviewOrigin(scope, profile, 17456);
      expect(origin).not.toBeNull();
      expect(parseProjectPreviewOriginAuthority(new URL(origin!).host, 17456)).toEqual({
        profile,
        scope,
        port: '17456',
      });
    }
  });

  it('accepts a trailing localhost dot without weakening scope validation', () => {
    expect(parseProjectPreviewOriginAuthority('n-abcdefgh.localhost.:17456', 17456)).toEqual({
      profile: 'normal',
      scope: 'abcdefgh',
      port: '17456',
    });
  });

  it.each([
    ['localhost:17456', 17456],
    ['n-short.localhost:17456', 17456],
    ['n-abcdefgh.example.com:17456', 17456],
    ['n-abcdefgh.localhost:17457', 17456],
    ['n-abcdefgh.localhost', 17456],
    ['n-abcdefgh.localhost:17456/path', 17456],
    ['user@n-abcdefgh.localhost:17456', 17456],
    ['n-abcdefgh.localhost:17456,localhost:17456', 17456],
  ])('rejects non-preview or ambiguous authority %s', (host, port) => {
    expect(parseProjectPreviewOriginAuthority(host, port)).toBeNull();
  });

  it('rejects invalid builder input', () => {
    expect(buildProjectPreviewOrigin('short', 'normal', 17456)).toBeNull();
    expect(buildProjectPreviewOrigin('abcdefgh', 'normal', 0)).toBeNull();
    expect(buildProjectPreviewOrigin('abcdefgh', 'powered', 70_000)).toBeNull();
  });
});
