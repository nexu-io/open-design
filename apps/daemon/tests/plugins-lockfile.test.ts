import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  lockEntryFromInstalled,
  readPluginLockfile,
  upsertPluginLockfileEntry,
} from '../src/plugins/lockfile.js';

const plugin: InstalledPluginRecord = {
  id: 'registry-starter',
  title: 'Registry starter',
  version: '0.1.0',
  sourceKind: 'github',
  source: 'github:nexu-io/open-design@main/plugins/community/registry-starter',
  sourceMarketplaceId: 'community',
  sourceMarketplaceEntryName: 'community/registry-starter',
  sourceMarketplaceEntryVersion: '0.1.0',
  marketplaceTrust: 'restricted',
  resolvedSource: 'github:nexu-io/open-design@main/plugins/community/registry-starter',
  resolvedRef: 'main',
  manifestDigest: 'sha256:manifest',
  archiveIntegrity: 'sha256:archive',
  trust: 'restricted',
  capabilitiesGranted: ['prompt:inject'],
  manifest: {
    specVersion: '1.0.0',
    name: 'registry-starter',
    version: '0.1.0',
    title: 'Registry starter',
  },
  fsPath: '/tmp/registry-starter',
  installedAt: 1,
  updatedAt: 1,
};

describe('plugin lockfile', () => {
  it('converts installed provenance into a reproducible lock entry', () => {
    expect(lockEntryFromInstalled(plugin, 123)).toMatchObject({
      name: 'community/registry-starter',
      version: '0.1.0',
      sourceMarketplaceId: 'community',
      resolvedRef: 'main',
      manifestDigest: 'sha256:manifest',
      archiveIntegrity: 'sha256:archive',
      lockedAt: 123,
    });
  });

  it('writes stable .od/od-plugin-lock.json content', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-lock-'));
    try {
      const filePath = path.join(dir, '.od', 'od-plugin-lock.json');
      await upsertPluginLockfileEntry(filePath, plugin, 123);
      expect(await readPluginLockfile(filePath)).toMatchObject({
        schemaVersion: 1,
        plugins: {
          'community/registry-starter': {
            source: plugin.source,
            archiveIntegrity: 'sha256:archive',
          },
        },
      });
      expect(await readFile(filePath, 'utf8')).toContain('"schemaVersion": 1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
