import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { materializeWorkspaceScopedTeamResource } from '../../src/collab/team-resource-materialization.js';
import { closeDatabase, ensureWorkspaceResource, openDatabase, updateWorkspaceResource } from '../../src/db.js';
import * as designSystems from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import * as skills from '../../src/skills.js';
import { workspaceTeamSkillBindingResourceId } from '../../src/skills/workspace-team-binding.js';

const roots: string[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

async function writeSkill(directory: string, skillId: string, body: string) {
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: "${skillId}"\ndescription: ${body}\n---\n\n${body}\n`,
  );
}

async function createFixture(options: {
  listSkills?: typeof skills.listSkills;
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-team-skill-list-gate-'));
  roots.push(root);
  const userSkills = path.join(root, 'skills');
  const builtInSkills = path.join(root, 'built-in-skills');
  const userDesignSystems = path.join(root, 'design-systems');
  const builtInDesignSystems = path.join(root, 'built-in-design-systems');
  await Promise.all([
    mkdir(userSkills, { recursive: true }),
    mkdir(builtInSkills, { recursive: true }),
    mkdir(userDesignSystems, { recursive: true }),
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
      listSkills: (options.listSkills ?? skills.listSkills) as never,
      findSkillById: skills.findSkillById as never,
    },
    designSystems: designSystems as never,
    projects: {} as never,
  });
  return { db, services, userSkills };
}

async function materializeTeamSkill(
  userSkills: string,
  workspaceId: string,
  skillId: string,
  body: string,
) {
  return materializeWorkspaceScopedTeamResource({
    kindRoot: userSkills,
    storageName: skillId,
    identity: {
      kind: 'skill',
      workspaceId,
      resourceId: skillId,
      hubResourceId: `skill-${workspaceId}-${skillId}`,
    },
    pullInto: (directory) => writeSkill(directory, skillId, body),
    verifyWorkspaceScope: async () => true,
    verifyStillShared: async () => true,
  });
}

function bindTeamSkill(
  db: ReturnType<typeof openDatabase>,
  workspaceId: string,
  skillId: string,
) {
  return ensureWorkspaceResource(
    db,
    'skill',
    workspaceId,
    workspaceTeamSkillBindingResourceId(workspaceId, skillId),
    { visibility: 'team', resourceState: 'active' },
  );
}

describe('listAllSkills Team materialization gate', () => {
  it('requires both an exact marker and an active exact Workspace binding', async () => {
    const fixture = await createFixture();
    const skillId = 'same-skill';
    const personalDir = path.join(fixture.userSkills, skillId);
    await mkdir(personalDir, { recursive: true });
    await writeSkill(personalDir, skillId, 'personal-body');
    ensureWorkspaceResource(fixture.db, 'skill', 'workspace-personal', skillId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-personal',
    });

    await materializeTeamSkill(fixture.userSkills, 'workspace-a', skillId, 'team-a');
    await materializeTeamSkill(fixture.userSkills, 'workspace-b', skillId, 'team-b');
    bindTeamSkill(fixture.db, 'workspace-a', skillId);
    bindTeamSkill(fixture.db, 'workspace-b', skillId);

    expect(skills.findSkillById(
      await fixture.services.listAllSkills({ workspaceId: 'workspace-a' }),
      skillId,
    )?.body).toContain('team-a');
    expect(skills.findSkillById(
      await fixture.services.listAllSkills({ workspaceId: 'workspace-b' }),
      skillId,
    )?.body).toContain('team-b');
    expect(skills.findSkillById(await fixture.services.listAllSkills(), skillId)?.body)
      .toContain('personal-body');

    const teamAId = workspaceTeamSkillBindingResourceId('workspace-a', skillId);
    updateWorkspaceResource(fixture.db, 'skill', 'workspace-a', teamAId, {
      resourceState: 'deleted',
    });

    expect(skills.findSkillById(
      await fixture.services.listAllSkills({ workspaceId: 'workspace-a' }),
      skillId,
    )).toBeUndefined();
    expect(skills.findSkillById(
      await fixture.services.listAllSkills({ workspaceId: 'workspace-b' }),
      skillId,
    )?.body).toContain('team-b');
    expect(skills.findSkillById(await fixture.services.listAllSkills(), skillId)?.body)
      .toContain('personal-body');
  });

  it('does not surface marker-only or binding-only Team Skills', async () => {
    const fixture = await createFixture();
    await materializeTeamSkill(
      fixture.userSkills,
      'workspace-marker-only',
      'marker-only',
      'marker-only-body',
    );
    bindTeamSkill(fixture.db, 'workspace-binding-only', 'binding-only');

    const markerOnly = await fixture.services.listAllSkills({
      workspaceId: 'workspace-marker-only',
    });
    const bindingOnly = await fixture.services.listAllSkills({
      workspaceId: 'workspace-binding-only',
    });
    expect(skills.findSkillById(markerOnly, 'marker-only')).toBeUndefined();
    expect(skills.findSkillById(bindingOnly, 'binding-only')).toBeUndefined();
  });

  it('drops a Team Skill retracted while its directory is resolving', async () => {
    let finishTeamRead!: () => void;
    const teamReadGate = new Promise<void>((resolve) => {
      finishTeamRead = resolve;
    });
    let teamReadStarted!: () => void;
    const teamReadDidStart = new Promise<void>((resolve) => {
      teamReadStarted = resolve;
    });
    let userSkillsRoot = '';
    const fixture = await createFixture({
      listSkills: async (rootsArg, options) => {
        const rootsList = Array.isArray(rootsArg) ? rootsArg : [rootsArg];
        if (
          userSkillsRoot
          && rootsList.length === 1
          && rootsList[0]?.startsWith(path.join(userSkillsRoot, '.team-workspaces'))
        ) {
          teamReadStarted();
          await teamReadGate;
        }
        return skills.listSkills(rootsArg, options);
      },
    });
    userSkillsRoot = fixture.userSkills;
    const workspaceId = 'workspace-race';
    const skillId = 'racing-skill';
    await materializeTeamSkill(fixture.userSkills, workspaceId, skillId, 'racing-body');
    bindTeamSkill(fixture.db, workspaceId, skillId);

    const pending = fixture.services.listAllSkills({ workspaceId });
    await teamReadDidStart;
    updateWorkspaceResource(
      fixture.db,
      'skill',
      workspaceId,
      workspaceTeamSkillBindingResourceId(workspaceId, skillId),
      { resourceState: 'deleted' },
    );
    finishTeamRead();

    expect(skills.findSkillById(await pending, skillId)).toBeUndefined();
  });
});
