import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../../src/db.js';
import * as designSystems from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import * as skills from '../../src/skills.js';
import { materializeWorkspaceScopedTeamResource } from '../../src/collab/team-resource-materialization.js';

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
  return { root, userSkills, userDesignSystems, services };
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
    `${JSON.stringify({ workspaceId, teamSynced: true })}\n`,
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
});
