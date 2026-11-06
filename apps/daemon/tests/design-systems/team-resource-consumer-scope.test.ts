import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  ensureWorkspaceResource,
  openDatabase,
  updateWorkspaceResource,
} from '../../src/db.js';
import * as designSystems from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import * as skills from '../../src/skills.js';
import { materializeWorkspaceScopedTeamResource } from '../../src/collab/team-resource-materialization.js';
import { workspaceTeamSkillBindingResourceId } from '../../src/skills/workspace-team-binding.js';
import { workspaceTeamDesignSystemBindingResourceId } from '../../src/design-systems/workspace-team-binding.js';

const roots: string[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-team-resource-consumer-'));
  roots.push(root);
  const userSkills = path.join(root, 'skills');
  const userDesignSystems = path.join(root, 'design-systems');
  const builtInSkills = path.join(root, 'built-in-skills');
  const builtInDesignSystems = path.join(root, 'built-in-design-systems');
  await Promise.all([
    mkdir(userSkills, { recursive: true }),
    mkdir(userDesignSystems, { recursive: true }),
    mkdir(builtInSkills, { recursive: true }),
    mkdir(builtInDesignSystems, { recursive: true }),
  ]);
  const db = openDatabase(root, { dataDir: root });
  const services = createDesignSystemServerServices({
    getDb: () => db,
    roots: {
      SKILL_ROOTS: [userSkills, builtInSkills],
      DESIGN_TEMPLATE_ROOTS: [],
      ALL_SKILL_LIKE_ROOTS: [],
    },
    paths: {
      PROJECTS_DIR: path.join(root, 'projects'),
      DESIGN_SYSTEMS_DIR: builtInDesignSystems,
      USER_DESIGN_SYSTEMS_DIR: userDesignSystems,
    },
    skills: {
      listSkills: skills.listSkills as never,
      findSkillById: skills.findSkillById as never,
    },
    designSystems: designSystems as never,
    projects: {} as never,
  });
  return { root, userSkills, userDesignSystems, db, services };
}

async function writeSkill(dir: string, content: string) {
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: same-skill\ndescription: ${content}\n---\n\n${content}\n`,
  );
}

async function writeDesignSystem(dir: string, workspaceId: string, content: string) {
  await writeFile(path.join(dir, 'DESIGN.md'), `# Same design system\n\n${content}\n`);
  await writeFile(
    path.join(dir, 'metadata.json'),
    `${JSON.stringify({ workspaceId, teamSynced: true, status: 'published' })}\n`,
  );
}

