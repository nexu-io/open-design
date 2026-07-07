import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { materializeRef, packTree, pushTree } from '../src/resource-drive.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';
import { createSharingOrchestrator } from '../src/resource-sharing/orchestrator.js';
import {
  getSharedByLocal,
  migrateResourceSharing,
} from '../src/resource-sharing/store.js';

const mockState = vi.hoisted(() => ({
  materializations: [] as Array<Record<string, string>>,
  versions: [{ id: 'version_1', version: 1, manifestDigest: 'digest_1' }],
  latestVersionId: 'version_1',
  createdResources: [] as string[],
  createdResourceCalls: 0,
  delayCreateResource: false,
  principalTeamId: 'team_1',
  resourceKind: 'design_system',
}));

vi.mock('../src/integrations/resource-hub.js', () => ({
  createResourceHubClient: vi.fn(() => ({
    createResource: vi.fn(async () => {
      mockState.createdResourceCalls += 1;
      if (mockState.delayCreateResource) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      return {
        id: mockState.createdResources.shift() ?? 'created_resource',
      };
    }),
    getResource: vi.fn(async (_principal, resourceId) => ({
      id: resourceId,
      teamId: 'team_1',
      kind: mockState.resourceKind,
      ownerMemberId: 'member_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    })),
    listVersions: vi.fn(async () => mockState.versions),
    getManifest: vi.fn(async (_principal, digest) => ({
      digest,
      entries: [],
    })),
    getRef: vi.fn(async () => ({
      name: 'latest',
      versionId: mockState.latestVersionId,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  })),
  readResourceHubPrincipal: vi.fn(() => ({
    memberId: 'member_1',
    teamId: mockState.principalTeamId,
    role: 'member',
    lifecycleState: null,
  })),
}));

vi.mock('../src/resource-drive.js', () => ({
  materializeRef: vi.fn(async (_client, _principal, _resourceId, _ref, destDir) => {
    const files = mockState.materializations.shift();
    if (!files) throw new Error('missing mock materialization');
    for (const [relativePath, contents] of Object.entries(files)) {
      const target = path.join(destDir, relativePath);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, contents);
    }
    const version = mockState.versions.find(
      (candidate) => candidate.id === mockState.latestVersionId,
    );
    if (!version) throw new Error('missing mock latest version');
    return version;
  }),
  packTree: vi.fn(),
  pushTree: vi.fn(async () => ({
    id: 'version_pushed',
    version: 2,
    manifestDigest: 'digest_pushed',
  })),
}));

describe('resource-sharing orchestrator', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    migrateInstalledPluginsFixture(db);
    migrateResourceSharing(db);
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-resource-sharing-'));
    mockState.materializations = [];
    mockState.versions = [
      { id: 'version_1', version: 1, manifestDigest: 'digest_1' },
    ];
    mockState.latestVersionId = 'version_1';
    mockState.createdResources = [];
    mockState.createdResourceCalls = 0;
    mockState.delayCreateResource = false;
    mockState.principalTeamId = 'team_1';
    mockState.resourceKind = 'design_system';
    vi.clearAllMocks();
  });

  afterEach(async () => {
    db.close();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it('replaces the team copy on repull so files deleted upstream disappear', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });
    mockState.materializations.push(
      {
        'DESIGN.md': 'v1',
        'components/Button.tsx': 'export const Button = () => null;\n',
      },
      {
        'DESIGN.md': 'v2',
        'tokens.json': '{}\n',
      },
    );

    const first = await orchestrator.pull('design_system', 'hub_design_system');
    expect(
      await fsp.readFile(
        path.join(first.dir ?? '', 'components', 'Button.tsx'),
        'utf8',
      ),
    ).toContain('Button');

    mockState.versions = [
      { id: 'version_2', version: 2, manifestDigest: 'digest_2' },
    ];
    mockState.latestVersionId = 'version_2';
    const second = await orchestrator.pull('design_system', 'hub_design_system');

    await expect(
      fsp.access(path.join(second.dir ?? '', 'components', 'Button.tsx')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fsp.readFile(path.join(second.dir ?? '', 'DESIGN.md'), 'utf8'),
    ).resolves.toBe('v2');
    await expect(
      fsp.readFile(path.join(second.dir ?? '', 'tokens.json'), 'utf8'),
    ).resolves.toBe('{}\n');
  });

  it('reads detail from the latest ref instead of version list order', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });
    mockState.versions = [
      { id: 'version_1', version: 1, manifestDigest: 'digest_1' },
      { id: 'version_2', version: 2, manifestDigest: 'digest_2' },
    ];
    mockState.latestVersionId = 'version_2';

    await expect(orchestrator.detail('hub_design_system')).resolves.toMatchObject({
      manifest: { digest: 'digest_2' },
      versions: mockState.versions,
    });
  });

  it('records pull sync state from the latest ref instead of version list order', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });
    mockState.materializations.push({ 'DESIGN.md': 'latest\n' });
    mockState.versions = [
      { id: 'version_1', version: 1, manifestDigest: 'digest_1' },
      { id: 'version_2', version: 2, manifestDigest: 'digest_2' },
    ];
    mockState.latestVersionId = 'version_2';

    await expect(
      orchestrator.pull('design_system', 'hub_design_system'),
    ).resolves.toMatchObject({
      version: 2,
      alreadyOwned: false,
    });
    expect(
      getSharedByLocal(db, 'team_1', 'design_system', 'hub_design_system')
        ?.lastSyncedVersion,
    ).toBe(2);
  });

  it('rejects traversal local ids before packing a shared design system', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });

    await expect(
      orchestrator.share('design_system', '../brands'),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_resource_id',
    });
    expect(packTree).not.toHaveBeenCalled();
  });

  it('stores canonical user design-system ids while packing the backing slug directory', async () => {
    const paths = {
      RUNTIME_DATA_DIR: tempDir,
      USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      SKILL_ROOTS: [path.join(tempDir, 'skills')],
    };
    const editableDir = path.join(paths.USER_DESIGN_SYSTEMS_DIR, 'acme');
    await fsp.mkdir(editableDir, { recursive: true });
    await fsp.writeFile(path.join(editableDir, 'DESIGN.md'), 'local design\n');
    const orchestrator = createSharingOrchestrator({ db, paths });

    await expect(orchestrator.share('design_system', 'user:acme')).resolves.toEqual({
      hubResourceId: 'created_resource',
      version: 2,
    });

    expect(packTree).toHaveBeenCalledWith(editableDir);
    expect(getSharedByLocal(db, 'team_1', 'design_system', 'user:acme')).toMatchObject({
      hubResourceId: 'created_resource',
      role: 'owner',
    });
    expect(getSharedByLocal(db, 'team_1', 'design_system', 'acme')).toBeNull();
  });

  it('rejects sharing over a pulled consumer mapping with the same local id', async () => {
    const paths = {
      RUNTIME_DATA_DIR: tempDir,
      USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      SKILL_ROOTS: [path.join(tempDir, 'skills')],
    };
    const orchestrator = createSharingOrchestrator({ db, paths });
    mockState.materializations.push({ 'DESIGN.md': 'team copy\n' });

    await orchestrator.pull('design_system', 'hub-1');
    const editableDir = path.join(paths.USER_DESIGN_SYSTEMS_DIR, 'hub-1');
    await fsp.mkdir(editableDir, { recursive: true });
    await fsp.writeFile(path.join(editableDir, 'DESIGN.md'), 'local edit\n');

    await expect(
      orchestrator.share('design_system', 'hub-1'),
    ).rejects.toMatchObject({
      status: 409,
      code: 'consumer_mapping_conflict',
    });
    expect(packTree).not.toHaveBeenCalled();
    expect(pushTree).not.toHaveBeenCalled();
    expect(await fsp.readFile(path.join(editableDir, 'DESIGN.md'), 'utf8')).toBe(
      'local edit\n',
    );
  });

  it('creates a team-local hub resource when sharing the same local id from another team', async () => {
    const paths = {
      RUNTIME_DATA_DIR: tempDir,
      USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      SKILL_ROOTS: [path.join(tempDir, 'skills')],
    };
    const editableDir = path.join(paths.USER_DESIGN_SYSTEMS_DIR, 'demo');
    await fsp.mkdir(editableDir, { recursive: true });
    await fsp.writeFile(path.join(editableDir, 'DESIGN.md'), 'local design\n');
    mockState.createdResources = ['hub-team-1', 'hub-team-2'];
    const orchestrator = createSharingOrchestrator({ db, paths });

    await expect(orchestrator.share('design_system', 'demo')).resolves.toEqual({
      hubResourceId: 'hub-team-1',
      version: 2,
    });
    mockState.principalTeamId = 'team_2';

    await expect(orchestrator.share('design_system', 'demo')).resolves.toEqual({
      hubResourceId: 'hub-team-2',
      version: 2,
    });

    expect(getSharedByLocal(db, 'team_1', 'design_system', 'demo')?.hubResourceId).toBe(
      'hub-team-1',
    );
    expect(getSharedByLocal(db, 'team_2', 'design_system', 'demo')?.hubResourceId).toBe(
      'hub-team-2',
    );
    expect(pushTree).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ teamId: 'team_1' }),
      'hub-team-1',
      undefined,
      { ref: 'latest' },
    );
    expect(pushTree).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ teamId: 'team_2' }),
      'hub-team-2',
      undefined,
      { ref: 'latest' },
    );
  });

  it('serializes concurrent shares of the same local resource before creating a hub resource', async () => {
    const paths = {
      RUNTIME_DATA_DIR: tempDir,
      USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
      SKILL_ROOTS: [path.join(tempDir, 'skills')],
    };
    const editableDir = path.join(paths.USER_DESIGN_SYSTEMS_DIR, 'demo');
    await fsp.mkdir(editableDir, { recursive: true });
    await fsp.writeFile(path.join(editableDir, 'DESIGN.md'), 'local design\n');
    mockState.createdResources = ['hub-single', 'hub-leaked'];
    mockState.delayCreateResource = true;
    const orchestrator = createSharingOrchestrator({ db, paths });

    await expect(
      Promise.all([
        orchestrator.share('design_system', 'demo'),
        orchestrator.share('design_system', 'demo'),
      ]),
    ).resolves.toEqual([
      { hubResourceId: 'hub-single', version: 2 },
      { hubResourceId: 'hub-single', version: 2 },
    ]);

    expect(mockState.createdResourceCalls).toBe(1);
    expect(getSharedByLocal(db, 'team_1', 'design_system', 'demo')?.hubResourceId).toBe(
      'hub-single',
    );
    expect(pushTree).toHaveBeenCalledTimes(2);
    expect(pushTree).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ teamId: 'team_1' }),
      'hub-single',
      undefined,
      { ref: 'latest' },
    );
    expect(pushTree).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ teamId: 'team_1' }),
      'hub-single',
      undefined,
      { ref: 'latest' },
    );
  });

  it('rejects traversal hub ids before materializing a pulled design system', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });

    await expect(
      orchestrator.pull('design_system', '../../design-systems/hub-1'),
    ).rejects.toMatchObject({
      status: 400,
      code: 'invalid_resource_id',
    });
    expect(materializeRef).not.toHaveBeenCalled();
  });

  it('rejects pulling a hub resource through the wrong kind before materializing', async () => {
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });
    mockState.resourceKind = 'plugin';
    mockState.materializations.push({ 'DESIGN.md': 'wrong kind\n' });

    await expect(
      orchestrator.pull('design_system', 'hub-plugin'),
    ).rejects.toMatchObject({
      status: 409,
      code: 'resource_kind_mismatch',
    });
    expect(materializeRef).not.toHaveBeenCalled();
    await expect(
      fsp.access(
        path.join(tempDir, 'team-shared', 'design-systems', 'hub-plugin'),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('shares a skill whose public id comes from SKILL.md frontmatter', async () => {
    const userSkillRoot = path.join(tempDir, 'user-skills');
    const bundledSkillRoot = path.join(tempDir, 'bundled-skills');
    const builtInSkillDir = path.join(bundledSkillRoot, 'taste-skill-v1');
    await fsp.mkdir(builtInSkillDir, { recursive: true });
    await fsp.writeFile(
      path.join(builtInSkillDir, 'SKILL.md'),
      '---\nname: design-taste-frontend-v1\n---\n# Built in\n',
    );
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [userSkillRoot, bundledSkillRoot],
      },
    });

    await expect(
      orchestrator.share('skill', 'design-taste-frontend-v1'),
    ).resolves.toEqual({
      hubResourceId: 'created_resource',
      version: 2,
    });
    expect(packTree).toHaveBeenCalledWith(builtInSkillDir);
    expect(pushTree).toHaveBeenCalled();
  });

  it('shares a derived example skill id through the parent skill directory', async () => {
    const skillRoot = path.join(tempDir, 'skills');
    const parentSkillDir = path.join(skillRoot, 'parent-skill');
    await fsp.mkdir(path.join(parentSkillDir, 'examples'), { recursive: true });
    await fsp.writeFile(
      path.join(parentSkillDir, 'SKILL.md'),
      '---\nname: parent\n---\n# Parent skill\n',
    );
    await fsp.writeFile(
      path.join(parentSkillDir, 'examples', 'child.html'),
      '<!doctype html><p>child</p>\n',
    );
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [skillRoot],
      },
    });

    await expect(orchestrator.share('skill', 'parent:child')).resolves.toEqual({
      hubResourceId: 'created_resource',
      version: 2,
    });
    expect(packTree).toHaveBeenCalledWith(parentSkillDir);
    expect(pushTree).toHaveBeenCalled();
  });

  it('shares a bundled plugin from its installed plugin record', async () => {
    const bundledPluginDir = path.join(
      tempDir,
      'plugins',
      '_official',
      'bundled-plugin',
    );
    await fsp.mkdir(bundledPluginDir, { recursive: true });
    await fsp.writeFile(
      path.join(bundledPluginDir, 'open-design.json'),
      JSON.stringify({ name: 'bundled-plugin', version: '1.0.0' }),
    );
    upsertInstalledPlugin(db, {
      id: 'bundled-plugin',
      title: 'Bundled Plugin',
      version: '1.0.0',
      sourceKind: 'bundled',
      source: bundledPluginDir,
      trust: 'bundled',
      capabilitiesGranted: [],
      manifest: { name: 'bundled-plugin', version: '1.0.0' },
      fsPath: bundledPluginDir,
      installedAt: Date.now(),
      updatedAt: Date.now(),
    });
    const orchestrator = createSharingOrchestrator({
      db,
      paths: {
        RUNTIME_DATA_DIR: tempDir,
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'design-systems'),
        SKILL_ROOTS: [path.join(tempDir, 'skills')],
      },
    });

    await expect(orchestrator.share('plugin', 'bundled-plugin')).resolves.toEqual({
      hubResourceId: 'created_resource',
      version: 2,
    });
    expect(packTree).toHaveBeenCalledWith(bundledPluginDir);
    expect(pushTree).toHaveBeenCalled();
  });
});

function migrateInstalledPluginsFixture(db: Database.Database): void {
  db.exec(`
    CREATE TABLE installed_plugins (
      id                   TEXT PRIMARY KEY,
      title                TEXT NOT NULL,
      version              TEXT NOT NULL,
      source_kind          TEXT NOT NULL,
      source               TEXT NOT NULL,
      pinned_ref           TEXT,
      source_digest        TEXT,
      source_marketplace_id TEXT,
      source_marketplace_entry_name TEXT,
      source_marketplace_entry_version TEXT,
      marketplace_trust    TEXT,
      resolved_source      TEXT,
      resolved_ref         TEXT,
      manifest_digest      TEXT,
      archive_integrity    TEXT,
      trust                TEXT NOT NULL,
      capabilities_granted TEXT NOT NULL,
      manifest_json        TEXT NOT NULL,
      fs_path              TEXT NOT NULL,
      installed_at         INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
    )
  `);
}
