import type { Express, Request } from 'express';
import type * as BetterSqlite3 from 'better-sqlite3';

type MarketplaceTrust = 'trusted' | 'restricted' | 'official';

type SqliteDbLike = BetterSqlite3.Database;

interface MarketplaceManifest {
  plugins?: unknown[];
  [key: string]: unknown;
}

interface MarketplaceRow {
  id: string;
  url: string;
  version?: string;
  specVersion?: string;
  trust?: MarketplaceTrust;
  manifest: MarketplaceManifest;
  [key: string]: unknown;
}

interface MarketplaceMutationResult {
  ok: boolean;
  status: number;
  message: string;
  errors?: unknown[];
  row: MarketplaceRow;
}

type MarketplaceFetcher = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface RegisterPluginMarketplaceRoutesDeps {
  db: SqliteDbLike;
  bundledMarketplaceEntries: unknown;
  createMarketplaceFetcher: (seedId: string | null, bundled: unknown) => MarketplaceFetcher;
  marketplaceRegistryIdFromUrl: (url: string) => string | null;
}

export function registerPluginMarketplaceRoutes(app: Express, deps: RegisterPluginMarketplaceRoutesDeps): void {
  const { db, bundledMarketplaceEntries, createMarketplaceFetcher, marketplaceRegistryIdFromUrl } = deps;

  const readBody = (req: Request): Record<string, unknown> =>
    req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

  app.get('/api/marketplaces', async (_req, res) => {
    try {
      const { listMarketplaces } = await import('../../plugins/marketplaces.js');
      res.json({ marketplaces: listMarketplaces(db) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.post('/api/marketplaces', async (req, res) => {
    try {
      const body = readBody(req);
      const url = typeof body.url === 'string' ? body.url : '';
      if (!url) return res.status(400).json({ error: 'url is required' });
      const trust = body.trust === 'trusted' || body.trust === 'official' ? body.trust : 'restricted';
      const { addMarketplace } = await import('../../plugins/marketplaces.js');
      const result = await addMarketplace(db, {
        url,
        trust,
        fetcher: createMarketplaceFetcher(marketplaceRegistryIdFromUrl(url), bundledMarketplaceEntries),
      }) as MarketplaceMutationResult;
      if (!result.ok) return res.status(result.status).json({ error: { code: 'marketplace-add-failed', message: result.message, data: { errors: result.errors ?? [] } } });
      res.status(201).json(result.row);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.get('/api/marketplaces/:id', async (req, res) => {
    try {
      const { getMarketplace } = await import('../../plugins/marketplaces.js');
      const row = getMarketplace(db, req.params.id) as MarketplaceRow | null;
      if (!row) return res.status(404).json({ error: 'marketplace not found' });
      res.json(row);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.delete('/api/marketplaces/:id', async (req, res) => {
    try {
      const { removeMarketplace } = await import('../../plugins/marketplaces.js');
      const ok = removeMarketplace(db, req.params.id);
      if (!ok) return res.status(404).json({ error: 'marketplace not found' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.post('/api/marketplaces/:id/refresh', async (req, res) => {
    try {
      const { getMarketplace, refreshMarketplace } = await import('../../plugins/marketplaces.js');
      const row = getMarketplace(db, req.params.id) as MarketplaceRow | null;
      const seedId = row ? marketplaceRegistryIdFromUrl(row.url) ?? req.params.id : req.params.id;
      const result = await refreshMarketplace(db, req.params.id, createMarketplaceFetcher(seedId, bundledMarketplaceEntries)) as MarketplaceMutationResult;
      if (!result.ok) return res.status(result.status).json({ error: { code: 'marketplace-refresh-failed', message: result.message, data: { errors: result.errors ?? [] } } });
      try {
        const { recordPluginEvent } = await import('../../plugins/events.js');
        recordPluginEvent({ kind: 'plugin.marketplace-refreshed', pluginId: '', details: { marketplaceId: req.params.id, marketplaceVersion: result.row.version, specVersion: result.row.specVersion } });
      } catch {}
      res.json(result.row);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.post('/api/marketplaces/:id/trust', async (req, res) => {
    try {
      const body = readBody(req);
      const trust = body.trust === 'trusted' || body.trust === 'restricted' || body.trust === 'official' ? body.trust : null;
      if (!trust) return res.status(400).json({ error: 'trust must be one of: trusted, restricted, official' });
      const { setMarketplaceTrust } = await import('../../plugins/marketplaces.js');
      const row = setMarketplaceTrust(db, req.params.id, trust) as MarketplaceRow | null;
      if (!row) return res.status(404).json({ error: 'marketplace not found' });
      res.json(row);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/marketplaces/:id/plugins', async (req, res) => {
    try {
      const { getMarketplace } = await import('../../plugins/marketplaces.js');
      const row = getMarketplace(db, req.params.id) as MarketplaceRow | null;
      if (!row) return res.status(404).json({ error: 'marketplace not found' });
      res.json({ plugins: row.manifest.plugins ?? [] });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
}
