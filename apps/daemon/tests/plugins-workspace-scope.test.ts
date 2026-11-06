// `listInstalledPlugins`'s workspace-scoped filter (registry.ts): a plugin
// bound into a DIFFERENT workspace than the one asked about is hidden, but an
// UNBOUND plugin (no `workspace_resources` row — every plugin installed
// before workspace isolation shipped looks like this) stays visible from
// every workspace. Mirrors design-systems' `designSystemVisibleFromWorkspace`
// rule (design-systems/index.ts) applied to the generic `workspace_resources`
// table instead of a metadata.json sidecar.
//
// spec 04 §10 addendum: `workspaceId` OMITTED (the argument not passed at
// all) and `workspaceId: null` (passed explicitly, e.g. by `GET /api/plugins`
// when the request carries no `x-od-workspace-id` header) are DIFFERENT
// signals. Omitted means an internal caller (`od plugin list`, inventory
// stats, the bundled-scenario scan) never asked to be scoped — stays
// unfiltered. Explicit `null` means an HTTP caller DID ask to be scoped but
// has no identity to offer, and must now see only UNBOUND plugins, not
// everything — "no scope" must not mean "trust everything"
// (recvqbeDjAsejl / recvqbklNGDqYY).

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
  activateWorkspaceTeamPluginIfStillShared,
  listInstalledPlugins,
  resolveAndActivateWorkspaceTeamPlugin,
  resolveWorkspaceTeamPluginWithBindingGate,
  upsertInstalledPlugin,
  workspaceTeamPluginBindingActivationFence,
  workspaceTeamPluginBindingAllowsRead,
  workspaceTeamPluginBindingResourceId,
} from '../src/plugins/registry.js';
import type { InstalledPluginRecord } from '@open-design/contracts';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-plugins-workspace-scope-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

function fakePlugin(
  id: string,
  sourceKind: InstalledPluginRecord['sourceKind'] = 'local',
): InstalledPluginRecord {
  const now = Date.now();
  return {
    id,
    title: id,
    version: '1.0.0',
    sourceKind,
    source: `/tmp/${id}`,
    trust: 'trusted',
    capabilitiesGranted: [],
    manifest: { name: id, title: id, version: '1.0.0' } as InstalledPluginRecord['manifest'],
    fsPath: `/tmp/${id}`,
    installedAt: now,
    updatedAt: now,
  };
}

