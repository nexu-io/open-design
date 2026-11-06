import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { MarketplaceManifest } from '@open-design/contracts';
import { StaticRegistryBackend } from '../src/registry/static-backend.js';
import {
  DatabaseRegistryBackend,
  ensureRegistryTables,
  upsertRegistryEntry,
} from '../src/registry/database-backend.js';
import { GithubRegistryBackend, type GithubRegistryClient } from '../src/registry/github-backend.js';

const manifest: MarketplaceManifest = {
  specVersion: '1.0.0',
  name: 'fixture',
  version: '1.0.0',
  plugins: [
    {
      name: 'vendor/example',
      title: 'Example',
      description: 'Searchable fixture plugin',
      version: '1.1.0',
      source: 'github:vendor/example@v1.1.0/plugin',
      versions: [
        {
          version: '1.0.0',
          source: 'github:vendor/example@v1.0.0/plugin',
          integrity: 'sha256:old',
        },
        {
          version: '1.1.0',
          source: 'github:vendor/example@v1.1.0/plugin',
          integrity: 'sha256:new',
        },
      ],
      distTags: { latest: '1.1.0' },
      license: 'MIT',
      capabilitiesSummary: ['prompt:inject'],
      tags: ['fixture'],
    },
  ],
};

describe('registry backends', () => {
  it('resolves exact versions and dist-tags from static manifests', async () => {
    const backend = new StaticRegistryBackend({
      id: 'fixture',
      trust: 'trusted',
      manifest,
    });

    await expect(backend.resolve('vendor/example')).resolves.toMatchObject({
      source: 'github:vendor/example@v1.1.0/plugin',
      integrity: 'sha256:new',
    });
    await expect(backend.resolve('vendor/example@1.0.0')).resolves.toMatchObject({
      source: 'github:vendor/example@v1.0.0/plugin',
      integrity: 'sha256:old',
    });
  });

  it('keeps database backend behavior equivalent to static backend', async () => {
    const db = new Database(':memory:');
    try {
      ensureRegistryTables(db);
      const staticBackend = new StaticRegistryBackend({
        id: 'fixture',
        trust: 'restricted',
        manifest,
      });
      for (const entry of await staticBackend.list()) {
        upsertRegistryEntry(db, 'fixture', entry, 123);
      }
      const databaseBackend = new DatabaseRegistryBackend({ id: 'fixture', db });

      await expect(databaseBackend.list()).resolves.toEqual(await staticBackend.list());
      await expect(databaseBackend.search({ query: 'Searchable' })).resolves.toMatchObject([
        { entry: { name: 'vendor/example' } },
      ]);
      await expect(databaseBackend.resolve('vendor/example')).resolves.toMatchObject({
        source: 'github:vendor/example@v1.1.0/plugin',
      });
    } finally {
      db.close();
    }
  });

  it('builds GitHub publish PR mutations with deterministic paths', async () => {
    let mutationFiles: string[] = [];
    const client: GithubRegistryClient = {
      async readMarketplace() {
        return manifest;
      },
      async createPublishPullRequest(mutation) {
        mutationFiles = mutation.files.map((file) => file.path);
        return { url: 'https://github.com/open-design/plugin-registry/pull/1' };
      },
    };
    const backend = await GithubRegistryBackend.create({
      id: 'official',
      owner: 'open-design',
      repo: 'plugin-registry',
      client,
    });
    const entry = (await backend.list())[0];
    if (!entry) throw new Error('fixture entry missing');
    await expect(backend.publish?.({ entry })).resolves.toMatchObject({
      ok: true,
      pullRequestUrl: 'https://github.com/open-design/plugin-registry/pull/1',
    });
    expect(mutationFiles).toEqual([
      'plugins/vendor/example/entry.json',
      'plugins/vendor/example/versions/1.1.0.json',
    ]);
  });
});
