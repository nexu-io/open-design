import { describe, expect, it, vi } from 'vitest';

import { createTeamProjectsChangeEmitter } from '../../src/collab/team-projects-change-emitter.js';

describe('createTeamProjectsChangeEmitter', () => {
  it('invalidates the exact Workspace before consumers handle the signal', () => {
    const displayCache = new Map([['team-a', 'old-display'], ['team-b', 'b-display']]);
    const catalogCache = new Map([['team-a', 'old-catalog'], ['team-b', 'b-catalog']]);
    const observed: string[][] = [];
    const emitter = createTeamProjectsChangeEmitter({
      invalidateWorkspace: (workspaceId) => {
        displayCache.delete(workspaceId);
        catalogCache.delete(workspaceId);
      },
      emit: (workspaceId) => {
        observed.push([
          displayCache.get(workspaceId) ?? 'new-display',
          catalogCache.get(workspaceId) ?? 'new-catalog',
        ]);
      },
      warmWorkspace: () => new Promise(() => undefined),
      now: () => 1_000,
    });

    emitter('team-a', { projectId: 'project-1', kind: 'metadata' });

    expect(observed).toEqual([['new-display', 'new-catalog']]);
    expect(displayCache.get('team-b')).toBe('b-display');
    expect(catalogCache.get('team-b')).toBe('b-catalog');
  });

  it('does not suppress rapid same-project metadata or catalog transitions', () => {
    const emit = vi.fn();
    const emitter = createTeamProjectsChangeEmitter({
      invalidateWorkspace: vi.fn(),
      emit,
      warmWorkspace: async () => undefined,
      now: () => 1_000,
    });

    emitter('team-a', { projectId: 'project-1', kind: 'metadata' });
    emitter('team-a', { projectId: 'project-1', kind: 'metadata' });
    emitter('team-a', { projectId: 'project-1', kind: 'catalog' });
    emitter('team-a', { projectId: 'project-1', kind: 'catalog' });

    expect(emit).toHaveBeenCalledTimes(4);
  });
});
