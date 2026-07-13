import { describe, expect, it } from 'vitest';

import { apiPath, assetPath, webPathConfig, withWebBasePath } from '../../src/runtime/web-path';

describe('web path helpers', () => {
  it('keeps the root deployment compatible', () => {
    expect(webPathConfig.basePath).toBe('');
    expect(apiPath('/projects')).toBe('/api/projects');
    expect(assetPath('/app-icon.svg')).toBe('/app-icon.svg');
  });

  it('uses the build-time base path when provided', () => {
    // The Vitest process intentionally exercises the default here. Prefix
    // behavior is pinned by the pure package tests and the Next build/e2e
    // matrix, because Vite cannot re-evaluate NEXT_PUBLIC_* substitutions.
    expect(withWebBasePath('/api/projects')).toBe('/api/projects');
  });
});
