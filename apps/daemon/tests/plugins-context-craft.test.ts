import { describe, expect, it } from 'vitest';

import type { AppliedPluginSnapshot, InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import { getPluginContextCraft, getSnapshotContextCraft } from '../src/plugins/context-craft.js';

function pluginRecord(manifest: PluginManifest): InstalledPluginRecord {
  return {
    id: 'fixture-plugin',
    title: 'Fixture Plugin',
    version: '0.1.0',
    sourceKind: 'local',
    source: '/tmp/fixture-plugin',
    sourceMarketplaceId: undefined,
    pinnedRef: undefined,
    sourceDigest: undefined,
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    fsPath: '/tmp/fixture-plugin',
    installedAt: 0,
    updatedAt: 0,
    manifest,
  };
}

describe('getPluginContextCraft', () => {
  it('returns the declared plugin craft slugs in manifest order', () => {
    const manifest: PluginManifest = {
      name: 'fixture-plugin',
      title: 'Fixture Plugin',
      version: '0.1.0',
      description: 'Fixture plugin.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Generate a fixture artifact.' },
        context: {
          craft: ['typography', 'color', 'anti-ai-slop'],
        },
        capabilities: ['prompt:inject'],
      },
    };

    expect(getPluginContextCraft(pluginRecord(manifest))).toEqual([
      'typography',
      'color',
      'anti-ai-slop',
    ]);
  });

  it('drops blanks, non-strings, and duplicates', () => {
    const manifest: PluginManifest = {
      name: 'fixture-plugin',
      title: 'Fixture Plugin',
      version: '0.1.0',
      description: 'Fixture plugin.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Generate a fixture artifact.' },
        context: {
          craft: [' typography ', '', 'color', 'typography', 42 as never],
        },
        capabilities: ['prompt:inject'],
      },
    };

    expect(getPluginContextCraft(pluginRecord(manifest))).toEqual([
      'typography',
      'color',
    ]);
  });

  it('returns an empty array when no craft is declared', () => {
    const manifest: PluginManifest = {
      name: 'fixture-plugin',
      title: 'Fixture Plugin',
      version: '0.1.0',
      description: 'Fixture plugin.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Generate a fixture artifact.' },
        capabilities: ['prompt:inject'],
      },
    };

    expect(getPluginContextCraft(pluginRecord(manifest))).toEqual([]);
  });

  it('keeps replay craft frozen on the applied snapshot after the installed manifest changes', () => {
    const installedManifest: PluginManifest = {
      name: 'fixture-plugin',
      title: 'Fixture Plugin',
      version: '0.1.0',
      description: 'Fixture plugin.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Generate a fixture artifact.' },
        context: { craft: ['color'] },
        capabilities: ['prompt:inject'],
      },
    };
    const snapshot: AppliedPluginSnapshot = {
      snapshotId: 'snapshot-1',
      pluginId: 'fixture-plugin',
      pluginVersion: '0.1.0',
      manifestSourceDigest: 'digest-before-update',
      inputs: {},
      resolvedContext: { items: [] },
      craftRequires: ['typography', 'anti-ai-slop'],
      capabilitiesGranted: ['prompt:inject'],
      capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 1,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      status: 'fresh',
    };

    expect(getPluginContextCraft(pluginRecord(installedManifest))).toEqual(['color']);
    expect(getSnapshotContextCraft(snapshot)).toEqual(['typography', 'anti-ai-slop']);
  });
});
