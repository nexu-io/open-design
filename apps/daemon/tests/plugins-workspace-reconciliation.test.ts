// `reconcileUnboundUserPluginsForWorkspace` (registry.ts): the #6528 recovery
// lane. Plugins installed before workspace isolation shipped have no
// `workspace_resources` row, so every explicit-workspace read quarantines
// them ("no caller may adopt legacy bytes merely by viewing them"). The
// reconciler is the ONE sanctioned adoption path: it runs from
// `GET /api/plugins` after `resolveWorkspaceAuthority` verified the caller,
// and claims still-unbound user plugins as Personal resources created by the
// authenticated member — the same rows a fresh install would have written.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
  updateWorkspaceResource,
} from '../src/db.js';
import {
  listInstalledPlugins,
  reconcileUnboundUserPluginsForWorkspace,
  upsertInstalledPlugin,
} from '../src/plugins/registry.js';
import type { InstalledPluginRecord } from '@open-design/contracts';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-plugins-workspace-reconcile-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

function fakePlugin(
  id: string,
  sourceKind: InstalledPluginRecord['sourceKind'] = 'local',
  source?: string,
): InstalledPluginRecord {
  const now = Date.now();
  return {
    id,
    title: id,
    version: '1.0.0',
    sourceKind,
    source: source ?? '/tmp/' + id,
    trust: 'trusted',
    capabilitiesGranted: [],
    manifest: { name: id, title: id, version: '1.0.0' } as InstalledPluginRecord['manifest'],
    fsPath: '/tmp/' + id,
    installedAt: now,
    updatedAt: now,
  };
}

describe('reconcileUnboundUserPluginsForWorkspace', () => {
  it('adopts an unbound legacy user plugin as a Personal resource of the authenticated member', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-legacy'));

    // Pre-reconciliation: quarantined from the explicit workspace (#6528).
    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).not.toContain('plugin-legacy');

    const adopted = reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', 'member-a');
    expect(adopted).toBe(1);

    const binding = getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-legacy');
    expect(binding?.workspaceId).toBe('ws-1');
    expect(binding?.visibility).toBe('personal');
    expect(binding?.createdByWorkspaceMemberId).toBe('member-a');
    expect(binding?.resourceState).toBe('active');

    // Post-reconciliation: visible to its adopter, still hidden from others —
    // the personal-visibility rules from `pluginVisibleFromWorkspace` apply
    // to the adopted binding exactly as they would to a fresh install.
    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).toContain('plugin-legacy');
    expect(listInstalledPlugins(db, 'ws-1', 'member-other').map((p) => p.id)).not.toContain('plugin-legacy');
    expect(listInstalledPlugins(db, 'ws-2', 'member-b').map((p) => p.id)).not.toContain('plugin-legacy');
  });

  it('is idempotent and never re-claims a plugin already bound anywhere', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-legacy'));

    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', 'member-a')).toBe(1);
    // Same workspace, same member: nothing left to adopt.
    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', 'member-a')).toBe(0);
    // A second workspace on the same machine must NOT steal the binding.
    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-2', 'member-b')).toBe(0);

    const binding = getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-legacy');
    expect(binding?.workspaceId).toBe('ws-1');
    expect(binding?.createdByWorkspaceMemberId).toBe('member-a');
  });

  it('never binds bundled plugins — they stay global app capabilities', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-bundled', 'bundled'));

    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', 'member-a')).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-bundled')).toBeUndefined();
    // Bundled visibility was never the problem; it bypasses bindings entirely.
    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).toContain('plugin-bundled');
  });

  it('skips Team materializations — the hub reconciliation path owns those', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-team-mirror', 'local', 'team:plugin:ws-1:plugin-team-mirror'));

    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', 'member-a')).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-team-mirror')).toBeUndefined();
  });

  it('does nothing without a verified workspace id AND member id', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-legacy'));

    expect(reconcileUnboundUserPluginsForWorkspace(db, null, null)).toBe(0);
    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', null)).toBe(0);
    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', '')).toBe(0);
    expect(reconcileUnboundUserPluginsForWorkspace(db, '  ', 'member-a')).toBe(0);
    expect(getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-legacy')).toBeUndefined();
  });

  it('respects a reconciled tombstone — a deleted binding is terminal, not re-adoptable', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-retired'));
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-retired', {
      createdByWorkspaceMemberId: 'member-a',
    });
    updateWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-retired', { resourceState: 'deleted' });

    expect(reconcileUnboundUserPluginsForWorkspace(db, 'ws-1', 'member-a')).toBe(0);
    const binding = getWorkspaceResourceByResourceId(db, 'plugin', 'plugin-retired');
    expect(binding?.resourceState).toBe('deleted');
    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).not.toContain('plugin-retired');
  });
});
