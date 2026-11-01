import { describe, expect, it, vi } from 'vitest';
import { createPublicFileMutations } from '../../src/collab/public-file-mutations.js';
import {
  reconcileWorkspaceProjectsWithRemote,
  type LocalTeamProjectBinding,
  type RemoteTeamProjectRef,
  type WorkspaceProjectsReconcilerDeps,
} from '../../src/collab/workspace-projects-reconciler.js';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
function fixture(visibility: 'personal' | 'team') {
  const transitions = createPublicFileMutations();
  const row: LocalTeamProjectBinding = { projectId: 'p', workspaceId: 'w', visibility,
    resourceState: 'active', createdByWorkspaceMemberId: 'owner', resourceHubResourceId: 'server-root' };
  const applyBind = vi.fn((_id, patch) => Object.assign(row, patch));
  const applyDemote = vi.fn((_ws, _id, patch) => Object.assign(row, patch));
  const deps: WorkspaceProjectsReconcilerDeps = {
    captureReconciliation: transitions.captureReconciliation,
    getWorkspaceIdentity: async () => ({ workspaceId: 'w', workspaceMemberId: 'owner' }),
    listRemoteTeamProjects: async () => [],
    hasLocalProject: () => true,
    listLocalTeamRows: () => row.visibility === 'team' ? [row] : [],
    getLocalBinding: () => row,
    applyBind, applyDemote, applyRevoke: vi.fn(),
  };
  return { transitions, row, deps, applyBind, applyDemote };
}

describe('explicit move/catalog reconciliation revision fence', () => {
  it('first share survives private registration absent from team membership until policy ACK', async () => {
    const f = fixture('personal');
    const remote = barrier();
    const staged = barrier();
    const move = f.transitions.withMoves(['p'], async () => {
      f.row.visibility = 'team';
      staged.release();
      await remote.promise;
      // The explicit policy ACK is committed before leaving the move lane.
      f.row.visibility = 'team';
    });
    try {
      await staged.promise;
      expect(await reconcileWorkspaceProjectsWithRemote(f.deps)).toEqual({ bound: 0, demoted: 0, revoked: 0 });
      expect(f.applyDemote).not.toHaveBeenCalled();
      expect(f.row.visibility).toBe('team');
      remote.release();
      await move;
      f.deps.listRemoteTeamProjects = async () => [{ projectId: 'p', ownerMemberId: 'owner' }];
      await reconcileWorkspaceProjectsWithRemote(f.deps);
      expect(f.row.resourceHubResourceId).toBe('server-root');
      expect(f.row.createdByWorkspaceMemberId).toBe('owner');
    } finally { remote.release(); await move; }
  });

  it.each(['during', 'before'] as const)('demotion rejects a background team observation captured %s the move, even after private ACK', async (order) => {
    const f = fixture('team');
    const readStarted = barrier();
    const read = barrier();
    const moveStarted = barrier();
    const ack = barrier();
    f.deps.listRemoteTeamProjects = async () => {
      readStarted.release();
      await read.promise;
      return [{ projectId: 'p', ownerMemberId: 'owner' }];
    };
    const startMove = () => f.transitions.withMoves(['p'], async () => {
      f.row.visibility = 'personal';
      moveStarted.release();
      await ack.promise;
      f.row.visibility = 'personal';
    });
    let move: Promise<void>;
    let reconcile: Promise<unknown>;
    if (order === 'before') {
      reconcile = reconcileWorkspaceProjectsWithRemote(f.deps);
      await readStarted.promise;
      move = startMove();
    } else {
      move = startMove();
      await moveStarted.promise;
      reconcile = reconcileWorkspaceProjectsWithRemote(f.deps);
    }
    try {
      await moveStarted.promise;
      await readStarted.promise;
      ack.release();
      await move;
      read.release();
      expect(await reconcile).toEqual({ bound: 0, demoted: 0, revoked: 0 });
      expect(f.applyBind).not.toHaveBeenCalled();
      expect(f.row.visibility).toBe('personal');
      expect(f.row.resourceHubResourceId).toBe('server-root');
      // A subsequent fresh authoritative list remains able to reconcile.
      f.deps.listRemoteTeamProjects = async () => [{ projectId: 'p', ownerMemberId: 'owner' }];
      await reconcileWorkspaceProjectsWithRemote(f.deps);
      expect(f.applyBind).toHaveBeenCalledTimes(1);
    } finally { ack.release(); read.release(); await Promise.all([move, reconcile]); }
  });

  it('a first-share absence read finishing after team ACK cannot demote confirmed policy', async () => {
    const f = fixture('personal');
    const readStarted = barrier();
    const read = barrier();
    f.deps.listRemoteTeamProjects = async (): Promise<readonly RemoteTeamProjectRef[]> => {
      readStarted.release(); await read.promise; return [];
    };
    const reconciliation = reconcileWorkspaceProjectsWithRemote(f.deps);
    await readStarted.promise;
    await f.transitions.withMoves(['p'], async () => { f.row.visibility = 'team'; });
    read.release();
    expect(await reconciliation).toEqual({ bound: 0, demoted: 0, revoked: 0 });
    expect(f.applyDemote).not.toHaveBeenCalled();
    expect(f.row.visibility).toBe('team');
    // Nonoverlapping genuine absence is still authoritative (no permanent lock).
    f.deps.listRemoteTeamProjects = async () => [];
    await reconcileWorkspaceProjectsWithRemote(f.deps);
    expect(f.applyDemote).toHaveBeenCalledTimes(1);
    expect(f.row.visibility).toBe('personal');
  });

  it('sorted overlapping batch/single moves remain serialized and release on failure', async () => {
    const f = fixture('team');
    const started = barrier();
    const ack = barrier();
    const calls: string[] = [];
    const batch = f.transitions.withMoves(['b', 'a'], async () => {
      calls.push('batch'); started.release(); await ack.promise; throw new Error('upload failed');
    });
    const rejection = expect(batch).rejects.toThrow('upload failed');
    await started.promise;
    const single = f.transitions.withMoves(['a'], async () => { calls.push('single'); });
    expect(calls).toEqual(['batch']);
    expect(f.transitions.captureReconciliation()('a')).toBe(false);
    expect(f.transitions.captureReconciliation()('unrelated')).toBe(true);
    ack.release();
    await rejection;
    await single;
    expect(calls).toEqual(['batch', 'single']);
    expect(f.transitions.captureReconciliation()('a')).toBe(true);
  });
});
