// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { createToolsDevSuite } from '@/tools-dev/runtime';
import { createSmokeSuite } from '@/vitest/suite';

// The compatibility boundary for switching the dev default to Turbopack is a
// restart against a retained namespace: a real dev session keeps one dist dir
// for days, so "starts once in a clean dir" proves nothing about the reuse a
// contributor actually gets. Two starts, one namespace, compiled in between.
const RESTART_TEST_TIMEOUT_MS = 300_000;

async function loadWebRoute(url: string | null | undefined): Promise<void> {
  if (url == null) throw new Error('web sidecar did not expose a status URL');
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`web sidecar answered HTTP ${response.status} for ${url}: ${body.slice(0, 200)}`);
}

describe('e2e tools-dev web bundler restart', () => {
  test(
    'keeps the dev bundler across a restart that retains the namespace',
    async () => {
      const suite = await createSmokeSuite('web-bundler-restart');
      const runtime = createToolsDevSuite(suite);
      // Undefine the harness-wide default so Turbopack can only reach the
      // sidecar through the tools-dev-side injection under test.
      const env = { OD_WEB_DEV_BUNDLER: undefined };
      let success = false;
      let failure: unknown;
      try {
        const first = await runtime.startWeb(env);
        expect(first.web?.status.bundler).toBe('turbopack');
        await loadWebRoute(first.web?.status.url);

        await runtime.stopWeb(env);

        const second = await runtime.startWeb(env);
        expect(second.web?.status.bundler).toBe('turbopack');
        await loadWebRoute(second.web?.status.url);
        expect(second.web?.pid).not.toBe(first.web?.pid);

        success = true;
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        await runtime.stopWeb().catch(() => {});
        console.log(await suite.finalize({ success, error: failure }));
      }
    },
    RESTART_TEST_TIMEOUT_MS,
  );
});
