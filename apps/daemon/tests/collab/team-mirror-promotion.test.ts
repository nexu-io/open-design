import { renameSync } from 'node:fs';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import {
  promoteAuthorizedTeamProjectStage,
  recoverAuthorizedTeamProjectPromotions,
  type TeamMirrorPromotionJournalRecord,
} from '../../src/collab/team-mirror-promotion.js';
import { resolveAuthorizedActiveTeamWorkspaceSnapshot } from '../../src/collab/active-workspace-selection.js';
import { withLastKnownWorkspaceContext } from '../../src/collab/workspace-context.js';
import { teamProjectMaterializationSupersedes } from '../../src/collab/team-mirror-materializer.js';
import type { AuthorizedTeamProjectPullReceipt } from '../../src/collab/authorized-team-project-pull.js';
import { projectResourceIdFor } from '../../src/integrations/vela-team-projects.js';

const roots: string[] = [];
const resourceId = projectResourceIdFor('project-1', {
  teamId: 'workspace-1',
  memberId: 'owner-1',
  role: 'member',
  lifecycleState: 'active',
  workspaceType: 'team',
});
const activeIdentity = {
  workspaceId: 'workspace-1',
  teamId: 'workspace-1',
  workspaceMemberId: 'viewer-1',
  workspaceType: 'team',
  memberStatus: 'active',
  lifecycleState: 'active',
  role: 'member',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3 },
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
  },
} as WorkspaceCollabContext;

async function fixture(live = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-team-promote-'));
  roots.push(root);
  const liveDir = path.join(root, 'project-1');
  const stageDir = await mkdtemp(path.join(root, '.project-1.od-pull-stage-'));
  const journalDir = path.join(root, '.journals');
  if (live) {
    await mkdir(liveDir);
    await writeFile(path.join(liveDir, 'index.html'), 'old');
  }
  await writeFile(path.join(stageDir, 'index.html'), 'new');
  const stageStat = await lstat(stageDir);
  return {
    root,
    liveDir,
    stageDir,
    journalDir,
    stageIdentity: { dev: String(stageStat.dev), ino: String(stageStat.ino) },
  };
}

