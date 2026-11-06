import { defineConfig, mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  resolve: { alias: [{ find: /^@hyperframes\/studio$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) }] },
  esbuild: { define: { 'import.meta.hot': 'undefined' } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Real Chrome benches are retained separately; this command runs unit/DOM suites.
    exclude: ['src/**/*.browser.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    maxWorkers: 4,
    // DOM environments own storage; Node 25+ otherwise shadows it with a server global.
    execArgv: ['--no-experimental-webstorage'],
    environmentOptions: {
      // Upstream edit tests populate about:blank composition documents themselves.
      happyDOM: { settings: { enableIframePageLoading: true } },
    },
  },
}));
