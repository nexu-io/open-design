import { describe, expect, it, vi } from 'vitest';
import {
  bindProjectToPersistedAutomationWorkspace,
  normalizePersistedAutomationWorkspaceScope,
} from '../../src/automations/workspace-scope.js';

describe('persisted automation Workspace scope', () => {
  it('binds the exact persisted billing address without consulting membership authority', () => {
    const ensureWorkspaceProject = vi.fn();

    bindProjectToPersistedAutomationWorkspace(
      ensureWorkspaceProject,
      {
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
      },
      'project-a',
      123,
    );

    expect(ensureWorkspaceProject).toHaveBeenCalledWith({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
      updatedByWorkspaceMemberId: 'member-a',
      syncState: 'local_only',
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      createdAt: 123,
      updatedAt: 123,
    });
  });

  it('normalizes only complete persisted pairs', () => {
    expect(normalizePersistedAutomationWorkspaceScope({
      workspaceId: ' workspace-a ',
      workspaceMemberId: ' member-a ',
    })).toEqual({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
    expect(normalizePersistedAutomationWorkspaceScope({
      workspaceId: 'workspace-a',
    })).toBeNull();
  });

  it('keeps historical no-scope automation records unbound', () => {
    expect(normalizePersistedAutomationWorkspaceScope(undefined)).toBeNull();
    expect(normalizePersistedAutomationWorkspaceScope(null)).toBeNull();
    expect(normalizePersistedAutomationWorkspaceScope({})).toBeNull();
  });
});
