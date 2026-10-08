import { spawnSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';

import { spawnEnvForAgent } from '../../src/runtimes/env.js';
import { StockSearchConfigError, stockSearch } from '../../src/media/stock-search.js';

it('keeps stock keys out of the AMR child after inherited, configured and proxy environment merges', () => {
  const inherited = { PEXELS_API_KEY: 'inherited-test-key', AMR_API_KEY: 'model-test-key' };
  const configured = { PIXABAY_API_KEY: 'configured-test-key', pexels_api_key: 'cased-test-key' };
  const proxy = { Pixabay_Api_Key: 'proxy-test-key', HTTPS_PROXY: 'http://127.0.0.1:1234' };
  const env = spawnEnvForAgent('amr', inherited, configured, proxy);
  const child = spawnSync(process.execPath, ['-e', `
    const stockKeys = Object.keys(process.env).filter(key =>
      ['PEXELS_API_KEY', 'PIXABAY_API_KEY'].includes(key.toUpperCase()));
    process.stdout.write(JSON.stringify({ stockKeys, hasModelKey: !!process.env.AMR_API_KEY }));
  `], { env, encoding: 'utf8' });

  expect(child.status).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual({ stockKeys: [], hasModelKey: true });
  expect(env.HTTPS_PROXY).toBe(proxy.HTTPS_PROXY);
  expect(inherited.PEXELS_API_KEY).toBe('inherited-test-key');
  expect(configured.PIXABAY_API_KEY).toBe('configured-test-key');
  expect(proxy.Pixabay_Api_Key).toBe('proxy-test-key');
});

it('cannot use stock-search with the keyless child environment and makes no API request', async () => {
  const env = spawnEnvForAgent('amr', { PEXELS_API_KEY: 'inherited-test-key' }, {}, {});
  const fetch = vi.fn();
  await expect(stockSearch({
    cwd: process.cwd(), env, fetch,
    slots: [{ id: 'dish', query: 'mapo tofu' }],
  })).rejects.toBeInstanceOf(StockSearchConfigError);
  expect(fetch).not.toHaveBeenCalled();
});
