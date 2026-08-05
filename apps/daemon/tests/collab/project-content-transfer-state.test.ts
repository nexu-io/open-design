import { describe, expect, it, vi } from 'vitest';
import {
  createProjectContentTransferStateStore,
  type ProjectContentTransferScope,
} from '../../src/collab/project-content-transfer-state.js';

const scope = (
  overrides: Partial<ProjectContentTransferScope> = {},
): ProjectContentTransferScope => ({
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  resourceTeamId: 'team-1',
  viewerMemberId: 'viewer-1',
  ownerMemberId: 'owner-1',
  ...overrides,
});

describe('project content transfer state', () => {
  it('publishes downloading immediately and retains an idle reconnect snapshot', () => {
    const onChange = vi.fn();
    let clock = 100;
    const store = createProjectContentTransferStateStore({
      now: () => clock,
      onChange,
    });

    const transferScope = scope();
    const started = store.begin(transferScope, 7);
    expect(started.state).toEqual({
      status: 'downloading',
      version: 7,
      startedAt: 100,
      updatedAt: 100,
    });
    expect(store.read(transferScope)).toEqual(started.state);

    clock = 200;
    const idle = store.finish(transferScope, started.token, 7);
    expect(idle).toEqual({
      status: 'idle',
      version: 7,
      startedAt: 100,
      updatedAt: 200,
    });
    expect(store.read(transferScope)).toEqual(idle);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not let an older or versionless completion hide a newer transfer', () => {
    let clock = 100;
    const store = createProjectContentTransferStateStore({ now: () => clock });
    const transferScope = scope();
    const older = store.begin(transferScope);
    clock = 101;
    const newer = store.begin(transferScope, 8);
    clock = 102;

    expect(store.finish(transferScope, older.token)).toBe(newer.state);
    expect(store.finish(transferScope, older.token, 7)).toBe(newer.state);
    expect(store.read(transferScope)).toMatchObject({
      status: 'downloading',
      version: 8,
    });
  });

  it('isolates identical project ids by workspace, resource team, viewer, and owner', () => {
    const store = createProjectContentTransferStateStore();
    const firstScope = scope();
    const otherScope = scope({
      workspaceId: 'workspace-2',
      resourceTeamId: 'team-2',
      viewerMemberId: 'viewer-2',
      ownerMemberId: 'owner-2',
    });
    const first = store.begin(firstScope, 7);
    const other = store.begin(otherScope, 9);

    expect(store.finish(otherScope, first.token, 7)).toBe(other.state);
    expect(store.read(firstScope)).toBe(first.state);
    expect(store.read(otherScope)).toBe(other.state);

    expect(store.finish(firstScope, first.token, 7)).toMatchObject({
      status: 'idle',
      version: 7,
    });
    expect(store.read(otherScope)).toBe(other.state);
  });

  it('uses monotonic timestamps when transitions share a wall-clock tick', () => {
    const store = createProjectContentTransferStateStore({ now: () => 100 });
    const transferScope = scope();

    const started = store.begin(transferScope, 1);
    const idle = store.finish(transferScope, started.token, 1);

    expect(idle?.updatedAt).toBeGreaterThan(started.state.updatedAt);
  });
});
