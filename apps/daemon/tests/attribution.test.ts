import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { AnalyticsService } from '../src/analytics.js';
import { createAttributionService } from '../src/routes/attribution.js';
import { readInstallationFile, writeInstallationFile } from '../src/installation.js';
import { readAppConfig, type AppConfigPrefs, writeAppConfig } from '../src/app-config.js';

function analyticsStub(): AnalyticsService {
  return {
    capture: vi.fn(),
    captureSafety: vi.fn(async () => undefined),
    mergeAnonymousPerson: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
  };
}

async function withTempData<T>(fn: (dataDir: string) => Promise<T>): Promise<T> {
  const dataDir = await mkdtemp(join(tmpdir(), 'od-attribution-'));
  try {
    return await fn(dataDir);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

describe('download attribution service', () => {
  it('stores a pending token before telemetry consent', async () => {
    await withTempData(async (dataDir) => {
      const analytics = analyticsStub();
      const service = createAttributionService({
        analytics,
        appConfig: { readAppConfig: async () => ({ telemetry: { metrics: false } }) },
        paths: { RUNTIME_DATA_DIR: dataDir },
        now: () => new Date('2026-07-10T00:00:00.000Z'),
      });

      const result = await service.claim({
        source: 'mac_where_froms',
        token: 'odtoken_123456',
        rawUrl: 'https://download.open-design.ai/mac/arm64/odtoken_123456/Open.dmg',
        platform: 'macos',
      });

      expect(result.status).toBe('pending_consent');
      const installation = await readInstallationFile(dataDir);
      expect(installation.pendingAttribution?.token).toBe('odtoken_123456');
      expect(analytics.mergeAnonymousPerson).not.toHaveBeenCalled();
    });
  });

  it('does not claim pre-delete attribution after metrics are re-enabled', async () => {
    await withTempData(async (dataDir) => {
      await writeInstallationFile(dataDir, {
        installationId: 'install-before-delete',
        pendingAttribution: {
          token: 'odtoken_predelete',
          source: 'mac_where_froms',
          capturedAt: '2026-07-10T00:00:00.000Z',
        },
        attributionClaimedAt: '2026-07-10T00:00:01.000Z',
        attributionClaimResultAt: '2026-07-10T00:00:02.000Z',
      });
      await writeAppConfig(dataDir, {
        installationId: 'install-after-delete',
        telemetry: { metrics: false },
      });
      expect(await readInstallationFile(dataDir)).toEqual({ installationId: 'install-after-delete' });

      await writeAppConfig(dataDir, { telemetry: { metrics: true } });
      const analytics = analyticsStub();
      const fetchImpl = vi.fn();
      const service = createAttributionService({
        analytics,
        appConfig: { readAppConfig },
        env: { OD_ATTRIBUTION_LEDGER_URL: 'https://ledger.test/api/attribution' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        paths: { RUNTIME_DATA_DIR: dataDir },
      });

      await expect(service.processPending()).resolves.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(analytics.mergeAnonymousPerson).not.toHaveBeenCalled();
    });
  });

  it('consumes a pending token and merges the landing person after consent', async () => {
    await withTempData(async (dataDir) => {
      await writeInstallationFile(dataDir, {
        installationId: 'install-123',
        pendingAttribution: {
          token: 'odtoken_abcdef',
          source: 'mac_where_froms',
          capturedAt: '2026-07-10T00:00:00.000Z',
        },
      });
      const analytics = analyticsStub();
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        status: 'consumed',
        webDistinctId: 'web-anon-1',
        properties: { od_utm_source: 'twitter', od_referrer: 'https://example.com' },
      }), { status: 200 }));
      const service = createAttributionService({
        analytics,
        appConfig: { readAppConfig: async () => ({ installationId: 'install-123', telemetry: { metrics: true } }) },
        env: { OD_ATTRIBUTION_LEDGER_URL: 'https://ledger.test/api/attribution' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        paths: { RUNTIME_DATA_DIR: dataDir },
        now: () => new Date('2026-07-10T00:01:00.000Z'),
      });

      const result = await service.processPending();

      expect(result?.status).toBe('claimed');
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://ledger.test/api/attribution/consume',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(analytics.mergeAnonymousPerson).toHaveBeenCalledWith(expect.objectContaining({
        anonymousDistinctId: 'web-anon-1',
        distinctId: 'install-123',
      }));
      const installation = await readInstallationFile(dataDir);
      expect(installation.pendingAttribution).toBeUndefined();
      expect(installation.attributionClaimedAt).toBe('2026-07-10T00:01:00.000Z');
    });
  });

  it('rejects a token already consumed by another installation as a shared installer', async () => {
    await withTempData(async (dataDir) => {
      await writeInstallationFile(dataDir, {
        installationId: 'install-123',
        pendingAttribution: {
          token: 'odtoken_shared',
          source: 'windows_zone_identifier',
          capturedAt: '2026-07-10T00:00:00.000Z',
        },
      });
      const analytics = analyticsStub();
      const service = createAttributionService({
        analytics,
        appConfig: { readAppConfig: async (): Promise<AppConfigPrefs> => ({ installationId: 'install-123', telemetry: { metrics: true } }) },
        env: { OD_ATTRIBUTION_LEDGER_URL: 'https://ledger.test/api/attribution' },
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({ status: 'already_consumed_other' }), { status: 200 })) as unknown as typeof fetch,
        paths: { RUNTIME_DATA_DIR: dataDir },
      });

      const result = await service.processPending();

      expect(result?.status).toBe('shared_installer');
      expect(analytics.mergeAnonymousPerson).not.toHaveBeenCalled();
      expect(analytics.captureSafety).toHaveBeenCalledWith(expect.objectContaining({
        eventName: 'attribution_shared_installer',
        distinctId: 'install-123',
      }));
    });
  });

  it('mints a first-party browser bridge only with metrics consent and a ledger secret', async () => {
    await withTempData(async (dataDir) => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        url: 'https://open-design.ai/clipper?od_bridge=odbr_12345678',
      }), { status: 200 }));
      const service = createAttributionService({
        analytics: analyticsStub(),
        appConfig: { readAppConfig: async () => ({ installationId: 'install-123', telemetry: { metrics: true } }) },
        env: { OD_ATTRIBUTION_LEDGER_URL: 'https://ledger.test/api/attribution', OD_ATTRIBUTION_LEDGER_TOKEN: 'secret' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        paths: { RUNTIME_DATA_DIR: dataDir },
      });

      await expect(service.bridgeUrl('https://open-design.ai/clipper')).resolves.toBe(
        'https://open-design.ai/clipper?od_bridge=odbr_12345678',
      );
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://ledger.test/api/attribution/bridge/mint',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
      );
      await expect(service.bridgeUrl('https://example.com/')).resolves.toBeNull();
    });
  });

  it('replays an idempotent merge when the same-installation ledger retry carries the recovered browser identity', async () => {
    await withTempData(async (dataDir) => {
      const analytics = analyticsStub();
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'consumed', webDistinctId: 'web-1' }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'already_consumed_same', webDistinctId: 'web-1' }), { status: 200 }));
      const service = createAttributionService({
        analytics,
        appConfig: { readAppConfig: async () => ({ installationId: 'install-123', telemetry: { metrics: true } }) },
        env: { OD_ATTRIBUTION_LEDGER_URL: 'https://ledger.test/api/attribution' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        paths: { RUNTIME_DATA_DIR: dataDir },
      });

      await expect(service.claim({ token: 'odtoken_repeat', source: 'manual' })).resolves.toMatchObject({ status: 'claimed', merged: true });
      await expect(service.claim({ token: 'odtoken_repeat', source: 'manual' })).resolves.toMatchObject({ status: 'already_claimed', merged: true });
      expect(analytics.mergeAnonymousPerson).toHaveBeenCalledTimes(2);
      expect(analytics.captureSafety).toHaveBeenCalledTimes(2);
    });
  });

  it('merges a pending token when its first visible ledger response is already_consumed_same', async () => {
    await withTempData(async (dataDir) => {
      await writeInstallationFile(dataDir, {
        installationId: 'install-recovered',
        pendingAttribution: {
          token: 'odtoken_recovered', source: 'mac_where_froms', capturedAt: '2026-07-10T00:00:00.000Z',
        },
      });
      const analytics = analyticsStub();
      const service = createAttributionService({
        analytics,
        appConfig: { readAppConfig: async () => ({ installationId: 'install-recovered', telemetry: { metrics: true } }) },
        env: { OD_ATTRIBUTION_LEDGER_URL: 'https://ledger.test/api/attribution' },
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({
          status: 'already_consumed_same', webDistinctId: 'web-recovered', properties: { od_utm_source: 'retry' },
        }), { status: 200 })) as unknown as typeof fetch,
        paths: { RUNTIME_DATA_DIR: dataDir },
      });

      await expect(service.processPending()).resolves.toMatchObject({ status: 'already_claimed', merged: true });
      expect(analytics.mergeAnonymousPerson).toHaveBeenCalledWith(expect.objectContaining({
        anonymousDistinctId: 'web-recovered', distinctId: 'install-recovered',
      }));
      expect((await readInstallationFile(dataDir)).pendingAttribution).toBeUndefined();
    });
  });
});
