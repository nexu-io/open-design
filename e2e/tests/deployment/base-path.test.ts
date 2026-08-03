// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { createSmokeSuite } from '@/vitest/suite';

const BASE_PATH = '/open-design';

describe('deployment base path', () => {
  test('[P1] serves the browser and daemon surfaces under a fixed path', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('deployment-base-path');

    await suite.with.toolsDev(
      async ({ runtime, start, status, webUrl }) => {
        const daemonUrl = start.daemon?.status.url;
        if (daemonUrl == null) throw new Error('tools-dev did not expose the daemon URL');

        const page = await fetch(new URL(`${BASE_PATH}/`, webUrl));
        expect(page.status).toBe(200);
        expect(page.url).toContain(`${BASE_PATH}/`);
        const html = await page.text();
        expect(html).toContain(`${BASE_PATH}/_next/`);
        expect(html).not.toContain(`${BASE_PATH}${BASE_PATH}/`);

        const webHealth = await fetch(new URL(`${BASE_PATH}/api/health`, webUrl));
        expect(webHealth.status).toBe(200);
        const webHealthBody = (await webHealth.json()) as { ok?: unknown };
        expect(webHealthBody.ok).toBe(true);

        const prefixedHealth = await fetch(new URL(`${BASE_PATH}/api/health`, daemonUrl));
        expect(prefixedHealth.status).toBe(200);

        const rootHealth = await fetch(new URL('/api/health', daemonUrl));
        expect(rootHealth.status).toBe(200);

        const frame = await fetch(new URL(`${BASE_PATH}/frames/iphone-15-pro.html`, daemonUrl));
        expect(frame.status).toBe(200);

        const matchingForwardedPrefix = await fetch(new URL(`${BASE_PATH}/api/health`, daemonUrl), {
          headers: { 'x-forwarded-prefix': BASE_PATH },
        });
        expect(matchingForwardedPrefix.status).toBe(200);

        const driftingForwardedPrefix = await fetch(new URL(`${BASE_PATH}/api/health`, daemonUrl), {
          headers: { 'x-forwarded-prefix': '/different-prefix' },
        });
        expect(driftingForwardedPrefix.status).toBe(400);
        expect(
          ((await driftingForwardedPrefix.json()) as { error?: { code?: string } }).error?.code,
        ).toBe('INVALID_FORWARDED_PREFIX');

        await suite.report.json('summary.json', {
          basePath: BASE_PATH,
          daemonUrl,
          namespace: suite.namespace,
          runtime: {
            daemonPort: runtime.daemonPort,
            webPort: runtime.webPort,
            webUrl,
          },
          status,
        });
      },
      { env: { OD_WEB_BASE_PATH: BASE_PATH } },
    );
  });
});
