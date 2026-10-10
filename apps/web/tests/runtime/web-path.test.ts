import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function paths(basePath: string) {
  vi.stubEnv('NEXT_PUBLIC_OD_WEB_BASE_PATH', basePath);
  vi.resetModules();
  return import('../../src/runtime/web-path');
}

describe('web path helpers', () => {
  it('keeps the root deployment compatible', async () => {
    const { webPathConfig, apiPath, assetPath } = await paths('');
    expect(webPathConfig.basePath).toBe('');
    expect(apiPath('/projects')).toBe('/api/projects');
    expect(assetPath('/app-icon.svg')).toBe('/app-icon.svg');
  });

  it('uses the configured build-time base path for requests and public assets', async () => {
    const { apiFetch, apiPath, assetPath } = await paths('/open-design');
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(apiPath('/projects')).toBe('/open-design/api/projects');
    expect(assetPath('/app-icon.svg')).toBe('/open-design/app-icon.svg');
    await apiFetch('/api/projects');
    await apiFetch('/open-design/api/projects', { method: 'GET' });
    expect(fetchMock.mock.calls).toEqual([
      ['/open-design/api/projects'],
      ['/open-design/api/projects', { method: 'GET' }],
    ]);
  });

  it('preserves authored relative and external URLs', async () => {
    const { apiFetch } = await paths('/open-design');
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    for (const url of ['images/photo.png', 'https://example.com/api/data', '//example.com/image.png']) {
      await apiFetch(url);
      expect(fetchMock).toHaveBeenLastCalledWith(url);
    }
  });
});
