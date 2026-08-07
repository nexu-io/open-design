import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createActiveWorkspaceSelectionStore,
  resolveAuthorizedActiveTeamWorkspaceSnapshot,
} from '../../src/collab/active-workspace-selection.js';
import {
  createDevWorkspaceContextProvider,
  withLastKnownWorkspaceContext,
} from '../../src/collab/workspace-context.js';
import type { WorkspaceCollabContext } from '@open-design/contracts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('observed active team workspace snapshot', () => {
  const activeIdentity = {
    workspaceId: 'workspace-1',
    teamId: 'team-1',
    workspaceMemberId: 'member-1',
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

  it('uses the freshly verified team identity when no explicit pin exists', () => {
    expect(resolveAuthorizedActiveTeamWorkspaceSnapshot(
      { workspaceId: null, generation: 0 },
      { context: activeIdentity, generation: 1 },
    )).toEqual({ workspaceId: 'workspace-1', generation: 1 });
  });

  it('fails closed when an explicit pin disagrees with verified identity', () => {
    expect(resolveAuthorizedActiveTeamWorkspaceSnapshot(
      { workspaceId: 'workspace-pinned', generation: 4 },
      { context: activeIdentity, generation: 2 },
    )).toEqual({ workspaceId: null, generation: 6 });
  });

  it('records A to B to A even when no authorization snapshot was read at B', async () => {
    const provider = withLastKnownWorkspaceContext(
      createDevWorkspaceContextProvider(activeIdentity),
    );
    await provider.current({});
    const captured = provider.lastKnownSnapshot!();

    provider.set!({ ...activeIdentity, workspaceId: 'workspace-2' });
    provider.set!(activeIdentity);

    expect(provider.lastKnownSnapshot!()).toEqual({
      context: activeIdentity,
      generation: captured.generation + 2,
    });
  });

  it('keeps the identity generation stable across a transient null that recovers to A', async () => {
    let current: WorkspaceCollabContext | null = activeIdentity;
    const provider = withLastKnownWorkspaceContext({
      current: async () => current,
    });
    await provider.current({});
    const captured = provider.lastKnownSnapshot!();

    current = null;
    await provider.current({});
    expect(provider.lastKnown!()).toBeNull();
    expect(provider.lastKnownSnapshot!()).toEqual({
      context: null,
      generation: captured.generation,
    });

    current = activeIdentity;
    await provider.current({});
    expect(provider.lastKnownSnapshot!()).toEqual(captured);
  });

  it('keeps a persistent null unavailable so promotion still fails closed', async () => {
    let current: WorkspaceCollabContext | null = activeIdentity;
    const provider = withLastKnownWorkspaceContext({
      current: async () => current,
    });
    await provider.current({});
    const captured = provider.lastKnownSnapshot!();

    current = null;
    await provider.current({});

    expect(resolveAuthorizedActiveTeamWorkspaceSnapshot(
      { workspaceId: 'workspace-1', generation: 0 },
      provider.lastKnownSnapshot!(),
    )).toEqual({
      workspaceId: null,
      generation: captured.generation,
    });
  });

  it('increments identity generation when authoritative current changes from A to B', async () => {
    let current: WorkspaceCollabContext | null = activeIdentity;
    const provider = withLastKnownWorkspaceContext({
      current: async () => current,
    });
    await provider.current({});
    const captured = provider.lastKnownSnapshot!();

    current = { ...activeIdentity, workspaceId: 'workspace-2' };
    await provider.current({});

    expect(provider.lastKnownSnapshot!()).toMatchObject({
      context: { workspaceId: 'workspace-2' },
      generation: captured.generation + 1,
    });
  });

  it('increments identity generation for member and lifecycle drift', async () => {
    let current: WorkspaceCollabContext | null = activeIdentity;
    const provider = withLastKnownWorkspaceContext({
      current: async () => current,
    });
    await provider.current({});
    const captured = provider.lastKnownSnapshot!();
    current = { ...activeIdentity, memberStatus: 'removed' };
    await provider.current({});
    current = {
      ...activeIdentity,
      lifecycleState: 'locked',
    };
    await provider.current({});

    expect(provider.lastKnownSnapshot!()).toMatchObject({
      generation: captured.generation + 2,
    });
  });

  it('increments identity generation when a dev provider explicitly clears context', async () => {
    const provider = withLastKnownWorkspaceContext(
      createDevWorkspaceContextProvider(activeIdentity),
    );
    await provider.current({});
    const captured = provider.lastKnownSnapshot!();

    provider.set!(null);

    expect(provider.lastKnownSnapshot!()).toEqual({
      context: null,
      generation: captured.generation + 1,
    });
  });
});

describe('active workspace selection generation', () => {
  it('notifies subscribers after persisted selection changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-workspace-selection-'));
    roots.push(root);
    const store = createActiveWorkspaceSelectionStore(root);
    const selections: Array<string | null> = [];
    const unsubscribe = store.subscribe((workspaceId) => {
      selections.push(workspaceId);
    });

    await store.set('workspace-1');
    await store.set('workspace-2');
    await store.clear();
    unsubscribe();
    await store.set('workspace-3');

    expect(selections).toEqual(['workspace-1', 'workspace-2', null]);
  });

  it('detects away-and-back changes even when the final workspace id matches', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-workspace-selection-'));
    roots.push(root);
    const store = createActiveWorkspaceSelectionStore(root);

    await store.set('workspace-1');
    const captured = store.snapshot();
    await store.set('workspace-2');
    await store.set('workspace-1');

    expect(store.snapshot()).toEqual({
      workspaceId: 'workspace-1',
      generation: captured.generation + 2,
    });
  });

  it('increments generation when the selection is cleared', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-workspace-selection-'));
    roots.push(root);
    const store = createActiveWorkspaceSelectionStore(root);
    await store.set('workspace-1');
    const captured = store.snapshot();

    await store.clear();

    expect(store.snapshot()).toEqual({
      workspaceId: null,
      generation: captured.generation + 1,
    });
  });
});