describe('Team resource consumers use explicit Workspace scope', () => {
  it('reads A and B copies of identical skill/design-system ids without changing legacy Personal reads', async () => {
    const fixture = await createFixture();
    const personalSkillDir = path.join(fixture.userSkills, 'same-skill');
    const personalDesignSystemDir = path.join(fixture.userDesignSystems, 'same-design-system');
    await Promise.all([
      mkdir(personalSkillDir, { recursive: true }),
      mkdir(personalDesignSystemDir, { recursive: true }),
    ]);
    await writeSkill(personalSkillDir, 'personal-skill');
    await writeDesignSystem(personalDesignSystemDir, 'personal-workspace', 'personal-design-system');

    for (const [workspaceId, suffix] of [
      ['workspace-a', 'a'],
      ['workspace-b', 'b'],
    ] as const) {
      await materializeWorkspaceScopedTeamResource({
        kindRoot: fixture.userSkills,
        storageName: 'same-skill',
        identity: {
          kind: 'skill',
          workspaceId,
          resourceId: 'same-skill',
          hubResourceId: `skill-${workspaceId}-same-skill`,
        },
        pullInto: (dir) => writeSkill(dir, `team-skill-${suffix}`),
        verifyWorkspaceScope: async () => true,
        verifyStillShared: async () => true,
      });
      ensureWorkspaceResource(
        fixture.db,
        'design_system',
        workspaceId,
        workspaceTeamDesignSystemBindingResourceId(
          workspaceId,
          'user:same-design-system',
        ),
        { visibility: 'team', resourceState: 'active' },
      );
      ensureWorkspaceResource(
        fixture.db,
        'skill',
        workspaceId,
        workspaceTeamSkillBindingResourceId(workspaceId, 'same-skill'),
        { visibility: 'team', resourceState: 'active' },
      );
      await materializeWorkspaceScopedTeamResource({
        kindRoot: fixture.userDesignSystems,
        storageName: 'same-design-system',
        identity: {
          kind: 'design_system',
          workspaceId,
          resourceId: 'user:same-design-system',
          hubResourceId: `ds-${workspaceId}-same-design-system`,
        },
        pullInto: (dir) =>
          writeDesignSystem(dir, workspaceId, `team-design-system-${suffix}`),
        verifyWorkspaceScope: async () => true,
        verifyStillShared: async () => true,
      });
    }

    const [skillsA, skillsB, legacySkills] = await Promise.all([
      fixture.services.listAllSkills({ workspaceId: 'workspace-a' }),
      fixture.services.listAllSkills({ workspaceId: 'workspace-b' }),
      fixture.services.listAllSkills(),
    ]);
    expect(skills.findSkillById(skillsA, 'same-skill')?.body).toContain('team-skill-a');
    expect(skills.findSkillById(skillsB, 'same-skill')?.body).toContain('team-skill-b');
    expect(skills.findSkillById(legacySkills, 'same-skill')?.body).toContain('personal-skill');
    await expect(
      fixture.services.validateProjectSkillId('same-skill', {
        workspaceId: 'workspace-a',
      }),
    ).resolves.toEqual({ ok: true, id: 'same-skill' });
    await expect(
      fixture.services.validateProjectSkillId('same-skill', {
        workspaceId: 'workspace-b',
      }),
    ).resolves.toEqual({ ok: true, id: 'same-skill' });

    await expect(
      fixture.services.readAvailableDesignSystem('user:same-design-system', {
        workspaceId: 'workspace-a',
      }),
    ).resolves.toContain('team-design-system-a');
    await expect(
      fixture.services.readAvailableDesignSystem('user:same-design-system', {
        workspaceId: 'workspace-b',
      }),
    ).resolves.toContain('team-design-system-b');
    await expect(
      fixture.services.readAvailableDesignSystem('user:same-design-system'),
    ).resolves.toContain('personal-design-system');
    await expect(
      fixture.services.validateProjectDesignSystemId(
        'user:same-design-system',
        { workspaceId: 'workspace-a' },
      ),
    ).resolves.toEqual({ ok: true, id: 'user:same-design-system' });
    await expect(
      fixture.services.validateProjectDesignSystemId(
        'user:same-design-system',
        { workspaceId: 'workspace-b' },
      ),
    ).resolves.toEqual({ ok: true, id: 'user:same-design-system' });
  });

  it('drops a Team design system after local reconciliation tombstones its binding', async () => {
    const fixture = await createFixture();
    const workspaceId = 'workspace-a';
    const designSystemId = 'user:reconciled-away';
    const bindingId = workspaceTeamDesignSystemBindingResourceId(
      workspaceId,
      designSystemId,
    );
    await materializeWorkspaceScopedTeamResource({
      kindRoot: fixture.userDesignSystems,
      storageName: 'reconciled-away',
      identity: {
        kind: 'design_system',
        workspaceId,
        resourceId: designSystemId,
        hubResourceId: 'ds-reconciled-away',
      },
      pullInto: (dir) => writeDesignSystem(dir, workspaceId, 'still on disk'),
      verifyWorkspaceScope: async () => true,
      verifyStillShared: async () => true,
    });
    ensureWorkspaceResource(fixture.db, 'design_system', workspaceId, bindingId, {
      visibility: 'team',
      resourceState: 'active',
    });

    await expect(fixture.services.listAllDesignSystems({
      workspaceId,
      exactTeam: true,
    })).resolves.toEqual([
      expect.objectContaining({ id: designSystemId, teamSynced: true }),
    ]);

    updateWorkspaceResource(fixture.db, 'design_system', workspaceId, bindingId, {
      resourceState: 'deleted',
    });

    await expect(fixture.services.listAllDesignSystems({
      workspaceId,
      exactTeam: true,
    })).resolves.toEqual([]);
  });

  it('lets only the exact Personal creator validate a same-Workspace design system', async () => {
    const fixture = await createFixture();
    const personalDesignSystemDir = path.join(
      fixture.userDesignSystems,
      'member-private-design-system',
    );
    await mkdir(personalDesignSystemDir, { recursive: true });
    await writeDesignSystem(
      personalDesignSystemDir,
      'personal-workspace',
      'member-private-design-system',
    );
    await writeFile(
      path.join(personalDesignSystemDir, 'metadata.json'),
      `${JSON.stringify({ workspaceId: 'personal-workspace', status: 'published' })}\n`,
    );
    ensureWorkspaceResource(
      fixture.db,
      'design_system',
      'personal-workspace',
      'user:member-private-design-system',
      {
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-a',
        updatedByWorkspaceMemberId: 'member-a',
      },
    );

    await expect(
      fixture.services.validateProjectDesignSystemId(
        'user:member-private-design-system',
        { workspaceId: 'personal-workspace', workspaceMemberId: 'member-a' },
      ),
    ).resolves.toEqual({ ok: true, id: 'user:member-private-design-system' });
    await expect(
      fixture.services.validateProjectDesignSystemId(
        'user:member-private-design-system',
        { workspaceId: 'personal-workspace', workspaceMemberId: 'member-b' },
      ),
    ).resolves.toMatchObject({ ok: false, code: 'DESIGN_SYSTEM_NOT_FOUND' });
  });

  it('fails closed instead of falling back to same-id Personal when exact Team materialization is missing', async () => {
    const fixture = await createFixture();
    const personal = await designSystems.createUserDesignSystem(
      fixture.userDesignSystems,
      {
        title: 'Missing Team Copy',
        summary: 'Personal canonical must not leak into Team reads.',
        status: 'published',
      },
    );
    const personalDir = path.join(fixture.userDesignSystems, 'missing-team-copy');
    const personalMetadataPath = path.join(personalDir, 'metadata.json');
    const personalMetadata = JSON.parse(
      await readFile(personalMetadataPath, 'utf8'),
    ) as Record<string, unknown>;
    await writeFile(
      personalMetadataPath,
      `${JSON.stringify({ ...personalMetadata, workspaceId: 'workspace-a' })}\n`,
    );
    ensureWorkspaceResource(
      fixture.db,
      'design_system',
      'workspace-a',
      personal.id,
      {
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-a',
      },
    );
    await mkdir(path.join(personalDir, 'system'), { recursive: true });
    await writeFile(
      path.join(personalDir, 'system', 'index.html'),
      '<!doctype html><title>Personal only</title>',
    );

    await expect(
      fixture.services.readAvailableDesignSystem(personal.id),
    ).resolves.toContain('Missing Team Copy');
    await expect(
      fixture.services.readAvailableDesignSystem(personal.id, {
        workspaceId: 'workspace-a',
        exactTeam: true,
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.services.readAvailableDesignSystemPackageInfo(personal.id, {
        workspaceId: 'workspace-a',
        exactTeam: true,
      }),
    ).resolves.toBeNull();
    await expect(
      fixture.services.readAvailableDesignSystemStaticFile(
        personal.id,
        'system/index.html',
        { workspaceId: 'workspace-a', exactTeam: true },
      ),
    ).resolves.toBeNull();

    const exactCatalog = await fixture.services.listAllDesignSystems({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      exactTeam: true,
    });
    expect(exactCatalog.some((system) => system.id === personal.id)).toBe(false);
    await expect(
      fixture.services.ensureUserDesignSystemWorkspaceProject(
        fixture.db,
        personal.id,
        {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
          exactTeam: true,
        },
      ),
    ).resolves.toBeNull();
    await expect(
      fixture.services.syncUserDesignSystemAssetsFromWorkspace(
        fixture.db,
        personal.id,
        {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
          exactTeam: true,
        },
      ),
    ).resolves.toEqual({ ok: false, reason: 'not-found' });
  });
});
