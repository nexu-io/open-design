// Plan §3.B4 — marketplaces add / list / refresh / remove / trust unit tests.
//
// Locks the storage half of the federated catalog story. The Phase 3
// follow-up will layer on `od plugin install <name>` resolution +
// trust UI, but the storage layout here is the contract that lookup
// will read against.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import {
  addMarketplace,
  ensureMarketplaceManifest,
  getMarketplace,
  listMarketplaces,
  marketplaceManifestUrlForRegistry,
  refreshMarketplace,
  removeMarketplace,
  resolvePluginInMarketplaces,
  resolveMarketplaceFetchUrl,
  setMarketplaceTrust,
} from '../src/plugins/marketplaces.js';

let db: Database.Database;
let tmpDir: string;

const VALID_MANIFEST = JSON.stringify({
  specVersion: '1.0.0',
  name: 'test-marketplace',
  version: '1.0.0',
  metadata: { description: 'fixture', version: '1.0.0' },
  plugins: [
    { name: 'sample-plugin', source: 'github:open-design/sample-plugin', version: '0.1.0' },
  ],
});

function fixtureFetcher(text: string, ok = true) {
  return async () => ({
    ok,
    status: ok ? 200 : 502,
    text: async () => text,
  });
}

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-mp-'));
  db = new Database(path.join(tmpDir, 'test.sqlite'));
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

