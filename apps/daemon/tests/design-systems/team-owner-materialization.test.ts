import { describe, expect, it } from 'vitest';
import { ownedDesignSystemSourceIsReady } from '../../src/design-systems/team-owner-materialization.js';

const originalBinding = {
  workspaceId: 'workspace-a',
  visibility: 'personal',
  resourceState: 'active',
  createdByWorkspaceMemberId: 'member-owner',
};

describe('owned Design System Team materialization', () => {
  it('does not treat a matching hub owner as local materialization on a fresh data root', () => {
    expect(ownedDesignSystemSourceIsReady({
      ownerMemberId: 'member-owner',
      currentMemberId: 'member-owner',
      workspaceId: 'workspace-a',
      localSourceExists: false,
      binding: null,
    })).toBe(false);
  });

  it('skips the Team pull only when the exact local owner source and binding both exist', () => {
    expect(ownedDesignSystemSourceIsReady({
      ownerMemberId: 'member-owner',
      currentMemberId: 'member-owner',
      workspaceId: 'workspace-a',
      localSourceExists: true,
      binding: originalBinding,
    })).toBe(true);
  });

  it.each([
    ['another workspace', { ...originalBinding, workspaceId: 'workspace-b' }],
    ['a Team mirror binding', { ...originalBinding, visibility: 'team' }],
    ['a retired binding', { ...originalBinding, resourceState: 'deleted' }],
    ['another creator', { ...originalBinding, createdByWorkspaceMemberId: 'member-other' }],
  ])('does not trust %s as an owner-local source', (_label, binding) => {
    expect(ownedDesignSystemSourceIsReady({
      ownerMemberId: 'member-owner',
      currentMemberId: 'member-owner',
      workspaceId: 'workspace-a',
      localSourceExists: true,
      binding,
    })).toBe(false);
  });
});