describe('listInstalledPlugins workspace scope', () => {
  it('returns every plugin, unfiltered, when the workspaceId ARGUMENT IS OMITTED (backward compat)', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-unbound'));
    upsertInstalledPlugin(db, fakePlugin('plugin-bound'));
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-bound', { createdByWorkspaceMemberId: 'member-a' });

    const all = listInstalledPlugins(db);
    expect(all.map((p) => p.id).sort()).toEqual(['plugin-bound', 'plugin-unbound']);
  });

  it('hides a bound plugin when the caller passes an explicit null workspaceId (spec 04 §10)', () => {
    // `headerValue()` returns `null` (never `undefined`) when a request
    // carries no `x-od-workspace-id` header, so `GET /api/plugins` always
    // passes a DEFINED second argument. That must reach the workspace filter
    // the same as a real workspace id would, not silently take the "omitted"
    // unfiltered path above — otherwise a signed-out / headerless caller
    // could still see every workspace's claimed plugins.
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-unbound'));
    upsertInstalledPlugin(db, fakePlugin('plugin-bound'));
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-bound', { createdByWorkspaceMemberId: 'member-a' });

    const scoped = listInstalledPlugins(db, null);
    expect(scoped.map((p) => p.id)).toEqual(['plugin-unbound']);
  });

  it('quarantines an unbound user plugin from every explicit workspace', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-legacy'));

    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).not.toContain('plugin-legacy');
    expect(listInstalledPlugins(db, 'ws-2', 'member-b').map((p) => p.id)).not.toContain('plugin-legacy');
    expect(listInstalledPlugins(db, null, null).map((p) => p.id)).toContain('plugin-legacy');
    expect(listInstalledPlugins(db).map((p) => p.id)).toContain('plugin-legacy');
  });

  it('keeps bundled plugins visible in every explicit workspace', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-bundled', 'bundled'));

    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).toContain('plugin-bundled');
    expect(listInstalledPlugins(db, 'ws-2', 'member-b').map((p) => p.id)).toContain('plugin-bundled');
  });

  it('hides a plugin bound to a different workspace, but shows it from its own', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-claimed'));
    ensureWorkspaceResource(db, 'plugin', 'ws-1', 'plugin-claimed', { createdByWorkspaceMemberId: 'member-a' });

    expect(listInstalledPlugins(db, 'ws-1', 'member-a').map((p) => p.id)).toContain('plugin-claimed');
    expect(listInstalledPlugins(db, 'ws-2', 'member-a').map((p) => p.id)).not.toContain('plugin-claimed');
  });

  it('hides an unshared personal plugin from another member in the same workspace', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-personal'));
    ensureWorkspaceResource(db, 'plugin', 'ws-team', 'plugin-personal', {
      visibility: 'personal',
      createdByWorkspaceMemberId: 'member-owner',
    });

    expect(listInstalledPlugins(db, 'ws-team', 'member-owner').map((p) => p.id))
      .toContain('plugin-personal');
    expect(listInstalledPlugins(db, 'ws-team', 'member-other').map((p) => p.id))
      .not.toContain('plugin-personal');
  });

  it('shows a shared Team plugin to another member in the same workspace', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-team'));
    ensureWorkspaceResource(db, 'plugin', 'ws-team', 'plugin-team', {
      visibility: 'team',
      createdByWorkspaceMemberId: 'member-owner',
    });

    expect(listInstalledPlugins(db, 'ws-team', 'member-other').map((p) => p.id))
      .toContain('plugin-team');
  });

  it('denies reads of a retired Team plugin without hiding a same-id Personal plugin', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-retracted'));
    ensureWorkspaceResource(db, 'plugin', 'ws-personal', 'plugin-retracted', {
      visibility: 'personal',
      createdByWorkspaceMemberId: 'member-personal',
    });
    const teamBindingId = workspaceTeamPluginBindingResourceId(
      'ws-1',
      'plugin-retracted',
    );
    ensureWorkspaceResource(db, 'plugin', 'ws-1', teamBindingId, {
      visibility: 'team',
      resourceState: 'active',
    });
    updateWorkspaceResource(db, 'plugin', 'ws-1', teamBindingId, {
      resourceState: 'deleted',
    });

    expect(listInstalledPlugins(db, 'ws-personal', 'member-personal').map((p) => p.id)).toContain(
      'plugin-retracted',
    );
    expect(listInstalledPlugins(db).map((p) => p.id)).toContain(
      'plugin-retracted',
    );
    expect(
      workspaceTeamPluginBindingAllowsRead(db, 'ws-1', 'plugin-retracted'),
    ).toBe(false);
  });

  it('scopes Team mirror bindings independently for each Workspace', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'plugin', 'ws-personal', 'legacy-team-plugin', {
      visibility: 'personal',
      resourceState: 'active',
    });
    expect(
      workspaceTeamPluginBindingAllowsRead(db, 'ws-1', 'legacy-team-plugin'),
    ).toBe(true);

    const otherWorkspaceBindingId = workspaceTeamPluginBindingResourceId(
      'ws-2',
      'legacy-team-plugin',
    );
    ensureWorkspaceResource(db, 'plugin', 'ws-2', otherWorkspaceBindingId, {
      visibility: 'team',
      resourceState: 'active',
    });
    expect(
      workspaceTeamPluginBindingAllowsRead(db, 'ws-1', 'legacy-team-plugin'),
    ).toBe(true);
  });

  it('keeps a Personal plugin visible after a same-id Team mirror is retired', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    upsertInstalledPlugin(db, fakePlugin('plugin-collision'));
    ensureWorkspaceResource(db, 'plugin', 'ws-personal', 'plugin-collision', {
      visibility: 'personal',
      createdByWorkspaceMemberId: 'member-personal',
    });
    const teamBindingId = workspaceTeamPluginBindingResourceId(
      'ws-team',
      'plugin-collision',
    );
    ensureWorkspaceResource(db, 'plugin', 'ws-team', teamBindingId, {
      visibility: 'team',
      resourceState: 'active',
    });
    updateWorkspaceResource(db, 'plugin', 'ws-team', teamBindingId, {
      resourceState: 'deleted',
    });

    expect(listInstalledPlugins(db, 'ws-personal', 'member-personal').map((plugin) => plugin.id))
      .toContain('plugin-collision');
  });

  it('drops a Team plugin retracted while its folder is resolving', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const pluginId = 'plugin-concurrent-retraction';
    const workspaceId = 'ws-team';
    const bindingId = workspaceTeamPluginBindingResourceId(workspaceId, pluginId);
    ensureWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
      visibility: 'team',
      resourceState: 'active',
    });

    let finishResolve!: (value: { id: string }) => void;
    const resolveGate = new Promise<{ id: string }>((resolve) => {
      finishResolve = resolve;
    });
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const pending = resolveWorkspaceTeamPluginWithBindingGate({
      bindingAllowsRead: () =>
        workspaceTeamPluginBindingAllowsRead(db, workspaceId, pluginId),
      resolve: async () => {
        resolveStarted();
        return resolveGate;
      },
    });
    await started;
    updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
      resourceState: 'deleted',
    });
    finishResolve({ id: pluginId });

    await expect(pending).resolves.toBeNull();
  });

  it('does not reactivate a Team plugin retracted while materialization is resolving', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const pluginId = 'plugin-sync-retraction';
    const workspaceId = 'ws-team';
    const bindingId = workspaceTeamPluginBindingResourceId(workspaceId, pluginId);
    ensureWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
      visibility: 'team',
      resourceState: 'active',
    });

    let finishResolve!: (value: { id: string }) => void;
    const resolveGate = new Promise<{ id: string }>((resolve) => {
      finishResolve = resolve;
    });
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const pending = resolveAndActivateWorkspaceTeamPlugin({
      resolve: async () => {
        resolveStarted();
        return resolveGate;
      },
      captureActivationFence: () => 'active',
      stillShared: async () => false,
      activationFenceIsCurrent: () => false,
      activate: () => {
        updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
          resourceState: 'active',
        });
        return true;
      },
    });
    await started;
    updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
      resourceState: 'deleted',
    });
    finishResolve({ id: pluginId });
    await pending;

    expect(
      workspaceTeamPluginBindingAllowsRead(db, workspaceId, pluginId),
    ).toBe(false);
  });

  it.each(['versioned', 'unversioned'] as const)(
    'does not let an older cached %s listing reactivate a retired Team plugin',
    async (mode) => {
      const db = openDatabase(tempDir, { dataDir: tempDir });
      const pluginId = `plugin-old-${mode}`;
      const workspaceId = 'ws-team';
      const bindingId = workspaceTeamPluginBindingResourceId(workspaceId, pluginId);
      ensureWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
        visibility: 'team',
        resourceState: 'active',
      });
      let finishAuthoritativeRead!: (stillShared: boolean) => void;
      const authoritativeRead = new Promise<boolean>((resolve) => {
        finishAuthoritativeRead = resolve;
      });
      let readStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        readStarted = resolve;
      });
      const oldListing = activateWorkspaceTeamPluginIfStillShared({
        captureActivationFence: () =>
          workspaceTeamPluginBindingActivationFence(db, workspaceId, pluginId),
        stillShared: async () => {
          readStarted();
          return authoritativeRead;
        },
        activationFenceIsCurrent: (fence) =>
          workspaceTeamPluginBindingActivationFence(db, workspaceId, pluginId) === fence,
        activate: () => {
          updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
            resourceState: 'active',
          });
          return true;
        },
      });
      await started;
      updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
        resourceState: 'deleted',
      });
      finishAuthoritativeRead(false);
      await oldListing;

      expect(
        workspaceTeamPluginBindingAllowsRead(db, workspaceId, pluginId),
      ).toBe(false);
    },
  );

  it('rejects a superseded positive shared read after a newer binding tombstone', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const pluginId = 'plugin-superseded-positive';
    const workspaceId = 'ws-team';
    const bindingId = workspaceTeamPluginBindingResourceId(workspaceId, pluginId);
    ensureWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
      visibility: 'team',
      resourceState: 'active',
    });

    let finishAuthoritativeRead!: (stillShared: boolean) => void;
    const authoritativeRead = new Promise<boolean>((resolve) => {
      finishAuthoritativeRead = resolve;
    });
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    const staleActivation = activateWorkspaceTeamPluginIfStillShared({
      captureActivationFence: () =>
        workspaceTeamPluginBindingActivationFence(db, workspaceId, pluginId),
      stillShared: async () => {
        readStarted();
        return authoritativeRead;
      },
      activationFenceIsCurrent: (fence) =>
        workspaceTeamPluginBindingActivationFence(db, workspaceId, pluginId) === fence,
      activate: () => {
        updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
          resourceState: 'active',
        });
        return true;
      },
    });
    await started;
    const originalUpdatedAt = Number(
      getWorkspaceResourceByResourceId(db, 'plugin', bindingId)?.updatedAt,
    );
    updateWorkspaceResource(db, 'plugin', workspaceId, bindingId, {
      resourceState: 'deleted',
      // Simulate two writes in the same millisecond: resourceState must keep
      // the tombstone visible even when updatedAt alone cannot distinguish it.
      updatedAt: originalUpdatedAt,
    });
    finishAuthoritativeRead(true);

    await expect(staleActivation).resolves.toBe(false);
    expect(
      workspaceTeamPluginBindingAllowsRead(db, workspaceId, pluginId),
    ).toBe(false);
  });
});
