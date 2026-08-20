import type Database from 'better-sqlite3';

import { getWorkspaceResourceByResourceId } from '../db.js';

type SqliteDb = Database.Database;

const WORKSPACE_TEAM_SKILL_BINDING_PREFIX = 'team-mirror:';

/**
 * Team Skill mirrors use a Workspace-qualified envelope key in the generic
 * binding table. The logical Skill id remains unchanged at every UI/API
 * surface, while Personal and multiple Teams may safely use the same id.
 */
export function workspaceTeamSkillBindingResourceId(
  workspaceId: string,
  skillId: string,
): string {
  return `${WORKSPACE_TEAM_SKILL_BINDING_PREFIX}${encodeURIComponent(workspaceId)}:${encodeURIComponent(skillId)}`;
}

export function skillIdFromWorkspaceTeamBinding(
  workspaceId: string,
  bindingResourceId: string,
): string | null {
  const prefix = `${WORKSPACE_TEAM_SKILL_BINDING_PREFIX}${encodeURIComponent(workspaceId)}:`;
  if (!bindingResourceId.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(bindingResourceId.slice(prefix.length));
  } catch {
    return null;
  }
}

export function skillLogicalResourceId(bindingResourceId: string): string {
  if (!bindingResourceId.startsWith(WORKSPACE_TEAM_SKILL_BINDING_PREFIX)) {
    return bindingResourceId;
  }
  const separator = bindingResourceId.indexOf(
    ':',
    WORKSPACE_TEAM_SKILL_BINDING_PREFIX.length,
  );
  if (separator < 0) return bindingResourceId;
  try {
    return decodeURIComponent(bindingResourceId.slice(separator + 1));
  } catch {
    return bindingResourceId;
  }
}

export function workspaceTeamSkillBindingAllowsRead(
  db: SqliteDb,
  workspaceId: string,
  skillId: string,
): boolean {
  const binding = getWorkspaceResourceByResourceId(
    db,
    'skill',
    workspaceTeamSkillBindingResourceId(workspaceId, skillId),
  );
  return binding?.workspaceId === workspaceId
    && binding.visibility === 'team'
    && binding.resourceState !== 'deleted';
}

/**
 * Capture the full local generation before an asynchronous hub read. State is
 * included because two SQLite writes may share one millisecond; a tombstone
 * must still invalidate an older positive response in that case.
 */
export function workspaceTeamSkillBindingActivationFence(
  db: SqliteDb,
  workspaceId: string,
  skillId: string,
): string | null {
  const binding = getWorkspaceResourceByResourceId(
    db,
    'skill',
    workspaceTeamSkillBindingResourceId(workspaceId, skillId),
  );
  if (!binding) return null;
  return JSON.stringify([
    binding.workspaceId,
    binding.visibility,
    binding.resourceState ?? null,
    binding.updatedAt,
    binding.updatedByWorkspaceMemberId ?? null,
    binding.resourceHubResourceId ?? null,
  ]);
}

export async function resolveWorkspaceTeamSkillWithBindingGate<T>(input: {
  bindingAllowsRead: () => boolean;
  resolve: () => Promise<T | null>;
}): Promise<T | null> {
  if (!input.bindingAllowsRead()) return null;
  const resolved = await input.resolve();
  if (resolved == null || !input.bindingAllowsRead()) return null;
  return resolved;
}

export async function activateWorkspaceTeamSkillIfStillShared(input: {
  captureActivationFence: () => string | null;
  stillShared: () => Promise<boolean>;
  activationFenceIsCurrent: (fence: string | null) => boolean;
  activate: () => boolean;
}): Promise<boolean> {
  const activationFence = input.captureActivationFence();
  if (!await input.stillShared()) return false;
  if (!input.activationFenceIsCurrent(activationFence)) return false;
  return input.activate();
}

export async function resolveAndActivateWorkspaceTeamSkill<T>(input: {
  resolve: () => Promise<T | null>;
  captureActivationFence: () => string | null;
  stillShared: () => Promise<boolean>;
  activationFenceIsCurrent: (fence: string | null) => boolean;
  activate: () => boolean;
}): Promise<T | null> {
  const resolved = await input.resolve();
  if (resolved == null) return null;
  if (!await activateWorkspaceTeamSkillIfStillShared(input)) return null;
  return resolved;
}
