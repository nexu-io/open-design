import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { materializeWorkspaceScopedTeamResource } from '../../src/collab/team-resource-materialization.js';
import {
  closeDatabase,
  ensureWorkspaceProject,
  ensureWorkspaceResource,
  getProject,
  insertProject,
  openDatabase,
  updateProject,
} from '../../src/db.js';
import * as designSystems from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import { workspaceTeamDesignSystemBindingResourceId } from '../../src/design-systems/workspace-team-binding.js';
import {
  isSafeId,
  listFiles,
  readProjectFile,
  resolveProjectDir,
  writeProjectFile,
} from '../../src/projects.js';

describe('design-system workspace projects preserve exact Workspace scope', () => {
  let root = '';
  let userDesignSystemsDir = '';
  let projectsDir = '';
  let db: ReturnType<typeof openDatabase>;
  let services: ReturnType<typeof createDesignSystemServerServices>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'od-ds-workspace-scope-'));
    userDesignSystemsDir = path.join(root, 'design-systems');
    projectsDir = path.join(root, 'projects');
    await Promise.all([
      mkdir(userDesignSystemsDir, { recursive: true }),
      mkdir(projectsDir, { recursive: true }),
      mkdir(path.join(root, 'built-in-design-systems'), { recursive: true }),
    ]);
    db = openDatabase(root, { dataDir: root });
    services = createDesignSystemServerServices({
      getDb: () => db,
      roots: { SKILL_ROOTS: [], DESIGN_TEMPLATE_ROOTS: [], ALL_SKILL_LIKE_ROOTS: [] },
      paths: {
        PROJECTS_DIR: projectsDir,
        DESIGN_SYSTEMS_DIR: path.join(root, 'built-in-design-systems'),
        USER_DESIGN_SYSTEMS_DIR: userDesignSystemsDir,
      },
      skills: {
        listSkills: async () => [],
        findSkillById: () => undefined,
      },
      designSystems: designSystems as never,
      projects: {
        getProject,
        insertProject,
        updateProject,
        readProjectFile,
        writeProjectFile,
        listFiles,
        resolveProjectDir,
        isSafeId,
      },
      bindProjectToWorkspace: (projectId, createdAt, summary) => {
        ensureWorkspaceProject(db, {
          projectId,
          workspaceId: summary.workspaceId,
          visibility: summary.teamSynced === true ? 'team' : 'personal',
          resourceState: 'active',
          createdByWorkspaceMemberId: 'team-member',
          updatedByWorkspaceMemberId: 'team-member',
          createdAt,
          updatedAt: createdAt,
        });
      },
    });
  });

  afterEach(async () => {
    closeDatabase();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function seedSameIdPersonalAndTeamSystems() {
    const personal = await designSystems.createUserDesignSystem(userDesignSystemsDir, {
      title: 'Personal Shopify',
      body: '# Personal Shopify\n\nPersonal-only design system.\n',
    });
    const personalProjectId = 'personal-shopify-project';
    await designSystems.linkUserDesignSystemProject(
      userDesignSystemsDir,
      personal.id,
      personalProjectId,
    );
    const now = Date.now();
    insertProject(db, {
      id: personalProjectId,
      name: 'Personal Shopify Project',
      designSystemId: personal.id,
      metadata: { importedFrom: 'design-system' },
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId: personalProjectId,
      workspaceId: 'personal-workspace',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'personal-member',
      updatedByWorkspaceMemberId: 'personal-member',
      createdAt: now,
      updatedAt: now,
    });
    await writeProjectFile(
      projectsDir,
      personalProjectId,
      'DESIGN.md',
      Buffer.from('# Personal project sentinel\n'),
      {},
      { importedFrom: 'design-system' },
    );

    const logoBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0xff, 0xfe, 0x80, 0x01, 0x02, 0x03,
    ]);
    await materializeWorkspaceScopedTeamResource({
      kindRoot: userDesignSystemsDir,
      storageName: 'personal-shopify',
      identity: {
        kind: 'design_system',
        workspaceId: 'team-workspace',
        resourceId: personal.id,
        hubResourceId: 'team-shopify-resource',
      },
      pullInto: async (dir) => {
        await mkdir(path.join(dir, 'assets'), { recursive: true });
        await Promise.all([
          writeFile(path.join(dir, 'DESIGN.md'), '# Team Shopify\n\nTeam-only body.\n'),
          writeFile(
            path.join(dir, 'metadata.json'),
            JSON.stringify({
              title: 'Team Shopify',
              workspaceId: 'team-workspace',
              teamSynced: true,
              status: 'published',
              // A publisher-local id is provenance, not authority on this daemon.
              projectId: personalProjectId,
            }),
          ),
          writeFile(
            path.join(dir, 'brand.json'),
            JSON.stringify({ logo: { primary: 'assets/shopify.png' } }),
          ),
          writeFile(
            path.join(dir, 'manifest.json'),
            JSON.stringify({
              schemaVersion: 'od-design-system-project/v1',
              id: 'personal-shopify',
              name: 'Team Shopify',
              category: 'Commerce',
              files: { design: 'DESIGN.md', tokens: 'tokens.css' },
              assetsDir: 'assets',
            }),
          ),
          writeFile(path.join(dir, 'assets', 'shopify.png'), logoBytes),
        ]);
      },
      verifyWorkspaceScope: async () => true,
      verifyStillShared: async () => true,
    });
    // Team-resource sync writes the local materialization and its binding
    // together. Keep this fixture faithful so read-time tombstone filtering
    // can distinguish an active mirror from a stale directory left on disk.
    ensureWorkspaceResource(
      db,
      'design_system',
      'team-workspace',
      workspaceTeamDesignSystemBindingResourceId('team-workspace', personal.id),
      {
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'team-member',
        updatedByWorkspaceMemberId: 'team-member',
        resourceHubResourceId: 'team-shopify-resource',
      },
    );
    return { designSystemId: personal.id, logoBytes, personalProjectId };
  }

  it('opens the exact Team copy without mutating a same-id Personal project and preserves binary logo bytes', async () => {
    const { designSystemId, logoBytes, personalProjectId } =
      await seedSameIdPersonalAndTeamSystems();
    const ensureScoped = services.ensureUserDesignSystemWorkspaceProject as unknown as (
      dbHandle: typeof db,
      id: string,
      options: { workspaceId: string; workspaceMemberId: string },
    ) => ReturnType<typeof services.ensureUserDesignSystemWorkspaceProject>;

    const workspace = await ensureScoped(db, designSystemId, {
      workspaceId: 'team-workspace',
      workspaceMemberId: 'team-member',
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.project.id).not.toBe(personalProjectId);
    expect(workspace?.project.name).toBe('Team Shopify');
    expect(getProject(db, personalProjectId)?.name).toBe('Personal Shopify Project');
    await expect(
      readProjectFile(
        projectsDir,
        personalProjectId,
        'DESIGN.md',
        { importedFrom: 'design-system' },
      ).then((file) => file.buffer.toString('utf8')),
    ).resolves.toBe('# Personal project sentinel\n');

    const mirroredLogo = await readProjectFile(
      projectsDir,
      workspace!.project.id,
      'assets/shopify.png',
      workspace!.project.metadata,
    );
    expect(mirroredLogo.buffer.equals(logoBytes)).toBe(true);
    const mirroredDesign = await readProjectFile(
      projectsDir,
      workspace!.project.id,
      'DESIGN.md',
      workspace!.project.metadata,
    );
    expect(mirroredDesign.buffer.toString('utf8')).toContain('Team-only body');
  });

  it('fails closed when a scoped Team operation has no verified member identity', async () => {
    const { designSystemId } = await seedSameIdPersonalAndTeamSystems();
    const ensureScoped = services.ensureUserDesignSystemWorkspaceProject as unknown as (
      dbHandle: typeof db,
      id: string,
      options: { workspaceId: string; workspaceMemberId: null },
    ) => ReturnType<typeof services.ensureUserDesignSystemWorkspaceProject>;

    await expect(
      ensureScoped(db, designSystemId, {
        workspaceId: 'team-workspace',
        workspaceMemberId: null,
      }),
    ).resolves.toBeNull();
  });

  it('does not reuse a same-Workspace Personal project that occupies the deterministic Team backing id', async () => {
    const { designSystemId } = await seedSameIdPersonalAndTeamSystems();
    const suffix = createHash('sha256')
      .update(`team-workspace\0${designSystemId}`, 'utf8')
      .digest('hex')
      .slice(0, 16);
    const occupiedProjectId = `ds-personal-shopify-${suffix}`;
    const now = Date.now();
    insertProject(db, {
      id: occupiedProjectId,
      name: 'Personal collision sentinel',
      designSystemId: null,
      metadata: { importedFrom: 'personal-project' },
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId: occupiedProjectId,
      workspaceId: 'team-workspace',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'team-member',
      updatedByWorkspaceMemberId: 'team-member',
      createdAt: now,
      updatedAt: now,
    });
    const ensureScoped = services.ensureUserDesignSystemWorkspaceProject as unknown as (
      dbHandle: typeof db,
      id: string,
      options: { workspaceId: string; workspaceMemberId: string },
    ) => ReturnType<typeof services.ensureUserDesignSystemWorkspaceProject>;

    await expect(
      ensureScoped(db, designSystemId, {
        workspaceId: 'team-workspace',
        workspaceMemberId: 'team-member',
      }),
    ).resolves.toBeNull();
    expect(getProject(db, occupiedProjectId)).toMatchObject({
      name: 'Personal collision sentinel',
      designSystemId: null,
      metadata: { importedFrom: 'personal-project' },
    });
  });
});
