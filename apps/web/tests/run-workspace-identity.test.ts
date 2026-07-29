// The workspace identity a run POST asserts, per project-scope state.
//
// `POST /api/runs` used to take its identity from `projectWorkspaceContext(scope)`
// alone, which is null for EVERY state that is not a resolved personal/team
// scope. A send issued in that window went out with no `x-od-workspace-*` at
// all, and the daemon's mutation gate answers a headerless mutation of a
// workspace-bound project with 401 WORKSPACE_CONTEXT_REQUIRED.
//
// The fix is deliberately NOT a blanket `?? caller`. Two of the states the
// daemon can ANSWER with must keep refusing, and this file is where that line
// is drawn — see `runWorkspaceIdentity`'s docblock for the invariant.

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

/** A fully resolved team scope — the state the run POST always worked in. */
function resolvedTeamScope(): ProjectWorkspaceScope {
  return {
    kind: 'team',
    projectId: PROJECT_ID,
    workspaceId: TEAM_WORKSPACE,
    visibility: 'personal',
    context: teamContext() as WorkspaceCollabContext & { workspaceType: 'team' },
  };
}

describe('runWorkspaceIdentity — the binding is still unread', () => {
  // THE REPORTED BUG. A Home send auto-fires as soon as the conversation and
  // message reads land; it does not wait for `GET /api/projects/:id/
  // workspace-scope`. In that window the caller's own identity is perfectly
  // well known — every other project write in ProjectView already asserts it —
  // yet the run POST alone went out anonymous.
  it('asserts the caller while the scope read is in flight', () => {
    expect(runWorkspaceIdentity({ loading: true, scope: null, initialLoadPending: true }, CALLER)).toEqual(CALLER);
  });

  it('still has nothing to assert when the caller has no identity either', () => {
    expect(runWorkspaceIdentity({ loading: true, scope: null, initialLoadPending: true }, null)).toBeNull();
  });
});

describe('runWorkspaceIdentity — the binding resolved', () => {
  // Unchanged behavior: a resolved scope is the authority for which workspace
  // the run writes into and which wallet pays, and it must win over the
  // caller's own (possibly different) current workspace.
  it('prefers the project\'s own resolved scope over the caller', () => {
    const scope = resolvedTeamScope();
    expect(runWorkspaceIdentity(
      { loading: false, scope, initialLoadPending: false },
      teamContext('ws-somewhere-else'),
    ))
      .toEqual(scope.context);
  });
});

describe('runWorkspaceIdentity — the daemon answered, and the answer must stand', () => {
  // `unbound` is the P0 case. `headerlessMutationAllowed` short-circuits on
  // "no row anywhere" BEFORE asking for an identity, so a headerless caller may
  // mutate an unbound project — that is the pinned invariant
  // 「未登录也可以用自己 cli 修改未登录态下的那些 project」
  // (e2e/tests/collab/headerless-mutation.test.ts). An ASSERTED identity takes
  // the other path, where `workspaceResourceMutationAllowed(null, …)` is false
  // for a missing row — so asserting here would turn a working 200 into a 403.
  it('asserts nothing for an unbound project, so the headerless allowance survives', () => {
    const scope: ProjectWorkspaceScope = {
      kind: 'unbound',
      projectId: PROJECT_ID,
      workspaceId: null,
      context: null,
    };
    expect(
      runWorkspaceIdentity({ loading: false, scope, initialLoadPending: false }, CALLER),
    ).toBeNull();
  });

  // `unavailable` is the revoked case, and it is why a blanket `?? caller` is
  // wrong. `resolveProjectWorkspaceScope` (apps/daemon/src/collab/
  // project-workspace-scope.ts) returns `unavailable` BOTH when the membership
  // directory could not be read AND when it answered cleanly with no active
  // membership for the caller — i.e. a proven "you were removed". Asserting the
  // caller's own stale headers there hands a removed member a
  // client-controlled `memberStatus: 'active'` claim, which
  // `withLastKnownMembership` only narrows when the daemon's own cache happens
  // to cover that same workspace. Staying headerless keeps the verdict on
  // daemon-owned state.
  it('asserts nothing when the project\'s workspace resolved unavailable (revoked)', () => {
    const scope: ProjectWorkspaceScope = {
      kind: 'unavailable',
      projectId: PROJECT_ID,
      workspaceId: TEAM_WORKSPACE,
      visibility: 'team',
      context: null,
    };
    expect(
      runWorkspaceIdentity({ loading: false, scope, initialLoadPending: false }, CALLER),
    ).toBeNull();
  });

  // Defensive: this daemon's scope route never answers 403 (it returns 404 or a
  // scope), so `forbidden` is unreachable today. Kept explicit so that a daemon
  // which DOES refuse the read fails closed rather than inheriting the
  // unread-binding fallback.
  it('asserts nothing when the scope read was refused outright', () => {
    expect(
      runWorkspaceIdentity(
        { loading: false, scope: null, failure: 'forbidden', initialLoadPending: false },
        CALLER,
      ),
    ).toBeNull();
  });

  // A FAILED scope read stays headerless too. This identity also selects the
  // wallet the AMR pre-run balance gate prices against, and with the project's
  // binding unknown, pre-checking the caller's TEAM wallet on that guess blocks
  // a send the daemon would have answered — the dead-button regression 21f452ffe
  // undid, pinned by 'lets a signed-in user send an AMR run with a
  // workspace-directory outage' in ProjectView.run-isolation.test.tsx.
  it('asserts nothing when the scope read failed, so the send is not pre-blocked', () => {
    expect(
      runWorkspaceIdentity(
        { loading: false, scope: null, failure: 'unavailable', initialLoadPending: false },
        CALLER,
      ),
    ).toBeNull();
  });

  // An old daemon has no workspace gate at all, and keeps its legal
  // pre-workspace headerless behavior.
  it('asserts nothing against a daemon with no workspace-scope endpoint', () => {
    expect(
      runWorkspaceIdentity(
        { loading: false, scope: null, failure: 'unsupported', initialLoadPending: false },
        CALLER,
      ),
    ).toBeNull();
  });
});

describe('runWorkspaceIdentity — the binding was read once and is being revalidated', () => {
  // THE REGRESSION nettee caught. `useProjectWorkspaceScope`'s trailing guard
  // re-enters `{ loading: true, scope: null }` whenever the resolved caller
  // identity stops matching — which every workspace switch does. Keying the
  // fallback on `loading` alone therefore made a send issued in that window
  // assert the workspace the user just switched TO, for a project still bound to
  // the one they switched FROM.
  //
  // Both consumers break, and differently: `POST /api/runs` can 403 because
  // `enforceWorkspaceResourceMutation` still finds the project row under the old
  // workspace, and `checkAmrBalanceGate` preflights the new workspace's wallet.
  // The second is worse than the `undefined` this helper was written to fix,
  // because a wrong wallet looks like a real answer.
  it('asserts nothing while revalidating after a workspace switch', () => {
    expect(
      runWorkspaceIdentity(
        { loading: true, scope: null, initialLoadPending: false },
        teamContext('ws-switched-to'),
      ),
      'the project\'s binding is already known; the caller\'s new workspace is not it',
    ).toBeNull();
  });

  // Same shape, opposite bit: this is the first read, so the caller is all there
  // is. Keeps the two causes of one shape visibly distinct in the spec.
  it('still asserts the caller when that same shape is the first read', () => {
    expect(
      runWorkspaceIdentity({ loading: true, scope: null, initialLoadPending: true }, CALLER),
    ).toEqual(CALLER);
  });
});
