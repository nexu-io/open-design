import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  assertStaticBuildMatchesBasePath,
  forwardedPrefixMatchesBasePath,
  resolveDeploymentPathConfig,
} from '../../src/http/deployment-path.js';

function request(host = 'app.example.test') {
  return {
    get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined),
    protocol: 'https',
  };
}

describe('deployment path config', () => {
  it('validates the public URL path and builds browser-visible URLs', () => {
    const config = resolveDeploymentPathConfig({
      OD_PUBLIC_BASE_URL: 'https://app.example.test/open-design/',
      OD_WEB_BASE_PATH: '/open-design',
    });

    expect(config.publicOrigin(request())).toBe('https://app.example.test');
    expect(config.publicBaseUrl(request())).toBe('https://app.example.test/open-design');
    expect(config.publicUrl(request(), '/api/mcp/oauth/callback')).toBe(
      'https://app.example.test/open-design/api/mcp/oauth/callback',
    );
  });

  it('rejects a mismatched public URL path', () => {
    expect(() => resolveDeploymentPathConfig({
      OD_PUBLIC_BASE_URL: 'https://app.example.test/other',
      OD_WEB_BASE_PATH: '/open-design',
    })).toThrow(/does not match/);
  });

  it('accepts an optional matching forwarded prefix and rejects drift', () => {
    expect(forwardedPrefixMatchesBasePath('/open-design/', '/open-design')).toBe(true);
    expect(forwardedPrefixMatchesBasePath('/', '')).toBe(true);
    expect(forwardedPrefixMatchesBasePath(undefined, '/open-design')).toBe(true);
    expect(forwardedPrefixMatchesBasePath('/other', '/open-design')).toBe(false);
    expect(forwardedPrefixMatchesBasePath('https://example.test/open-design', '/open-design')).toBe(false);
  });

  it('requires a matching static build manifest for a non-root deployment', () => {
    const directory = mkdtempSync(join(tmpdir(), 'open-design-base-path-'));
    try {
      expect(() => assertStaticBuildMatchesBasePath(directory, '/open-design')).toThrow(/manifest/);
      writeFileSync(join(directory, '.open-design-build.json'), JSON.stringify({ schemaVersion: 1, basePath: '/open-design' }));
      expect(() => assertStaticBuildMatchesBasePath(directory, '/open-design')).not.toThrow();
      writeFileSync(join(directory, '.open-design-build.json'), JSON.stringify({ schemaVersion: 1, basePath: '' }));
      expect(() => assertStaticBuildMatchesBasePath(directory, '/open-design')).toThrow(/does not match/);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
