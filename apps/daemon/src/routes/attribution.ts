import express, { type Express, type Request } from 'express';
import {
  ATTRIBUTION_CLAIM_PATH,
  type AttributionClaimResponse,
  type AttributionClaimSource,
} from '@open-design/contracts';
import type { AnalyticsService } from '../analytics.js';
import type { AppConfigPrefs } from '../app-config.js';
import {
  readInstallationFile,
  resolveInstallationDir,
  writeInstallationFile,
  type PendingAttribution,
} from '../installation.js';

const DEFAULT_ATTRIBUTION_LEDGER_URL = 'https://download.open-design.ai/api/attribution';

type ReadAppConfig = (dataDir: string) => Promise<AppConfigPrefs>;

export interface AttributionService {
  claim(input: AttributionClaimInput): Promise<AttributionClaimResponse>;
  processPending(): Promise<AttributionClaimResponse | null>;
  bridgeUrl(url: string): Promise<string | null>;
}

export interface AttributionClaimInput {
  token?: string | null;
  source: AttributionClaimSource;
  rawUrl?: string | null;
  platform?: string | null;
}

export interface RegisterAttributionRoutesDeps {
  analytics: AnalyticsService;
  env?: NodeJS.ProcessEnv;
  http: {
    isLocalSameOrigin: (req: Request, port: number) => boolean;
    resolvedPortRef: { current: number };
  };
  paths: {
    RUNTIME_DATA_DIR: string;
  };
  appConfig: {
    readAppConfig: ReadAppConfig;
  };
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

type LedgerConsumeResult =
  | {
      status: 'consumed' | 'already_consumed_same';
      webDistinctId: string;
      properties?: Record<string, unknown>;
    }
  | {
      status: 'already_consumed_other' | 'not_found';
      webDistinctId?: string;
      properties?: Record<string, unknown>;
    };

export function createAttributionService(deps: Omit<RegisterAttributionRoutesDeps, 'http'>): AttributionService {
  const dataDir = deps.paths.RUNTIME_DATA_DIR;
  const installationDir = resolveInstallationDir(dataDir);
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());

  const service: AttributionService = {
    async claim(input) {
      const token = normalizeToken(input.token);
      if (!token) {
        return response('invalid');
      }
      const pending: PendingAttribution = {
        token,
        source: input.source,
        capturedAt: now().toISOString(),
        ...(input.rawUrl ? { rawUrl: input.rawUrl } : {}),
        ...(input.platform ? { platform: input.platform } : {}),
      };
      return processAttribution(pending, { persistBeforeReturn: true });
    },
    async processPending() {
      const installation = await readInstallationFile(installationDir);
      if (!installation.pendingAttribution) return null;
      return processAttribution(installation.pendingAttribution, { persistBeforeReturn: false });
    },
    async bridgeUrl(url) {
      const target = trustedFirstPartyUrl(url);
      if (!target) return null;
      const appConfig = await deps.appConfig.readAppConfig(dataDir);
      const installation = await readInstallationFile(installationDir);
      const installationId = cleanString(appConfig.installationId) ?? cleanString(installation.installationId);
      if (appConfig.telemetry?.metrics !== true || !installationId) return null;
      const baseUrl = env.OD_ATTRIBUTION_LEDGER_URL?.trim() || DEFAULT_ATTRIBUTION_LEDGER_URL;
      const secret = env.OD_ATTRIBUTION_LEDGER_TOKEN?.trim();
      if (!secret) return null;
      try {
        const result = await (deps.fetchImpl ?? fetch)(`${baseUrl.replace(/\/+$/, '')}/bridge/mint`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ installationId, url: target.toString() }),
        });
        if (!result.ok) return null;
        const body = await result.json() as { url?: unknown };
        return typeof body.url === 'string' && trustedFirstPartyUrl(body.url) ? body.url : null;
      } catch {
        return null;
      }
    },
  };

  async function processAttribution(
    attribution: PendingAttribution,
    options: { persistBeforeReturn: boolean },
  ): Promise<AttributionClaimResponse> {
    const appConfig = await deps.appConfig.readAppConfig(dataDir);
    const installation = await readInstallationFile(installationDir);
    const installationId = cleanString(appConfig.installationId) ?? cleanString(installation.installationId);
    if (appConfig.telemetry?.metrics !== true) {
      await persistPendingIfNeeded(attribution, options.persistBeforeReturn);
      return response('pending_consent', { found: true, pending: true });
    }
    if (!installationId) {
      await persistPendingIfNeeded(attribution, options.persistBeforeReturn);
      return response('pending_installation_id', { found: true, pending: true });
    }

    const ledger = await consumeLedgerToken({
      env,
      fetchImpl: deps.fetchImpl ?? fetch,
      installationId,
      token: attribution.token,
    });
    if (!ledger) {
      await persistPendingIfNeeded(attribution, true);
      const result = response('pending_ledger', { found: true, pending: true });
      await captureClaimResult(result, attribution.source, attribution.platform, installationId);
      return result;
    }
    if (ledger.status === 'not_found') {
      await writeInstallationFile(installationDir, {
        attributionClaimResultAt: now().toISOString(),
        pendingAttribution: null,
      });
      const result = response('not_found');
      await captureClaimResult(result, attribution.source, attribution.platform, installationId);
      return result;
    }
    if (ledger.status === 'already_consumed_other') {
      await deps.analytics.captureSafety({
        eventName: 'attribution_shared_installer',
        distinctId: installationId,
        appVersion: '0.0.0',
        properties: { token: attribution.token, source: attribution.source },
      });
      await writeInstallationFile(installationDir, {
        attributionClaimResultAt: now().toISOString(),
        pendingAttribution: null,
      });
      const result = response('shared_installer', { found: true });
      await captureClaimResult(result, attribution.source, attribution.platform, installationId);
      return result;
    }
    if (!ledger.webDistinctId) {
      await persistPendingIfNeeded(attribution, true);
      return response('pending_ledger', { found: true, pending: true });
    }
    await deps.analytics.mergeAnonymousPerson({
      anonymousDistinctId: ledger.webDistinctId,
      distinctId: installationId,
      properties: {
        od_source_bound_at: now().toISOString(),
        od_source_resolution: 'download_token',
        od_download_token_source: attribution.source,
        ...ledger.properties,
      },
      insertId: `download-attribution-${attribution.token}`,
    });
    await writeInstallationFile(installationDir, {
      attributionClaimedAt: now().toISOString(),
      attributionClaimResultAt: now().toISOString(),
      pendingAttribution: null,
    });
    const result = response(ledger.status === 'already_consumed_same' ? 'already_claimed' : 'claimed', {
      found: true,
      merged: true,
    });
    await captureClaimResult(result, attribution.source, attribution.platform, installationId);
    return result;
  }

  async function captureClaimResult(
    result: AttributionClaimResponse,
    source: string,
    platform: string | undefined,
    installationId: string,
  ): Promise<void> {
    await deps.analytics.captureSafety({
      eventName: 'attribution_claim_result',
      distinctId: installationId,
      appVersion: '0.0.0',
      properties: { found: result.found, merged: result.merged, source, platform: platform ?? 'unknown', status: result.status },
      insertId: `attribution-claim-result-${Date.now()}`,
    });
  }

  async function persistPendingIfNeeded(
    attribution: PendingAttribution,
    shouldPersist: boolean,
  ): Promise<void> {
    if (!shouldPersist) return;
    await writeInstallationFile(installationDir, { pendingAttribution: attribution });
  }

  return service;
}

