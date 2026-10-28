import { afterEach, expect, it, vi } from 'vitest';
import { fetchVelaLoginStatus } from '../../src/providers/daemon';
vi.hoisted(() => vi.resetModules());
const host = vi.hoisted(() => ({ desktop: true }));
vi.mock('@open-design/host', () => ({ getOpenDesignHost: () => host.desktop ? { client: { type: 'desktop' } } : null }));
vi.mock('../../src/i18n', () => ({ detectInitialLocale: () => 'zh-CN' }));
afterEach(() => vi.unstubAllGlobals());
it('delivers the desktop locale on the first auth read before analytics has initialized', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ loggedIn: true }) }));
  vi.stubGlobal('fetch', fetcher);
  await fetchVelaLoginStatus();
  expect(fetcher).toHaveBeenCalledWith('/api/integrations/vela/status', expect.objectContaining({ headers: { 'x-od-touchpoint-locale': 'zh-CN' } }));
});
it('sends no warmup hint from a plain browser', async () => {
  host.desktop = false;
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ loggedIn: true }) }));
  vi.stubGlobal('fetch', fetcher);
  await fetchVelaLoginStatus();
  expect(fetcher).toHaveBeenCalledWith('/api/integrations/vela/status', { cache: 'no-store' });
  host.desktop = true;
});
