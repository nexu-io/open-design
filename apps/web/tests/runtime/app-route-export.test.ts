import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as spaShellRoute from '../../app/[[...slug]]/page';

const WEB_ROOT = dirname(fileURLToPath(new URL('../../..', import.meta.url)));

async function loadNextConfig() {
  vi.resetModules();
  return (await import('../../next.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.OD_WEB_DIST_DIR;
  vi.resetModules();
});

describe('SPA shell export route', () => {
  it('uses an injected build identity without generating another identity', async () => {
    vi.stubEnv('OD_WEB_BUILD_ID', 'a'.repeat(64));
    const first = await loadNextConfig();
    const second = await loadNextConfig();
    expect(await first.generateBuildId?.()).toBe('a'.repeat(64));
    expect(await second.generateBuildId?.()).toBe('a'.repeat(64));
    vi.stubEnv('OD_WEB_BUILD_ID', 'b'.repeat(64));
    expect(await (await loadNextConfig()).generateBuildId?.()).toBe('b'.repeat(64));
  });

  it('preserves the default build identity when no override is supplied', async () => {
    vi.stubEnv('OD_WEB_BUILD_ID', undefined);
    expect((await loadNextConfig()).generateBuildId).toBeUndefined();
  });

  it.each(['', ' ', '../build', 'build\nother'])('rejects an invalid explicit build identity %j', async (value) => {
    vi.stubEnv('OD_WEB_BUILD_ID', value);
    await expect(loadNextConfig()).rejects.toThrow('OD_WEB_BUILD_ID');
  });

  it('stays compatible with static export builds', async () => {
    const nextConfig = await loadNextConfig();
    expect(nextConfig.output).toBe('export');
    expect(nextConfig.distDir).toBeUndefined();
    expect('dynamicParams' in spaShellRoute).toBe(false);
    expect(spaShellRoute.generateStaticParams()).toEqual([{ slug: [] }]);
  });

  it('keeps an explicit dist dir override even when static export is selected', async () => {
    const configuredDistDir = resolve(WEB_ROOT, '.tmp', 'vitest-next');
    process.env.OD_WEB_DIST_DIR = configuredDistDir;

    const nextConfig = await loadNextConfig();

    expect(nextConfig.output).toBe('export');
    expect(nextConfig.distDir).toContain('vitest-next');
  });

  it('treats an empty dist dir override as unset for static export builds', async () => {
    process.env.OD_WEB_DIST_DIR = '';

    const nextConfig = await loadNextConfig();

    expect(nextConfig.output).toBe('export');
    expect(nextConfig.distDir).toBeUndefined();
  });
});