export function registerAttributionRoutes(app: Express, deps: RegisterAttributionRoutesDeps): AttributionService {
  const service = createAttributionService(deps);
  app.post(ATTRIBUTION_CLAIM_PATH, express.json({ limit: '16kb' }), async (req, res) => {
    if (!deps.http.isLocalSameOrigin(req, deps.http.resolvedPortRef.current)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const parsed = parseClaimRequest(req.body);
    if (!parsed) {
      return res.status(400).json(response('invalid'));
    }
    try {
      res.json(await service.claim(parsed));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post('/api/attribution/bridge-url', express.json({ limit: '8kb' }), async (req, res) => {
    if (!deps.http.isLocalSameOrigin(req, deps.http.resolvedPortRef.current)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const url = req.body && typeof req.body === 'object' && typeof req.body.url === 'string'
      ? req.body.url
      : null;
    if (!url) return res.status(400).json({ error: 'invalid_url' });
    res.json({ url: await service.bridgeUrl(url) });
  });
  return service;
}

function parseClaimRequest(body: unknown): AttributionClaimInput | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  if (!isSource(obj.source)) return null;
  const platform = typeof obj.platform === 'string' ? obj.platform : null;
  return {
    source: obj.source,
    token: typeof obj.token === 'string' ? obj.token : null,
    rawUrl: typeof obj.rawUrl === 'string' ? obj.rawUrl : null,
    platform,
  };
}

function isSource(value: unknown): value is AttributionClaimSource {
  return value === 'mac_where_froms'
    || value === 'windows_zone_identifier'
    || value === 'installer_observation_file'
    || value === 'manual';
}

async function consumeLedgerToken(input: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  installationId: string;
  token: string;
}): Promise<LedgerConsumeResult | null> {
  const baseUrl = input.env.OD_ATTRIBUTION_LEDGER_URL?.trim() || DEFAULT_ATTRIBUTION_LEDGER_URL;
  if (!baseUrl) return null;
  const secret = input.env.OD_ATTRIBUTION_LEDGER_TOKEN?.trim();
  const url = `${baseUrl.replace(/\/+$/, '')}/consume`;
  try {
    const response = await input.fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ installationId: input.installationId, token: input.token }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return parseLedgerConsumeResult(json);
  } catch {
    return null;
  }
}

function parseLedgerConsumeResult(raw: unknown): LedgerConsumeResult | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.status === 'not_found' || obj.status === 'already_consumed_other') {
    return { status: obj.status };
  }
  if (obj.status === 'consumed' || obj.status === 'already_consumed_same') {
    const webDistinctId = cleanString(obj.webDistinctId);
    if (!webDistinctId) return null;
    const properties = obj.properties != null && typeof obj.properties === 'object' && !Array.isArray(obj.properties)
      ? obj.properties as Record<string, unknown>
      : undefined;
    return {
      status: obj.status,
      webDistinctId,
      ...(properties ? { properties } : {}),
    };
  }
  return null;
}

function normalizeToken(value: unknown): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(cleaned)) return null;
  return cleaned;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trustedFirstPartyUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    return ['open-design.ai', 'www.open-design.ai', 'staging.open-design.ai'].includes(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function response(
  status: AttributionClaimResponse['status'],
  overrides: Partial<Omit<AttributionClaimResponse, 'ok' | 'status'>> = {},
): AttributionClaimResponse {
  return {
    ok: true,
    status,
    found: false,
    pending: false,
    merged: false,
    ...overrides,
  };
}
