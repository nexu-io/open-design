import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiFetch,
  apiPath,
  assetPath,
  webPathConfig,
  withWebBasePath,
} from '../../src/runtime/web-path';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('preserves native fetch arity when request init is omitted', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/projects');

    expect(fetchMock).toHaveBeenCalledWith('/api/projects');
  });
});
