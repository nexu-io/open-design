import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureWorkspaceResource,
  openDatabase,
  updateWorkspaceResource,
} from '../src/db.js';
import {
  materializeWorkspaceScopedTeamResource,
  teamResourceMaterializationDir,
} from '../src/collab/team-resource-materialization.js';
import {
  localPluginRegistryScope,
  resolveLocalPluginBySource,
  resolvePluginFolder,
  resolvePluginSnapshot,
  upsertInstalledPlugin,
  workspaceTeamPluginBindingResourceId,
} from '../src/plugins/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

async function pluginManifest(folder: string, title: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, 'open-design.json'),
    JSON.stringify({ name: 'shared-id', title, version: '1.0.0' }),
  );
}

describe('resolveLocalPluginBySource', () => {
  it('derives local registry provenance only for an exact Team source', () => {
    expect(localPluginRegistryScope({
      id: 'shared-id',
      source: 'team:plugin:workspace-a:shared-id',
    })).toEqual({ workspaceId: 'workspace-a', workspaceMemberId: null });
    expect(localPluginRegistryScope({
      id: 'shared-id',
      source: 'local:personal:shared-id',
    })).toBeUndefined();
  });

  it('selects the exact local record when Personal and Team share an id', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-local-plugin-source-'));
    roots.push(root);
    const dataDir = path.join(root, 'data');
    const pluginsRoot = path.join(dataDir, 'plugins');
    const db = openDatabase(root, { dataDir });

    const personalFolder = path.join(root, 'personal-plugin');
    await pluginManifest(personalFolder, 'Personal copy');
    const personal = await resolvePluginFolder({
      folder: personalFolder,
      folderId: 'shared-id',
      sourceKind: 'local',
      source: 'local:personal:shared-id',
    });
    if (!personal.ok) throw new Error(personal.errors.join('; '));
    upsertInstalledPlugin(db, personal.record);

    const team = await materializeWorkspaceScopedTeamResource({
      kindRoot: pluginsRoot,
      identity: {
        kind: 'plugin',
        workspaceId: 'workspace-a',
        resourceId: 'shared-id',
        hubResourceId: 'hub-team-shared-id',
      },
      storageName: 'shared-id',
      pullInto: (dir) => pluginManifest(dir, 'Team copy'),
      verifyWorkspaceScope: async () => true,
      verifyStillShared: async () => true,
    });
    if (team.status !== 'committed') throw new Error('fixture did not materialize');

    const exactTeamPlugin = await resolveLocalPluginBySource({
      db,
      id: 'shared-id',
      source: team.sourceKey,
      userPluginsRoot: pluginsRoot,
    });
    expect(exactTeamPlugin).toMatchObject({
      id: 'shared-id',
      title: 'Team copy',
      source: 'team:plugin:workspace-a:shared-id',
      fsPath: teamResourceMaterializationDir(
        pluginsRoot,
        'workspace-a',
        'shared-id',
        'shared-id',
      ),
    });
    await expect(resolveLocalPluginBySource({
      db,
      id: 'shared-id',
      source: 'local:personal:shared-id',
      userPluginsRoot: pluginsRoot,
    })).resolves.toMatchObject({ title: 'Personal copy' });

    db.prepare(`
      INSERT INTO projects (id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('team-project', 'Team project', 1, 1);
    const snapshot = resolvePluginSnapshot({
      db,
      body: { pluginId: 'shared-id' },
      projectId: 'team-project',
      registry: { skills: [], designSystems: [], craft: [], atoms: [] },
      plugin: exactTeamPlugin ?? undefined,
    });
    expect(snapshot?.ok).toBe(true);
    if (snapshot?.ok) expect(snapshot.snapshot.pluginTitle).toBe('Team copy');
  });

  it('rejects a forged Team source without a local materialization marker', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-local-plugin-source-'));
    roots.push(root);
    const dataDir = path.join(root, 'data');
    const db = openDatabase(root, { dataDir });

    await expect(resolveLocalPluginBySource({
      db,
      id: 'shared-id',
      source: 'team:plugin:workspace-forged:shared-id',
      userPluginsRoot: path.join(dataDir, 'plugins'),
    })).resolves.toBeNull();
  });

  it('rejects a Team source after its local binding is tombstoned', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-local-plugin-source-'));
    roots.push(root);
    const dataDir = path.join(root, 'data');
    const pluginsRoot = path.join(dataDir, 'plugins');
    const db = openDatabase(root, { dataDir });
    const source = 'team:plugin:workspace-a:shared-id';

    await materializeWorkspaceScopedTeamResource({
      kindRoot: pluginsRoot,
      identity: {
        kind: 'plugin',
        workspaceId: 'workspace-a',
        resourceId: 'shared-id',
        hubResourceId: 'hub-team-shared-id',
      },
      storageName: 'shared-id',
      pullInto: (dir) => pluginManifest(dir, 'Retired Team copy'),
      verifyWorkspaceScope: async () => true,
      verifyStillShared: async () => true,
    });
    const bindingId = workspaceTeamPluginBindingResourceId('workspace-a', 'shared-id');
    ensureWorkspaceResource(db, 'plugin', 'workspace-a', bindingId, {
      visibility: 'team',
      resourceState: 'active',
    });
    updateWorkspaceResource(db, 'plugin', 'workspace-a', bindingId, {
      resourceState: 'deleted',
    });

    await expect(resolveLocalPluginBySource({
      db,
      id: 'shared-id',
      source,
      userPluginsRoot: pluginsRoot,
    })).resolves.toBeNull();
  });
});
