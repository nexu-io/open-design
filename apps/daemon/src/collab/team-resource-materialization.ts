import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TEAM_RESOURCE_ROOT = '.team-workspaces';
const MATERIALIZATION_FILE = '.od-team-resource.json';

export interface TeamResourceMaterializationIdentity {
  kind: 'design_system' | 'plugin' | 'skill';
  workspaceId: string;
  resourceId: string;
  hubResourceId: string;
  sourceKey: string;
}

export type TeamResourceMaterializationResult =
  | { status: 'committed'; targetDir: string; sourceKey: string }
  | { status: 'revoked' };

function storageSegment(value: string): string {
  const readable = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'resource';
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 16);
  return `${readable}-${digest}`;
}

function workspaceStorageSegment(workspaceId: string): string {
  return createHash('sha256').update(workspaceId).digest('hex');
}

export function teamResourceWorkspaceRoot(
  kindRoot: string,
  workspaceId: string,
): string {
  return path.join(
    kindRoot,
    TEAM_RESOURCE_ROOT,
    workspaceStorageSegment(workspaceId),
  );
}

export function teamResourceMaterializationDir(
  kindRoot: string,
  workspaceId: string,
  resourceId: string,
  storageName?: string,
): string {
  const physicalName = storageName?.trim();
  if (physicalName && (!/^[a-zA-Z0-9_-]+$/u.test(physicalName) || physicalName === '.' || physicalName === '..')) {
    throw new Error('invalid team resource storage name');
  }
  return path.join(
    teamResourceWorkspaceRoot(kindRoot, workspaceId),
    physicalName || storageSegment(resourceId),
  );
}

export function teamResourceSourceKey(input: {
  kind: TeamResourceMaterializationIdentity['kind'];
  workspaceId: string;
  resourceId: string;
}): string {
  return `team:${input.kind}:${input.workspaceId}:${input.resourceId}`;
}

export async function readTeamResourceMaterialization(
  kindRoot: string,
  workspaceId: string,
  resourceId: string,
  storageName?: string,
): Promise<TeamResourceMaterializationIdentity | null> {
  const targetDir = teamResourceMaterializationDir(
    kindRoot,
    workspaceId,
    resourceId,
    storageName,
  );
  try {
    const raw = await fs.readFile(path.join(targetDir, MATERIALIZATION_FILE), 'utf8');
    const parsed = JSON.parse(raw) as Partial<TeamResourceMaterializationIdentity>;
    if (
      parsed.workspaceId !== workspaceId ||
      parsed.resourceId !== resourceId ||
      typeof parsed.kind !== 'string' ||
      typeof parsed.hubResourceId !== 'string' ||
      typeof parsed.sourceKey !== 'string'
    ) {
      return null;
    }
    return parsed as TeamResourceMaterializationIdentity;
  } catch {
    return null;
  }
}

export async function readWorkspaceScopedTeamResourceFile(
  kindRoot: string,
  workspaceId: string,
  resourceId: string,
  relativePath: string,
  storageName?: string,
): Promise<Buffer | null> {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/u, '');
  if (
    !normalized ||
    normalized.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    return null;
  }
  const marker = await readTeamResourceMaterialization(
    kindRoot,
    workspaceId,
    resourceId,
    storageName,
  );
  if (!marker) return null;
  const root = teamResourceMaterializationDir(
    kindRoot,
    workspaceId,
    resourceId,
    storageName,
  );
  const target = path.resolve(root, normalized);
  if (path.dirname(target) !== path.resolve(root) && !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    return null;
  }
  try {
    const [realRoot, realTarget] = await Promise.all([
      fs.realpath(root),
      fs.realpath(target),
    ]);
    if (
      realTarget !== realRoot
      && !realTarget.startsWith(`${realRoot}${path.sep}`)
    ) {
      return null;
    }
    return await fs.readFile(realTarget);
  } catch {
    return null;
  }
}

/**
 * Pull into an invisible staging directory, then close both authorization
 * races before replacing the exact Workspace's live copy. A directory/listing
 * failure is a revocation verdict, never permission to commit downloaded
 * bytes.
 */
export async function materializeWorkspaceScopedTeamResource(input: {
  kindRoot: string;
  identity: Omit<TeamResourceMaterializationIdentity, 'sourceKey'>;
  storageName?: string;
  pullInto: (stagedDir: string) => Promise<void>;
  verifyWorkspaceScope: () => Promise<boolean>;
  verifyStillShared: () => Promise<boolean>;
}): Promise<TeamResourceMaterializationResult> {
  const sourceKey = teamResourceSourceKey(input.identity);
  const targetDir = teamResourceMaterializationDir(
    input.kindRoot,
    input.identity.workspaceId,
    input.identity.resourceId,
    input.storageName,
  );
  const workspaceRoot = path.dirname(targetDir);
  await fs.mkdir(workspaceRoot, { recursive: true });
  const stagedDir = await fs.mkdtemp(
    path.join(workspaceRoot, `.${path.basename(targetDir)}.pull-`),
  );

  try {
    await input.pullInto(stagedDir);
    const scopeStillValid = await input.verifyWorkspaceScope().catch(() => false);
    if (!scopeStillValid) return { status: 'revoked' };
    const resourceStillShared = await input.verifyStillShared().catch(() => false);
    if (!resourceStillShared) return { status: 'revoked' };

    const identity: TeamResourceMaterializationIdentity = {
      ...input.identity,
      sourceKey,
    };
    await fs.writeFile(
      path.join(stagedDir, MATERIALIZATION_FILE),
      `${JSON.stringify(identity, null, 2)}\n`,
      'utf8',
    );

    const recoveryDir = `${targetDir}.recovery-${process.pid}-${Date.now()}`;
    let hadPrevious = false;
    try {
      await fs.rename(targetDir, recoveryDir);
      hadPrevious = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await fs.rename(stagedDir, targetDir);
    } catch (error) {
      if (hadPrevious) {
        await fs.rename(recoveryDir, targetDir).catch(() => undefined);
      }
      throw error;
    }
    if (hadPrevious) {
      await fs.rm(recoveryDir, { recursive: true, force: true }).catch(() => undefined);
    }
    return { status: 'committed', targetDir, sourceKey };
  } finally {
    await fs.rm(stagedDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