function receipt(
  overrides: Partial<AuthorizedTeamProjectPullReceipt> = {},
): AuthorizedTeamProjectPullReceipt {
  return {
    schemaVersion: 1,
    workspaceId: 'workspace-1',
    resourceTeamId: 'workspace-1',
    viewerMemberId: 'viewer-1',
    ownerMemberId: 'owner-1',
    projectId: 'project-1',
    resourceId,
    ref: 'published',
    version: 7,
    versionId: 'version-7',
    manifestDigest: `sha256:${'a'.repeat(64)}`,
    lifecycleState: 'active',
    authorizedAt: '2026-07-26T10:00:00.000Z',
    expiresAt: '2026-07-26T10:00:02.000Z',
    ...overrides,
  };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('authorized team mirror promotion', () => {
  it('promotes after a transient A to null to A observation without generation drift', async () => {
    const fx = await fixture();
    let current: WorkspaceCollabContext | null = activeIdentity;
    const provider = withLastKnownWorkspaceContext({
      current: async () => current,
    });
    await provider.current({});
    const captured = resolveAuthorizedActiveTeamWorkspaceSnapshot(
      { workspaceId: 'workspace-1', generation: 0 },
      provider.lastKnownSnapshot!(),
    );

    current = null;
    await provider.current({});
    current = activeIdentity;
    await provider.current({});

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: captured.generation,
      getActiveWorkspaceSnapshot: () =>
        resolveAuthorizedActiveTeamWorkspaceSnapshot(
          { workspaceId: 'workspace-1', generation: 0 },
          provider.lastKnownSnapshot!(),
        ),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => ({ localRecordChanged: true }),
    })).resolves.toEqual({ localRecordChanged: true });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('new');
  });

  it('rejects promotion while the authoritative context remains unavailable', async () => {
    const fx = await fixture();
    let current: WorkspaceCollabContext | null = activeIdentity;
    const provider = withLastKnownWorkspaceContext({
      current: async () => current,
    });
    await provider.current({});
    const captured = resolveAuthorizedActiveTeamWorkspaceSnapshot(
      { workspaceId: 'workspace-1', generation: 0 },
      provider.lastKnownSnapshot!(),
    );
    current = null;
    await provider.current({});

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: captured.generation,
      getActiveWorkspaceSnapshot: () =>
        resolveAuthorizedActiveTeamWorkspaceSnapshot(
          { workspaceId: 'workspace-1', generation: 0 },
          provider.lastKnownSnapshot!(),
        ),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => ({ localRecordChanged: true }),
    })).rejects.toThrow('active workspace changed');

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
  });

  it('atomically promotes the stage before committing SQLite metadata+cursor', async () => {
    const fx = await fixture();
    const commit = vi.fn(() => {
      expect(() => readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).not.toThrow();
      return { localRecordChanged: true };
    });

    const result = await promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit,
    });

    expect(result).toEqual({ localRecordChanged: true });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('new');
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-'))).toBe(false);
  });

  it('keeps one complete live tree addressable at every async durability boundary', async () => {
    const fx = await fixture();
    await writeFile(path.join(fx.liveDir, 'old-only.txt'), 'old');
    await writeFile(path.join(fx.stageDir, 'new-only.txt'), 'new');
    const observedVersions: string[] = [];
    const assertCompleteLiveTree = async (): Promise<void> => {
      const [index, entries] = await Promise.all([
        readFile(path.join(fx.liveDir, 'index.html'), 'utf8'),
        readdir(fx.liveDir),
      ]);
      if (index === 'old') {
        expect(entries.sort()).toEqual(['index.html', 'old-only.txt']);
      } else {
        expect(index).toBe('new');
        expect(entries.sort()).toEqual(['index.html', 'new-only.txt']);
      }
      observedVersions.push(index);
    };

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({
        workspaceId: 'workspace-1',
        generation: 4,
      }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => ({ localRecordChanged: true }),
      durability: {
        syncDirectory: async () => {
          await assertCompleteLiveTree();
        },
      },
    })).resolves.toEqual({ localRecordChanged: true });

    expect(observedVersions.length).toBeGreaterThan(0);
    expect(observedVersions).toContain('old');
    expect(observedVersions.at(-1)).toBe('new');
    await assertCompleteLiveTree();
  });

  it('restores the old live tree synchronously when the stage rename fails', async () => {
    const fx = await fixture();
    const stageRenameFailure = new Error('injected stage rename failure');
    let renameCalls = 0;

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({
        workspaceId: 'workspace-1',
        generation: 4,
      }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => ({ localRecordChanged: true }),
      durability: {
        renameDirectorySync: (from, to) => {
          renameCalls += 1;
          if (renameCalls === 2) throw stageRenameFailure;
          renameSync(from, to);
        },
      },
    })).rejects.toBe(stageRenameFailure);

    expect(renameCalls).toBe(3);
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    await expect(lstat(fx.stageDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some(
      (name) => name.includes('.od-pull-recovery-'),
    )).toBe(false);
  });

  it('uses journal rollback when the immediate live restore also fails', async () => {
    const fx = await fixture();
    const stageRenameFailure = new Error('injected stage rename failure');
    const immediateRestoreFailure = new Error('injected immediate restore failure');
    let renameCalls = 0;
    let thrown: unknown;

    try {
      await promoteAuthorizedTeamProjectStage({
        receipt: receipt(),
        liveDir: fx.liveDir,
        stageDir: fx.stageDir,
        expectedStageIdentity: fx.stageIdentity,
        journalDir: fx.journalDir,
        activeWorkspaceGeneration: 4,
        getActiveWorkspaceSnapshot: () => ({
          workspaceId: 'workspace-1',
          generation: 4,
        }),
        expectedWorkspaceId: 'workspace-1',
        isExpectedVersion: () => true,
        validateReceipt: () => undefined,
        commit: () => ({ localRecordChanged: true }),
        durability: {
          renameDirectorySync: (from, to) => {
            renameCalls += 1;
            if (renameCalls === 2) throw stageRenameFailure;
            if (renameCalls === 3) throw immediateRestoreFailure;
            renameSync(from, to);
          },
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(renameCalls).toBe(3);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([
      stageRenameFailure,
      immediateRestoreFailure,
    ]);
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    await expect(lstat(fx.stageDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some(
      (name) => name.includes('.od-pull-recovery-'),
    )).toBe(false);
  });

  it('restores the old tree when the SQLite transaction fails', async () => {
    const fx = await fixture();

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => {
        throw new Error('sqlite unavailable');
      },
    })).rejects.toThrow('sqlite unavailable');

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-stage-'))).toBe(false);
    expect(await readdir(fx.journalDir)).toEqual([]);
  });

  it('reports post-commit cleanup failure without rolling back the committed tree', async () => {
    const fx = await fixture();
    let committed = false;
    const onPostCommitCleanupError = vi.fn();
    const syncDirectory = vi.fn(async () => {
      if (committed) throw new Error('post-commit fsync failed');
    });

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => {
        committed = true;
        return { localRecordChanged: true };
      },
      onPostCommitCleanupError,
      durability: { syncDirectory },
    })).resolves.toEqual({ localRecordChanged: true });

    expect(committed).toBe(true);
    expect(onPostCommitCleanupError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'post-commit fsync failed' }),
    );
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('new');
    expect(await readdir(fx.journalDir)).toHaveLength(1);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-')))
      .toBe(true);

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => true,
    });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('new');
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-')))
      .toBe(false);
  });

  it('revalidates receipt expiry in the final synchronous guard before commit', async () => {
    const fx = await fixture();
    const commit = vi.fn();
    const validateReceipt = vi.fn(() => {
      throw new Error('authorized pull receipt is stale');
    });

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt,
      commit,
    })).rejects.toThrow('authorized pull receipt is stale');

    expect(validateReceipt).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
  });

  it.each([
    ['workspace generation', () => ({ workspaceId: 'workspace-1', generation: 5 }), () => true],
    ['workspace id', () => ({ workspaceId: 'workspace-2', generation: 4 }), () => true],
    ['expected version', () => ({ workspaceId: 'workspace-1', generation: 4 }), () => false],
  ])('discards the stage without touching live when %s drifted', async (
    _case,
    getActiveWorkspaceSnapshot,
    isExpectedVersion,
  ) => {
    const fx = await fixture();
    const commit = vi.fn();

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot,
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion,
      validateReceipt: () => undefined,
      commit,
    })).rejects.toThrow(/stale|workspace/u);

    expect(commit).not.toHaveBeenCalled();
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-stage-'))).toBe(false);
  });

  it('refuses to promote a replacement raced into the authorized stage path', async () => {
    const fx = await fixture();
    const { rename } = await import('node:fs/promises');
    await rename(fx.stageDir, `${fx.stageDir}.owned`);
    await mkdir(fx.stageDir);
    await writeFile(path.join(fx.stageDir, 'caller.txt'), 'preserve me');
    const commit = vi.fn();

    await expect(promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit,
    })).rejects.toThrow(/stage identity/u);

    expect(commit).not.toHaveBeenCalled();
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    expect(await readFile(path.join(fx.stageDir, 'caller.txt'), 'utf8')).toBe('preserve me');
  });

  it('rolls back a promoted-but-uncommitted journal on startup', async () => {
    const fx = await fixture();
    const recoveryDir = path.join(fx.root, '.project-1.od-pull-recovery-crash');
    const { rename } = await import('node:fs/promises');
    await rename(fx.liveDir, recoveryDir);
    await rename(fx.stageDir, fx.liveDir);
    await mkdir(fx.journalDir, { recursive: true });
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir,
      liveExisted: true,
      phase: 'promoted',
      promotedIdentity: fx.stageIdentity,
      recoveryIdentity: await lstat(recoveryDir).then((entry) => ({
        dev: String(entry.dev),
        ino: String(entry.ino),
      })),
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
    });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-'))).toBe(false);
  });

  it('restores old live from a prepared journal when the live rename was durable first', async () => {
    const fx = await fixture();
    const recoveryDir = path.join(fx.root, '.project-1.od-pull-recovery-crash');
    const { rename } = await import('node:fs/promises');
    const originalLiveIdentity = await lstat(fx.liveDir).then((entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
    }));
    await rename(fx.liveDir, recoveryDir);
    await mkdir(fx.journalDir, { recursive: true });
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir,
      liveExisted: true,
      phase: 'prepared',
      promotedIdentity: fx.stageIdentity,
      recoveryIdentity: originalLiveIdentity,
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
    });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-stage-'))).toBe(false);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-'))).toBe(false);
  });

  it('rejects a prepared live-move journal that omitted the original live identity', async () => {
    const fx = await fixture();
    await mkdir(fx.journalDir, { recursive: true });
    const record = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir: path.join(fx.root, '.project-1.od-pull-recovery-crash'),
      liveExisted: true,
      phase: 'prepared',
      promotedIdentity: fx.stageIdentity,
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));
    const errors: unknown[] = [];

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('old');
    expect(await readdir(fx.journalDir)).toEqual(['crash.json']);
  });

  it('removes an uncommitted first materialization when rename beat the prepared journal update', async () => {
    const fx = await fixture(false);
    const { rename } = await import('node:fs/promises');
    await rename(fx.stageDir, fx.liveDir);
    await mkdir(fx.journalDir, { recursive: true });
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir: path.join(fx.root, '.project-1.od-pull-recovery-crash'),
      liveExisted: false,
      phase: 'prepared',
      promotedIdentity: fx.stageIdentity,
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
    });

    await expect(lstat(fx.liveDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(fx.journalDir)).toEqual([]);
  });

  it('finalizes recovery cleanup when SQLite proves the promoted version committed', async () => {
    const fx = await fixture();
    const recoveryDir = path.join(fx.root, '.project-1.od-pull-recovery-crash');
    const { rename } = await import('node:fs/promises');
    await rename(fx.liveDir, recoveryDir);
    await rename(fx.stageDir, fx.liveDir);
    await mkdir(fx.journalDir, { recursive: true });
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir,
      liveExisted: true,
      phase: 'promoted',
      promotedIdentity: fx.stageIdentity,
      recoveryIdentity: await lstat(recoveryDir).then((entry) => ({
        dev: String(entry.dev),
        ino: String(entry.ino),
      })),
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: (entry) =>
        entry.receipt.projectId === 'project-1' &&
        entry.receipt.workspaceId === 'workspace-1' &&
        entry.receipt.ownerMemberId === 'owner-1' &&
        entry.receipt.resourceId === resourceId &&
        entry.receipt.versionId === 'version-7' &&
        entry.receipt.manifestDigest === `sha256:${'a'.repeat(64)}`,
    });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('new');
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-'))).toBe(false);
  });

  it('cleans an older superseded journal without touching the newer live tree', async () => {
    const fx = await fixture();
    const recoveryDir = path.join(fx.root, '.project-1.od-pull-recovery-crash');
    const { rename } = await import('node:fs/promises');
    await rename(fx.liveDir, recoveryDir);
    await rename(fx.stageDir, fx.liveDir);
    await mkdir(fx.journalDir, { recursive: true });
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt({ version: 5, versionId: 'version-5' }),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir,
      liveExisted: true,
      phase: 'promoted',
      promotedIdentity: fx.stageIdentity,
      recoveryIdentity: await lstat(recoveryDir).then((entry) => ({
        dev: String(entry.dev),
        ino: String(entry.ino),
      })),
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));
    await rm(fx.liveDir, { recursive: true });
    await mkdir(fx.liveDir);
    await writeFile(path.join(fx.liveDir, 'index.html'), 'newer-v6');
    const newerLiveIdentity = await lstat(fx.liveDir).then((entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
    }));

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
      isSuperseded: (entry) => entry.receipt.version < 6,
    });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8')).toBe('newer-v6');
    expect(await lstat(fx.liveDir).then((entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
    }))).toEqual(newerLiveIdentity);
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-')))
      .toBe(false);
  });

  it('cleans a failed-cleanup journal after a same-version retry commits a fresh receipt', async () => {
    const fx = await fixture();
    const firstReceipt = receipt({
      version: 5,
      versionId: 'version-5',
    });
    let firstCommitted = false;
    await expect(promoteAuthorizedTeamProjectStage({
      receipt: firstReceipt,
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => {
        firstCommitted = true;
        return undefined;
      },
      durability: {
        syncDirectory: async () => {
          if (firstCommitted) throw new Error('defer first cleanup');
        },
      },
    })).resolves.toBeUndefined();
    expect(await readdir(fx.journalDir)).toHaveLength(1);

    const retryStageDir = await mkdtemp(
      path.join(fx.root, '.project-1.od-pull-stage-'),
    );
    await writeFile(path.join(retryStageDir, 'index.html'), 'same-v5-retry');
    const retryStageIdentity = await lstat(retryStageDir).then((entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
    }));
    const retryReceipt = receipt({
      version: 5,
      versionId: 'version-5',
      authorizedAt: '2026-07-26T10:00:01.000Z',
      expiresAt: '2026-07-26T10:00:03.000Z',
    });
    let storedReceipt = firstReceipt;
    await promoteAuthorizedTeamProjectStage({
      receipt: retryReceipt,
      liveDir: fx.liveDir,
      stageDir: retryStageDir,
      expectedStageIdentity: retryStageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => {
        storedReceipt = retryReceipt;
      },
    });
    const retryLiveIdentity = await lstat(fx.liveDir).then((entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
    }));
    expect(await readdir(fx.journalDir)).toHaveLength(1);

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: (entry) =>
        entry.receipt.authorizedAt === storedReceipt.authorizedAt &&
        entry.receipt.expiresAt === storedReceipt.expiresAt,
      isSuperseded: (entry) =>
        teamProjectMaterializationSupersedes(storedReceipt, entry.receipt),
    });

    expect(await readFile(path.join(fx.liveDir, 'index.html'), 'utf8'))
      .toBe('same-v5-retry');
    expect(await lstat(fx.liveDir).then((entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
    }))).toEqual(retryLiveIdentity);
    expect(await readdir(fx.journalDir)).toEqual([]);
    expect((await readdir(fx.root)).some((name) => name.includes('.od-pull-recovery-')))
      .toBe(false);
  });

  it('preserves an unexpected live inode during startup rollback', async () => {
    const fx = await fixture();
    const recoveryDir = path.join(fx.root, '.project-1.od-pull-recovery-crash');
    const { rename } = await import('node:fs/promises');
    await rename(fx.liveDir, recoveryDir);
    await rename(fx.stageDir, fx.liveDir);
    const unexpectedLiveDir = path.join(fx.root, '.project-1.unexpected-live');
    await mkdir(unexpectedLiveDir);
    await writeFile(path.join(unexpectedLiveDir, 'caller.txt'), 'do not delete');
    await rm(fx.liveDir, { recursive: true });
    await rename(unexpectedLiveDir, fx.liveDir);
    await mkdir(fx.journalDir, { recursive: true });
    const recoveryStat = await lstat(recoveryDir);
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      recoveryDir,
      liveExisted: true,
      phase: 'promoted',
      promotedIdentity: fx.stageIdentity,
      recoveryIdentity: {
        dev: String(recoveryStat.dev),
        ino: String(recoveryStat.ino),
      },
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));
    const errors: unknown[] = [];

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect(await readFile(path.join(fx.liveDir, 'caller.txt'), 'utf8')).toBe('do not delete');
    expect(await readFile(path.join(recoveryDir, 'index.html'), 'utf8')).toBe('old');
    expect(await readdir(fx.journalDir)).toEqual(['crash.json']);
  });

  it('rejects a corrupt journal that points outside the allowed projects root', async () => {
    const fx = await fixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'od-outside-promotion-'));
    roots.push(outside);
    await writeFile(path.join(outside, 'caller.txt'), 'preserve');
    await mkdir(fx.journalDir, { recursive: true });
    const record: TeamMirrorPromotionJournalRecord = {
      schemaVersion: 1,
      id: 'crash',
      receipt: receipt(),
      liveDir: outside,
      stageDir: fx.stageDir,
      recoveryDir: path.join(fx.root, '.project-1.od-pull-recovery-crash'),
      liveExisted: false,
      phase: 'promoted',
      promotedIdentity: fx.stageIdentity,
    };
    await writeFile(path.join(fx.journalDir, 'crash.json'), JSON.stringify(record));
    const errors: unknown[] = [];

    await recoverAuthorizedTeamProjectPromotions({
      journalDir: fx.journalDir,
      allowedProjectsRoot: fx.root,
      isCommitted: () => false,
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect(await readFile(path.join(outside, 'caller.txt'), 'utf8')).toBe('preserve');
    expect(await readdir(fx.journalDir)).toEqual(['crash.json']);
  });

  it('fsyncs the journal and project directories across promotion boundaries', async () => {
    const fx = await fixture();
    const syncDirectory = vi.fn(async (_directory: string) => undefined);

    await promoteAuthorizedTeamProjectStage({
      receipt: receipt(),
      liveDir: fx.liveDir,
      stageDir: fx.stageDir,
      expectedStageIdentity: fx.stageIdentity,
      journalDir: fx.journalDir,
      activeWorkspaceGeneration: 4,
      getActiveWorkspaceSnapshot: () => ({ workspaceId: 'workspace-1', generation: 4 }),
      expectedWorkspaceId: 'workspace-1',
      isExpectedVersion: () => true,
      validateReceipt: () => undefined,
      commit: () => ({ localRecordChanged: false }),
      durability: { syncDirectory },
    });

    expect(syncDirectory.mock.calls.map(([directory]) => directory)).toEqual(
      expect.arrayContaining([
        fx.journalDir,
        path.dirname(fx.journalDir),
        fx.root,
      ]),
    );
    expect(syncDirectory.mock.calls.slice(0, 2).map(([directory]) => directory)).toEqual([
      fx.root,
      fx.journalDir,
    ]);
    expect(syncDirectory.mock.calls.filter(([directory]) => directory === fx.root).length)
      .toBeGreaterThanOrEqual(3);
  });
});
