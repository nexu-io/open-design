import { createHash } from 'node:crypto';
import { renameSync } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ensureCurrentProjectFileVersion } from '../project-file-versions.js';
import { isSafeId } from '../projects.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import {
  isExcludedProjectContentEntry,
  isMissingResourceError,
  projectResourceIdsFor,
  runVelaResourceCommand,
  type RunVelaResource,
} from './vela-cli-resource-adapter.js';
import type { OwnedContentScope } from './owned-content-store.js';

/** The exact root snapshot roster, shared by upload checkpoints and HTML fact admission. */
export async function contentFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string, prefix: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' && current === directory) return [];
      throw error;
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (isExcludedProjectContentEntry(entry.name, entry.isDirectory())) continue;
      const relative = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error('shared content cannot contain a symbolic link');
      if (entry.isDirectory()) await visit(path.join(current, entry.name), `${relative}/`);
      else if (entry.isFile()) files.push(relative);
      else throw new Error('shared content contains an unsupported filesystem entry');
    }
  }
  await visit(directory, '');
  return files;
}

/** Runs only at publication/receipt boundaries, never in periodic status reads. */
export async function ownedContentFingerprint(directory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const name of await contentFiles(directory)) {
    const bytes = await readFile(path.join(directory, name));
    hash.update(name).update('\0').update(createHash('sha256').update(bytes).digest());
  }
  return hash.digest('hex');
}

async function captureHtml(projectsRoot: string, scope: OwnedContentScope, directory: string): Promise<void> {
  const history = await lstat(path.join(directory, '.file-versions')).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (history && (!history.isDirectory() || history.isSymbolicLink())) throw new Error('HTML history must be a local directory');
  for (const name of await contentFiles(directory)) {
    if (!/\.html?$/i.test(name)) continue;
    await ensureCurrentProjectFileVersion(projectsRoot, scope.projectId, name,
      await readFile(path.join(directory, name), 'utf8'), { source: 'sync' });
  }
}

async function preserveLocalEntries(live: string, stage: string): Promise<void> {
  for (const entry of await readdir(live, { withFileTypes: true })) {
    const source = path.join(live, entry.name);
    const target = path.join(stage, entry.name);
    if (isExcludedProjectContentEntry(entry.name, entry.isDirectory())) {
      // Never follow private symlinks into a user-selected external directory.
      await rm(target, { recursive: true, force: true });
      await cp(source, target, { recursive: true, dereference: false, verbatimSymlinks: true });
    } else if (entry.isDirectory()) {
      const remote = await lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      // Preserve nested private items even if their old public parent was removed.
      if (remote && (!remote.isDirectory() || remote.isSymbolicLink())) {
        if (await containsPrivateEntries(source)) throw new Error('remote content conflicts with local private entries');
        continue;
      }
      await mkdir(target, { recursive: true });
      await preserveLocalEntries(source, target);
    }
  }
}

async function containsPrivateEntries(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (isExcludedProjectContentEntry(entry.name, entry.isDirectory())) return true;
    if (entry.isDirectory() && await containsPrivateEntries(path.join(directory, entry.name))) return true;
  }
  return false;
}

async function stripRemotePrivateEntries(stage: string): Promise<void> {
  for (const entry of await readdir(stage, { withFileTypes: true })) {
    const target = path.join(stage, entry.name);
    if (isExcludedProjectContentEntry(entry.name, entry.isDirectory())) {
      await rm(target, { recursive: true, force: true });
    } else if (entry.isDirectory()) await stripRemotePrivateEntries(target);
  }
}

export interface ApplyOwnedContentOptions {
  projectsRoot: string;
  scope: OwnedContentScope;
  expectedVersion: number;
  authorize(): Promise<void>;
  isBusy(): boolean;
  commit(version: number): Promise<void> | void;
  run?: RunVelaResource;
}

/** Authenticated owner transport; member receipt authorization remains separate. */
export async function applyOwnedProjectContent(options: ApplyOwnedContentOptions): Promise<{ version: number; fingerprint: string }> {
  const { scope, expectedVersion } = options;
  if (!isSafeId(scope.projectId)) throw new Error('invalid project id');
  const live = path.join(options.projectsRoot, scope.projectId);
  await options.authorize();
  await mkdir(options.projectsRoot, { recursive: true });
  const stage = await mkdtemp(path.join(options.projectsRoot, `.${scope.projectId}.owner-pull-`));
  const recovery = `${stage}.previous`;
  let movedLive = false;
  let promoted = false;
  let committed = false;
  try {
    const principal = {
      teamId: scope.resourceTeamId, memberId: scope.ownerMemberId,
      role: 'member' as const, lifecycleState: 'active' as const, workspaceType: 'team' as const,
    };
    const resourceIds = scope.resourceId !== undefined
      ? [scope.resourceId]
      : projectResourceIdsFor(scope.projectId, principal, projectResourceIdFor);
    if (resourceIds.some((id) => !id.trim())) throw new Error('owner project root is unavailable');
    let stdout: string | undefined;
    let lastError: unknown;
    for (const [index, resourceId] of resourceIds.entries()) {
      try {
        stdout = await (options.run ?? runVelaResourceCommand)(
          ['pull', 'project', resourceId, stage, '--ref', 'published', '--json'], scope.workspaceId);
        break;
      } catch (error) {
        lastError = error;
        if (index === resourceIds.length - 1 || !isMissingResourceError(error)) throw error;
      }
    }
    if (stdout === undefined) throw lastError;
    const received = JSON.parse(stdout.trim()) as { version?: unknown };
    if (received.version !== expectedVersion) throw new Error('published version changed; check again');
    const remote = await lstat(stage);
    if (!remote.isDirectory() || remote.isSymbolicLink()) throw new Error('resource stage is not a real directory');
    await stripRemotePrivateEntries(stage);
    await contentFiles(stage); // Validate before copying any local private entry.
    const existing = await lstat(live).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing) {
      if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('owner project is not a real directory');
      await captureHtml(options.projectsRoot, scope, live);
      await preserveLocalEntries(live, stage);
    }
    // Authority may be revoked while native Vela is downloading.
    await options.authorize();
    if (options.isBusy()) throw Object.assign(new Error('project is busy'), { code: 'PROJECT_BUSY' });
    if (existing) { renameSync(live, recovery); movedLive = true; }
    renameSync(stage, live);
    promoted = true;
    await captureHtml(options.projectsRoot, scope, live);
    const fingerprint = await ownedContentFingerprint(live);
    await options.commit(expectedVersion);
    committed = true;
    // Cleanup failure cannot turn an already-committed replacement into a retry.
    await rm(recovery, { recursive: true, force: true }).catch(() => undefined);
    return { version: expectedVersion, fingerprint };
  } catch (error) {
    if (!committed) {
      if (promoted) await rm(live, { recursive: true, force: true });
      if (movedLive) renameSync(recovery, live);
    }
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
}
