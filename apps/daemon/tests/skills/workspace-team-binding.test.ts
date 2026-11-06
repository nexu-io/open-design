import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
  updateWorkspaceResource,
} from '../../src/db.js';
import {
  resolveAndActivateWorkspaceTeamSkill,
  resolveWorkspaceTeamSkillWithBindingGate,
  skillIdFromWorkspaceTeamBinding,
  skillLogicalResourceId,
  workspaceTeamSkillBindingActivationFence,
  workspaceTeamSkillBindingAllowsRead,
  workspaceTeamSkillBindingResourceId,
} from '../../src/skills/workspace-team-binding.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-skill-team-binding-'));
});

afterEach(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Workspace Team Skill binding ids', () => {
  it('round-trips encoded Workspace and logical Skill ids', () => {
    const workspaceId = 'workspace/team:a';
    const skillId = 'user:skill/name with spaces';
    const bindingId = workspaceTeamSkillBindingResourceId(workspaceId, skillId);

    expect(bindingId).toBe(
      'team-mirror:workspace%2Fteam%3Aa:user%3Askill%2Fname%20with%20spaces',
    );
    expect(skillIdFromWorkspaceTeamBinding(workspaceId, bindingId)).toBe(skillId);
    expect(skillLogicalResourceId(bindingId)).toBe(skillId);
    expect(skillIdFromWorkspaceTeamBinding('workspace/team:b', bindingId)).toBeNull();
  });

  it('leaves Personal ids unchanged and rejects malformed Team envelopes', () => {
    expect(skillLogicalResourceId('personal-skill')).toBe('personal-skill');
    expect(skillIdFromWorkspaceTeamBinding('workspace-a', 'team-mirror:workspace-a:%zz'))
      .toBeNull();
  });
});

describe('Workspace Team Skill binding isolation', () => {
  it('keeps same-id Team A, Team B, and Personal bindings independent', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const skillId = 'shared-skill';
    const teamAId = workspaceTeamSkillBindingResourceId('workspace-a', skillId);
    const teamBId = workspaceTeamSkillBindingResourceId('workspace-b', skillId);

    ensureWorkspaceResource(db, 'skill', 'workspace-personal', skillId, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-personal',
    });
    ensureWorkspaceResource(db, 'skill', 'workspace-a', teamAId, {
      visibility: 'team',
      resourceState: 'active',
    });
    ensureWorkspaceResource(db, 'skill', 'workspace-b', teamBId, {
      visibility: 'team',
      resourceState: 'active',
    });

    expect(workspaceTeamSkillBindingAllowsRead(db, 'workspace-a', skillId)).toBe(true);
    expect(workspaceTeamSkillBindingAllowsRead(db, 'workspace-b', skillId)).toBe(true);

    updateWorkspaceResource(db, 'skill', 'workspace-a', teamAId, {
      resourceState: 'deleted',
    });

    expect(workspaceTeamSkillBindingAllowsRead(db, 'workspace-a', skillId)).toBe(false);
    expect(workspaceTeamSkillBindingAllowsRead(db, 'workspace-b', skillId)).toBe(true);
    expect(getWorkspaceResourceByResourceId(db, 'skill', skillId)).toMatchObject({
      workspaceId: 'workspace-personal',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-personal',
    });
  });

  it('drops a resolved Team Skill when its exact binding is retracted mid-read', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const workspaceId = 'workspace-a';
    const skillId = 'racing-skill';
    const bindingId = workspaceTeamSkillBindingResourceId(workspaceId, skillId);
    ensureWorkspaceResource(db, 'skill', workspaceId, bindingId, {
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
    const pending = resolveWorkspaceTeamSkillWithBindingGate({
      bindingAllowsRead: () =>
        workspaceTeamSkillBindingAllowsRead(db, workspaceId, skillId),
      resolve: async () => {
        resolveStarted();
        return resolveGate;
      },
    });
    await started;
    updateWorkspaceResource(db, 'skill', workspaceId, bindingId, {
      resourceState: 'deleted',
    });
    finishResolve({ id: skillId });

    await expect(pending).resolves.toBeNull();
  });

  it('changes the activation fence when a same-timestamp tombstone lands', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const workspaceId = 'workspace-a';
    const skillId = 'fenced-skill';
    const bindingId = workspaceTeamSkillBindingResourceId(workspaceId, skillId);
    ensureWorkspaceResource(db, 'skill', workspaceId, bindingId, {
      visibility: 'team',
      resourceState: 'active',
    });
    const activeFence = workspaceTeamSkillBindingActivationFence(db, workspaceId, skillId);
    const updatedAt = Number(
      getWorkspaceResourceByResourceId(db, 'skill', bindingId)?.updatedAt,
    );

    updateWorkspaceResource(db, 'skill', workspaceId, bindingId, {
      resourceState: 'deleted',
      updatedAt,
    });

    expect(workspaceTeamSkillBindingActivationFence(db, workspaceId, skillId))
      .not.toBe(activeFence);
  });

  it('does not reactivate a Team Skill retracted while materialization resolves', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const workspaceId = 'workspace-a';
    const skillId = 'materializing-skill';
    const bindingId = workspaceTeamSkillBindingResourceId(workspaceId, skillId);
    ensureWorkspaceResource(db, 'skill', workspaceId, bindingId, {
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
    let activated = false;
    const pending = resolveAndActivateWorkspaceTeamSkill({
      resolve: async () => {
        resolveStarted();
        return resolveGate;
      },
      captureActivationFence: () =>
        workspaceTeamSkillBindingActivationFence(db, workspaceId, skillId),
      stillShared: async () => false,
      activationFenceIsCurrent: (fence) =>
        workspaceTeamSkillBindingActivationFence(db, workspaceId, skillId) === fence,
      activate: () => {
        activated = true;
        return true;
      },
    });
    await started;
    updateWorkspaceResource(db, 'skill', workspaceId, bindingId, {
      resourceState: 'deleted',
    });
    finishResolve({ id: skillId });

    await expect(pending).resolves.toBeNull();
    expect(activated).toBe(false);
    expect(workspaceTeamSkillBindingAllowsRead(db, workspaceId, skillId)).toBe(false);
  });
});