describe('marketplaces', () => {
  it('addMarketplace fetches, validates, stores, and returns the row', async () => {
    const result = await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    if (!result.ok) {
      throw new Error(`expected ok: ${JSON.stringify(result)}`);
    }
    expect(result.row.url).toBe('https://example.com/marketplace.json');
    expect(result.row.specVersion).toBe('1.0.0');
    expect(result.row.version).toBe('1.0.0');
    expect(result.row.trust).toBe('restricted');
    expect(result.row.manifest.plugins).toHaveLength(1);
    expect(listMarketplaces(db)).toHaveLength(1);
  });

  it('resolves marketplace names with exact versions, dist-tags, ranges, and yanks', async () => {
    const manifest = JSON.stringify({
      specVersion: '1.0.0',
      name: 'versions',
      version: '1.0.0',
      plugins: [
        {
          name: 'vendor/ranged',
          source: 'github:vendor/ranged@v1.2.0/plugin',
          version: '1.2.0',
          distTags: { latest: '1.2.0', beta: '2.0.0' },
          versions: [
            { version: '1.0.0', source: 'github:vendor/ranged@v1.0.0/plugin', integrity: 'sha256:one' },
            { version: '1.1.0', source: 'github:vendor/ranged@v1.1.0/plugin', integrity: 'sha256:two' },
            { version: '1.2.0', source: 'github:vendor/ranged@v1.2.0/plugin', integrity: 'sha256:three' },
            { version: '2.0.0', source: 'github:vendor/ranged@v2.0.0/plugin', yanked: true },
          ],
        },
      ],
    });
    const seeded = ensureMarketplaceManifest(db, {
      id: 'versions',
      url: 'https://example.com/versions.json',
      trust: 'trusted',
      manifestText: manifest,
    });
    if (!seeded.ok) throw new Error('seed failed');

    expect(resolvePluginInMarketplaces(db, 'vendor/ranged')?.pluginVersion).toBe('1.2.0');
    expect(resolvePluginInMarketplaces(db, 'vendor/ranged@1.0.0')).toMatchObject({
      pluginVersion: '1.0.0',
      source: 'github:vendor/ranged@v1.0.0/plugin',
      archiveIntegrity: 'sha256:one',
    });
    expect(resolvePluginInMarketplaces(db, 'vendor/ranged@^1.0.0')?.pluginVersion).toBe('1.2.0');
    expect(resolvePluginInMarketplaces(db, 'vendor/ranged@beta')).toBeNull();
  });

  it('addMarketplace rejects non-https urls', async () => {
    const result = await addMarketplace(db, {
      url: 'http://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/https/);
    }
  });

  it('addMarketplace surfaces parse failures', async () => {
    const result = await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher('{}'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
    }
  });

  it('normalizes public marketplace urls to the canonical raw registry', async () => {
    const seenUrls: string[] = [];
    const result = await addMarketplace(db, {
      url: 'https://open-design.ai/marketplace/community/open-design-marketplace.json',
      fetcher: async (url) => {
        seenUrls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => VALID_MANIFEST,
        };
      },
    });

    if (!result.ok) throw new Error('add failed');
    const expectedUrl = marketplaceManifestUrlForRegistry('community');
    expect(seenUrls).toEqual([expectedUrl]);
    expect(result.row.url).toBe(expectedUrl);
  });

  it('normalizes legacy branch raw urls to the canonical raw registry', () => {
    expect(resolveMarketplaceFetchUrl(
      'https://raw.githubusercontent.com/nexu-io/open-design/garnet-hemisphere/plugins/registry/community/open-design-marketplace.json',
    )).toBe(marketplaceManifestUrlForRegistry('community'));
  });

  it('requires a raw open-design-marketplace.json document, not a GitHub tree page', async () => {
    const result = await addMarketplace(db, {
      url: 'https://github.com/nexu-io/open-design/tree/garnet-hemisphere/plugins/registry/community',
      fetcher: fixtureFetcher('<!doctype html><html><body>GitHub tree page</body></html>'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.message).toMatch(/validation/i);
    }
  });

  it('refresh re-fetches and updates refreshed_at', async () => {
    const added = await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    if (!added.ok) throw new Error('add failed');
    const updatedManifest = JSON.parse(VALID_MANIFEST);
    updatedManifest.plugins.push({
      name: 'new-plugin',
      source: 'github:open-design/new-plugin',
      version: '0.2.0',
    });
    updatedManifest.version = '1.0.1';
    const refreshed = await refreshMarketplace(
      db,
      added.row.id,
      fixtureFetcher(JSON.stringify(updatedManifest)),
    );
    if (!refreshed.ok) throw new Error('refresh failed');
    expect(refreshed.row.version).toBe('1.0.1');
    expect(refreshed.row.manifest.plugins).toHaveLength(2);
    expect(refreshed.row.refreshedAt).toBeGreaterThanOrEqual(added.row.refreshedAt);
  });

  it('refresh normalizes legacy public urls before fetching', async () => {
    const seeded = ensureMarketplaceManifest(db, {
      id: 'community',
      url: 'https://open-design.ai/marketplace/community/open-design-marketplace.json',
      trust: 'restricted',
      manifestText: VALID_MANIFEST,
    });
    if (!seeded.ok) throw new Error('seed failed');
    const updatedManifest = JSON.parse(VALID_MANIFEST);
    updatedManifest.version = '1.0.1';
    const seenUrls: string[] = [];

    const refreshed = await refreshMarketplace(
      db,
      'community',
      async (url) => {
        seenUrls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(updatedManifest),
        };
      },
    );

    if (!refreshed.ok) throw new Error('refresh failed');
    const expectedUrl = marketplaceManifestUrlForRegistry('community');
    expect(seenUrls).toEqual([expectedUrl]);
    expect(refreshed.row.url).toBe(expectedUrl);
    expect(getMarketplace(db, 'community')?.url).toBe(expectedUrl);
  });

  it('setMarketplaceTrust updates the trust tier and remove deletes the row', async () => {
    const added = await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    if (!added.ok) throw new Error('add failed');
    const trusted = setMarketplaceTrust(db, added.row.id, 'trusted');
    expect(trusted?.trust).toBe('trusted');
    expect(removeMarketplace(db, added.row.id)).toBe(true);
    expect(getMarketplace(db, added.row.id)).toBeNull();
  });

  it('upserts a fixed built-in marketplace manifest', () => {
    const result = ensureMarketplaceManifest(db, {
      id: 'official',
      url: 'https://open-design.ai/marketplace/open-design-marketplace.json',
      trust: 'official',
      manifestText: VALID_MANIFEST,
      now: 123,
    });
    if (!result.ok) throw new Error('seed failed');
    expect(result.row.id).toBe('official');
    expect(result.row.trust).toBe('official');

    const updatedManifest = JSON.stringify({
      specVersion: '1.0.0',
      name: 'test-marketplace',
      version: '1.0.1',
      plugins: [],
    });
    const updated = ensureMarketplaceManifest(db, {
      id: 'official',
      url: 'https://open-design.ai/marketplace/open-design-marketplace.json',
      trust: 'official',
      manifestText: updatedManifest,
      now: 456,
    });
    if (!updated.ok) throw new Error('update failed');
    expect(listMarketplaces(db)).toHaveLength(1);
    expect(updated.row.addedAt).toBe(123);
    expect(updated.row.refreshedAt).toBe(456);
    expect(updated.row.version).toBe('1.0.1');
  });

  it('seeds the checked-in default community registry as restricted and resolvable', async () => {
    const communityManifest = await readFile(
      new URL('../../../plugins/registry/community/open-design-marketplace.json', import.meta.url),
      'utf8',
    );

    const seeded = ensureMarketplaceManifest(db, {
      id: 'community',
      url: 'https://open-design.ai/marketplace/community/open-design-marketplace.json',
      trust: 'restricted',
      manifestText: communityManifest,
      now: 123,
    });
    if (!seeded.ok) throw new Error('community seed failed');

    expect(seeded.row.trust).toBe('restricted');
    const resolved = resolvePluginInMarketplaces(db, 'community/registry-starter');
    expect(resolved?.marketplaceId).toBe('community');
    expect(resolved?.marketplaceTrust).toBe('restricted');
    expect(resolved?.source).toMatch(
      /^github:nexu-io\/open-design(?:@[^/]+)?\/plugins\/community\/registry-starter$/,
    );
  });

  it('keeps the checked-in official registry populated from bundled plugins', async () => {
    const officialManifestText = await readFile(
      new URL('../../../plugins/registry/official/open-design-marketplace.json', import.meta.url),
      'utf8',
    );
    const officialManifest = JSON.parse(officialManifestText) as {
      trust?: string;
      metadata?: { bundledPreinstallCount?: number };
      plugins?: Array<{ name?: string; source?: string }>;
    };

    expect(officialManifest.trust).toBe('official');
    expect(officialManifest.plugins?.length).toBeGreaterThan(100);
    expect(officialManifest.metadata?.bundledPreinstallCount).toBe(
      officialManifest.plugins?.length,
    );
    expect(officialManifest.plugins?.some((plugin) => plugin.name === 'open-design/build-test')).toBe(true);
    expect(officialManifest.plugins?.every((plugin) =>
      /^github:nexu-io\/open-design(?:@[^/]+)?\/plugins\/_official\//.test(plugin.source ?? ''),
    )).toBe(true);

    const seeded = ensureMarketplaceManifest(db, {
      id: 'official',
      url: 'https://open-design.ai/marketplace/open-design-marketplace.json',
      trust: 'official',
      manifestText: officialManifestText,
      now: 123,
    });
    if (!seeded.ok) throw new Error('official seed failed');

    const resolved = resolvePluginInMarketplaces(db, 'open-design/build-test');
    expect(resolved?.marketplaceId).toBe('official');
    expect(resolved?.marketplaceTrust).toBe('official');
  });

  it('keeps checked-in community registry entries pointed at source folders that can pack', async () => {
    const communityManifest = JSON.parse(await readFile(
      new URL('../../../plugins/registry/community/open-design-marketplace.json', import.meta.url),
      'utf8',
    )) as {
      plugins?: Array<{ name?: string; source?: string }>;
    };
    const entry = communityManifest.plugins?.find((plugin) => plugin.name === 'community/registry-starter');
    expect(entry?.source).toBeTruthy();

    const sourceSubpath = entry!.source!.replace(/^github:nexu-io\/open-design(?:@[^/]+)?\//, '');
    expect(sourceSubpath).toBe('plugins/community/registry-starter');

    const sourceManifest = await readFile(
      new URL(`../../../${sourceSubpath}/open-design.json`, import.meta.url),
      'utf8',
    );
    expect(JSON.parse(sourceManifest)).toMatchObject({
      name: 'community-registry-starter',
      plugin: {
        repo: expect.stringContaining('github.com/nexu-io/open-design'),
      },
    });
  });
});

describe('resolvePluginInMarketplaces', () => {
  it('returns the canonical source string for a known plugin name', async () => {
    await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    const resolved = resolvePluginInMarketplaces(db, 'sample-plugin');
    expect(resolved).not.toBeNull();
    expect(resolved!.source).toBe('github:open-design/sample-plugin');
    expect(resolved!.pluginVersion).toBe('0.1.0');
    expect(resolved!.marketplaceVersion).toBe('1.0.0');
    expect(resolved!.marketplaceTrust).toBe('restricted');
  });

  it('matches case-insensitively', async () => {
    await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    const resolved = resolvePluginInMarketplaces(db, 'SAMPLE-PLUGIN');
    expect(resolved?.pluginName).toBe('sample-plugin');
  });

  it('returns null when no marketplace knows the name', async () => {
    expect(resolvePluginInMarketplaces(db, 'mystery')).toBeNull();
    await addMarketplace(db, {
      url: 'https://example.com/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    expect(resolvePluginInMarketplaces(db, 'mystery')).toBeNull();
  });

  it('walks marketplaces in registration order, first hit wins', async () => {
    const otherManifest = JSON.stringify({
      specVersion: '1.0.0',
      name: 'other',
      version: '1.0.0',
      plugins: [{ name: 'sample-plugin', source: 'github:other/sample', version: '0.9.0' }],
    });
    const first = await addMarketplace(db, {
      url: 'https://first.example/marketplace.json',
      fetcher: fixtureFetcher(otherManifest),
    });
    const second = await addMarketplace(db, {
      url: 'https://second.example/marketplace.json',
      fetcher: fixtureFetcher(VALID_MANIFEST),
    });
    if (!first.ok || !second.ok) throw new Error('setup failed');
    const resolved = resolvePluginInMarketplaces(db, 'sample-plugin');
    expect(resolved?.source).toBe('github:other/sample');
  });
});
