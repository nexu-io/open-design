// The workspace identity a run creation asserts.
//
// `POST /api/runs` used to take its identity from `projectWorkspaceContext(scope)`
// alone, which is null for EVERY state that is not a resolved personal/team
// scope. A send issued in that window went out with no `x-od-workspace-*` at
// all, and the daemon's mutation gate answered a headerless mutation of a
// workspace-bound project with 401 WORKSPACE_CONTEXT_REQUIRED.
//
// There is deliberately no "may I name myself yet" condition here. Three review
// rounds went into trying to name the safe window — "only while loading", "only
// on the first read", "only when the project's binding agrees" — and each one
// leaked, because all three were really modelling ONE daemon asymmetry: a
// resource no workspace had claimed was mutable by a headerless caller and
// refused to a caller that identified itself. That asymmetry is fixed in
// `enforceWorkspaceResourceMutation`, so the client no longer models it and the
// refusals live where they can be judged against daemon-owned state.
//
// The states that must still be refused are pinned server-side, in
// `apps/daemon/tests/collab/workspace-resource-mutation.test.ts`.

import { describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type ProjectWorkspaceScope,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { runWorkspaceIdentity } from '../src/collab/useProjectWorkspaceScope';

const PROJECT_ID = 'p-caustic-pool';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';

function teamContext(workspaceId = TEAM_WORKSPACE): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: 'member-sender',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_pro',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  } as WorkspaceCollabContext;
}

const CALLER = teamContext();
/** The scope endpoint has not answered yet — where the reported 401 came from. */
const UNREAD = { loading: true, scope: null } as const;

describe('runWorkspaceIdentity', () => {
  // THE REPORTED BUG. A Home send auto-fires as soon as the conversation and
  // message reads land; it does not wait for `GET /api/projects/:id/
  // workspace-scope`. The caller's identity is known the whole time, and every
  // other project write in ProjectView already asserts it.
  it('names the caller while its matching persisted project scope is unread', () => {
    expect(runWorkspaceIdentity(UNREAD, CALLER, TEAM_WORKSPACE)).toEqual(CALLER);
  });

  // The project's resolved scope is the authority for which workspace the run
  // writes into, so it beats the caller's own current workspace.
  it('prefers the project\'s own resolved scope over the caller', () => {
    const scope: ProjectWorkspaceScope = {
      kind: 'team',
      projectId: PROJECT_ID,
      workspaceId: TEAM_WORKSPACE,
      visibility: 'personal',
      context: teamContext() as WorkspaceCollabContext & { workspaceType: 'team' },
    };
    expect(
      runWorkspaceIdentity(
        { loading: false, scope },
        teamContext('ws-somewhere-else'),
        TEAM_WORKSPACE,
      ),
    ).toEqual(scope.context);
  });

  it('does not borrow workspace B while an A-bound project is unread after remount', () => {
    expect(
      runWorkspaceIdentity(UNREAD, teamContext('ws-b'), TEAM_WORKSPACE),
    ).toBeNull();
  });

  // Signed out / no workspace plane: nothing to name, so the request stays
  // headerless and keeps its legal pre-workspace behavior. This is the branch
  // that preserves 「未登录也可以用自己 cli 修改未登录态下的那些 project」.
  it('asserts nothing when the caller has no identity', () => {
    expect(runWorkspaceIdentity(UNREAD, null, TEAM_WORKSPACE)).toBeNull();
    expect(
      runWorkspaceIdentity(
        { loading: false, scope: null, failure: 'unsupported' },
        null,
        TEAM_WORKSPACE,
      ),
    ).toBeNull();
  });

  it('names the caller after the daemon confirms that the project is unbound', () => {
    expect(
      runWorkspaceIdentity(
        {
          loading: false,
          scope: {
            kind: 'unbound',
            projectId: PROJECT_ID,
            workspaceId: null,
            context: null,
          },
        },
        CALLER,
        null,
      ),
    ).toEqual(CALLER);
  });

  // `/workspace-scope` is fresher than the mutation gate's accepted-lag
  // `lastKnown()` cache in this scenario: membership removal is already
  // authoritative here while the old caller object still says active. Do not
  // add that stale assertion to the request after the daemon has answered.
  it.each([
    ['an unavailable project scope', {
      loading: false,
      scope: {
        kind: 'unavailable' as const,
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team' as const,
        context: null,
      },
    }],
    ['a failed scope read', { loading: false, scope: null, failure: 'unavailable' as const }],
    ['a refused scope read', { loading: false, scope: null, failure: 'forbidden' as const }],
    ['an unsupported scope read', { loading: false, scope: null, failure: 'unsupported' as const }],
  ])('does not borrow the stale caller for %s', (_label, state) => {
    expect(runWorkspaceIdentity(state, CALLER, TEAM_WORKSPACE)).toBeNull();
  });
});
