/**
 * The composer's AMR workspace-scope gate must never fail SILENTLY.
 *
 * `21f452ffe` made an AMR project run require a resolved personal/team
 * workspace authority, and correctly fails closed when that authority is
 * unknown. What it did not do is say so: the send button just goes disabled,
 * with no reason and no way out. Home has a route out of the same dead end
 * (`checkAmrBalanceGate` -> the signed-out balance dialog's in-app sign-in);
 * inside a project the user was stranded.
 *
 * This module is the classifier that turns "gate closed" into an explainable
 * reason plus the remedy that actually clears it. It must classify, never
 * relax: every case that authorizes AMR keeps returning `null`, and the
 * disabled send button stays disabled.
 */

import { describe, expect, it } from 'vitest';
import type {
  ProjectWorkspaceScope,
  WorkspaceCollabContext,
} from '@open-design/contracts';

import { amrWorkspaceScopeBlock } from '../../src/runtime/amr-workspace-scope-gate';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import type { WorkspaceContextState } from '../../src/collab/useWorkspaceContext';

const PROJECT_ID = 'project-1';

function collabContext(
  workspaceId: string,
  workspaceType: 'personal' | 'team',
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType,
    workspaceMemberId: `member-${workspaceId}`,
  } as WorkspaceCollabContext;
}

const personalScope: ProjectWorkspaceScope = {
  kind: 'personal',
  projectId: PROJECT_ID,
  workspaceId: 'workspace-personal',
  visibility: 'personal',
  context: collabContext('workspace-personal', 'personal') as WorkspaceCollabContext & {
    workspaceType: 'personal';
  },
};

const teamScope: ProjectWorkspaceScope = {
  kind: 'team',
  projectId: PROJECT_ID,
  workspaceId: 'workspace-team',
  visibility: 'team',
  context: collabContext('workspace-team', 'team') as WorkspaceCollabContext & {
    workspaceType: 'team';
  },
};

const unboundScope: ProjectWorkspaceScope = {
  kind: 'unbound',
  projectId: PROJECT_ID,
  workspaceId: null,
  context: null,
};

const unavailableScope: ProjectWorkspaceScope = {
  kind: 'unavailable',
  projectId: PROJECT_ID,
  workspaceId: 'workspace-team',
  visibility: 'team',
  context: null,
};

function settled(scope: ProjectWorkspaceScope): ProjectWorkspaceScopeState {
  return { loading: false, scope };
}

const signedOutIdentity: WorkspaceContextState = { context: null, loading: false };
const signedInIdentity: WorkspaceContextState = {
  context: collabContext('workspace-team', 'team'),
  loading: false,
};

describe('amrWorkspaceScopeBlock', () => {
  it('stays silent when the run does not need a workspace authority', () => {
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: false,
        projectScope: settled(unboundScope),
        workspaceIdentity: signedOutIdentity,
      }),
    ).toBeNull();
  });

  it.each([
    ['personal', personalScope],
    ['team', teamScope],
  ])('stays silent when the project resolves a %s workspace', (_label, scope) => {
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: settled(scope),
        workspaceIdentity: signedInIdentity,
      }),
    ).toBeNull();
  });

  it('stays silent while the scope read is still in flight', () => {
    // A transient pre-answer frame must not accuse the user of anything.
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: { loading: true, scope: null },
        workspaceIdentity: signedOutIdentity,
      }),
    ).toBeNull();
  });

  it('blames the missing Open Design Cloud session when there is no identity', () => {
    // The reported dead end: signed out -> the daemon resolves no workspace for
    // the project -> `unbound`. The remedy is the in-app sign-in Home offers.
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: settled(unboundScope),
        workspaceIdentity: signedOutIdentity,
      }),
    ).toEqual({ kind: 'signed_out' });
  });

  it('blames the missing session for a bound project whose directory read fails', () => {
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: settled(unavailableScope),
        workspaceIdentity: signedOutIdentity,
      }),
    ).toEqual({ kind: 'signed_out' });
  });

  it.each([
    ['an old daemon', 'unsupported' as const],
    ['a revoked scope response', 'forbidden' as const],
    ['a workspace-directory outage', 'unavailable' as const],
  ])('reports an unresolved authority for %s while signed in', (_label, failure) => {
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: { loading: false, scope: null, failure },
        workspaceIdentity: signedInIdentity,
      }),
    ).toEqual({ kind: 'unresolved' });
  });

  it('reports an unresolved authority for an unbound project while signed in', () => {
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: settled(unboundScope),
        workspaceIdentity: signedInIdentity,
      }),
    ).toEqual({ kind: 'unresolved' });
  });

  it('reports an unresolved authority when the identity read itself failed', () => {
    // `context: null` WITH a failure is "unknown", not "signed out": offering a
    // sign-in for an identity we never actually read would be a guess.
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: settled(unboundScope),
        workspaceIdentity: { context: null, loading: false, failure: 'unavailable' },
      }),
    ).toEqual({ kind: 'unresolved' });
  });

  it('stays silent while the identity read has not settled yet', () => {
    expect(
      amrWorkspaceScopeBlock({
        requiresWorkspaceScope: true,
        projectScope: settled(unboundScope),
        workspaceIdentity: { context: null, loading: true },
      }),
    ).toBeNull();
  });
});
