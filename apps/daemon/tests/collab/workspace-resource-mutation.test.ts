import { describe, expect, it } from 'vitest';
import {
  enforceVerifiedWorkspaceResourceMutation,
  enforceVerifiedWorkspaceResourceRead,
  enforceWorkspaceResourceMutation,
  resolveOptionalLocalWorkspaceRequestAuthority,
  type WorkspaceResourceAccessInput,
} from '../../src/collab/workspace-resource-mutation.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';

// Cheapest layer that can see the symptom: exercise the shared gate directly
// against fake req/res/db seams, without spinning up an Express server or a
// real SQLite file. `enforceWorkspaceProjectMutation` in
// routes/project/index.ts is now a one-line delegation to this function, and
// `tests/routes/workspace-projects.test.ts` covers the end-to-end HTTP
// behavior for project; this file covers the shared decision logic itself so
// a future resource type (plugin today) can trust it without re-deriving
// project's full HTTP suite.

function fakeReq(headers: Record<string, string> = {}): any {
  return {
    get(name: string) {
      return headers[name] ?? undefined;
    },
  };
}

function fakeRes(): any {
  return {};
}

function spySendApiError() {
  const calls: Array<{
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }> = [];
  const sendApiError = (
    _res: unknown,
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => {
    calls.push({ status, code, message, ...(details ? { details } : {}) });
  };
  return { calls, sendApiError };
}

function workspaceHeaders(opts: {
  workspaceId?: string;
  memberId?: string;
  role?: string;
  lifecycleState?: string;
  canWriteSyncedFiles?: string;
} = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (opts.workspaceId) headers['x-od-workspace-id'] = opts.workspaceId;
  if (opts.memberId) headers['x-od-workspace-member-id'] = opts.memberId;
  if (opts.role) headers['x-od-workspace-role'] = opts.role;
  if (opts.lifecycleState) headers['x-od-workspace-lifecycle-state'] = opts.lifecycleState;
  if (opts.canWriteSyncedFiles) headers['x-od-workspace-can-write-synced-files'] = opts.canWriteSyncedFiles;
  return headers;
}

function makeLookups(rowsByResourceId: Record<string, WorkspaceResourceAccessInput & { workspaceId: string }>) {
  const getWorkspaceResource = (_db: unknown, workspaceId: string, resourceId: string) => {
    const row = rowsByResourceId[resourceId];
    if (!row || row.workspaceId !== workspaceId) return undefined;
    return row;
  };
  const getWorkspaceResourceByResourceId = (_db: unknown, resourceId: string) => rowsByResourceId[resourceId];
  return { getWorkspaceResource, getWorkspaceResourceByResourceId };
}

describe('resolveOptionalLocalWorkspaceRequestAuthority', () => {
  it('uses only the complete local namespace pair and ignores stale cloud policy fields', () => {
    const resolved = resolveOptionalLocalWorkspaceRequestAuthority(fakeReq(workspaceHeaders({
      workspaceId: 'workspace-a',
      memberId: 'member-a',
      role: 'owner',
      lifecycleState: 'locked',
      canWriteSyncedFiles: 'false',
    })));

    expect(resolved).toMatchObject({
      ok: true,
      context: {
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        role: 'member',
        lifecycleState: 'active',
        memberStatus: 'active',
        permissions: { canWriteSyncedFiles: true },
      },
    });
  });

  it('rejects a partial local namespace pair without any remote fallback', () => {
    expect(resolveOptionalLocalWorkspaceRequestAuthority(fakeReq(workspaceHeaders({
      workspaceId: 'workspace-a',
    })))).toMatchObject({
      ok: false,
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
    });
  });
});

describe('enforceWorkspaceResourceMutation', () => {
  it('allows a headerless caller against a resource with no team binding', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({});
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects a headerless caller against a team-visibility resource', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: 'member-owner' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{ status: 401, code: 'WORKSPACE_CONTEXT_REQUIRED', message: 'workspace context is required' }]);
  });

  // spec 04 §10 fix #3 (recvqbeDjAsejl / recvqbklNGDqYY): before this fix, the
  // null-ctx branch only refused a `visibility: 'team'` row and let ANY
  // `personal` row through unconditionally — so a signed-out caller (or a
  // plain `curl` with no workspace headers) could still mutate someone else's
  // personal-but-CLAIMED resource. A claimed resource is a claimed resource
  // regardless of whether it's also shared with a team; only a genuinely
  // UNBOUND resource (no row at all — the case above already covers this)
  // should pass a headerless caller through.
  it('rejects a headerless caller against a personal-visibility (but bound) resource', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-owner' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{ status: 401, code: 'WORKSPACE_CONTEXT_REQUIRED', message: 'workspace context is required' }]);
  });

  it('rejects a caller carrying only a partial workspace header pair', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({});
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq({ 'x-od-workspace-id': 'ws-1' }), // no member id
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{ status: 401, code: 'WORKSPACE_CONTEXT_REQUIRED', message: 'workspace context is required' }]);
  });

  it('allows the member who created the resource to mutate it', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'member' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects a different, non-privileged member from mutating someone else\'s resource', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-b', role: 'member' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{
      status: 403,
      code: 'WORKSPACE_PLUGIN_PERMISSION_DENIED',
      message: 'workspace plugin mutation is not allowed',
    }]);
  });

  it('does not let a privileged owner/admin mutate another member\'s Personal resource', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-owner', role: 'owner' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls.at(-1)?.code).toBe('WORKSPACE_PLUGIN_PERMISSION_DENIED');
  });

  it('keeps the existing Team-resource admin management policy', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-team': { workspaceId: 'ws-1', visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-admin', role: 'admin' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-team',
      'delete',
    );
    expect(allowed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('rejects mutation of a resource bound to a different workspace than the caller\'s', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-other', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'owner' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{
      status: 403,
      code: 'WORKSPACE_PLUGIN_PERMISSION_DENIED',
      message: 'workspace plugin mutation is not allowed',
    }]);
  });

  it('rejects mutation of a frozen resource even for a privileged caller', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'team', resourceState: 'frozen', createdByWorkspaceMemberId: 'member-owner' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-owner', role: 'owner' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{
      status: 403,
      code: 'WORKSPACE_PLUGIN_PERMISSION_DENIED',
      message: 'workspace plugin mutation is not allowed',
    }]);
  });

  // recvqbbQ4yljNC / recvqbeDjAsejl: a member removed from the workspace keeps
  // sending stale "active" workspace headers (its own client hasn't re-polled
  // /api/workspace/context yet) until the daemon cross-checks them against its
  // own last-verified membership state.
  describe('membership cross-check against the daemon\'s own last-known context', () => {
    it('BUG: allows a removed member\'s write when only client headers are consulted', () => {
      // This test pins the CURRENT (vulnerable) behavior: no
      // `getLastKnownMembership` is wired up, so the gate has only the
      // client's own claim to go on — exactly the pre-fix code path.
      const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
        'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
      });
      const { calls, sendApiError } = spySendApiError();
      const allowed = enforceWorkspaceResourceMutation(
        'plugin',
        fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'member' })),
        fakeRes(),
        sendApiError,
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
        {},
        'plugin-a',
        'delete',
      );
      expect(allowed).toBe(true);
      expect(calls).toHaveLength(0);
    });

    it('rejects the write once the daemon\'s own last-known context says the caller was removed', () => {
      const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
        'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
      });
      const { calls, sendApiError } = spySendApiError();
      // Client headers still say "active" (stale) — the daemon's own cache
      // says this same workspace's caller has been removed.
      const getLastKnownMembership = () => ({ workspaceId: 'ws-1', memberStatus: 'removed' as const });
      const allowed = enforceWorkspaceResourceMutation(
        'plugin',
        fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'member' })),
        fakeRes(),
        sendApiError,
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
        {},
        'plugin-a',
        'delete',
        getLastKnownMembership,
      );
      expect(allowed).toBe(false);
      expect(calls).toEqual([{
        status: 403,
        code: 'WORKSPACE_PLUGIN_PERMISSION_DENIED',
        message: 'workspace plugin mutation is not allowed',
      }]);
    });

    it('does not override an already-removed header (redundant agreement)', () => {
      const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
        'plugin-a': { workspaceId: 'ws-1', visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: 'member-owner' },
      });
      const { calls, sendApiError } = spySendApiError();
      const getLastKnownMembership = () => ({ workspaceId: 'ws-1', memberStatus: 'removed' as const });
      const allowed = enforceWorkspaceResourceMutation(
        'plugin',
        fakeReq({
          ...workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-owner', role: 'owner' }),
          'x-od-workspace-member-status': 'removed',
        }),
        fakeRes(),
        sendApiError,
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
        {},
        'plugin-a',
        'delete',
        getLastKnownMembership,
      );
      expect(allowed).toBe(false);
      expect(calls).toEqual([{
        status: 403,
        code: 'WORKSPACE_PLUGIN_PERMISSION_DENIED',
        message: 'workspace plugin mutation is not allowed',
      }]);
    });

    it('trusts the header when the cache has no opinion for this workspace (never queried it)', () => {
      const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
        'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
      });
      const { calls, sendApiError } = spySendApiError();
      const getLastKnownMembership = () => null;
      const allowed = enforceWorkspaceResourceMutation(
        'plugin',
        fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'member' })),
        fakeRes(),
        sendApiError,
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
        {},
        'plugin-a',
        'delete',
        getLastKnownMembership,
      );
      expect(allowed).toBe(true);
      expect(calls).toHaveLength(0);
    });

    it('trusts the header when the cache last resolved a DIFFERENT workspace', () => {
      const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
        'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
      });
      const { calls, sendApiError } = spySendApiError();
      // Cache holds a real "removed" fact, but for a DIFFERENT workspace than
      // the one this request is scoped to — must not leak across workspaces.
      const getLastKnownMembership = () => ({ workspaceId: 'ws-other', memberStatus: 'removed' as const });
      const allowed = enforceWorkspaceResourceMutation(
        'plugin',
        fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'member' })),
        fakeRes(),
        sendApiError,
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
        {},
        'plugin-a',
        'delete',
        getLastKnownMembership,
      );
      expect(allowed).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });

  it('reports WORKSPACE_LOCKED instead of a permission denial when the workspace itself is locked', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': { workspaceId: 'ws-1', visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: 'member-a' },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = enforceWorkspaceResourceMutation(
      'plugin',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-a', role: 'owner', lifecycleState: 'locked' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'plugin-a',
      'delete',
    );
    expect(allowed).toBe(false);
    expect(calls).toEqual([{
      status: 403,
      code: 'WORKSPACE_LOCKED',
      message: 'workspace plugin mutation is not allowed',
    }]);
  });
});

// The gate used to be ASYMMETRIC on a resource that no workspace has claimed:
//
//   headerless        -> allowed (`headerlessMutationAllowed` short-circuits on
//                        "no row anywhere" before it even asks for an identity)
//   identity asserted -> refused, because the asserted path resolves the row
//                        inside the caller's OWN workspace and treats a missing
//                        row as a refusal
//
// That asymmetry protected nothing. Any caller who wanted the permissive answer
// could simply drop its headers and get it, so the only thing the refusal did was
// punish honest clients for identifying themselves — and it is what forced the web
// client to tiptoe about WHEN it may name itself, which produced a
// 401 WORKSPACE_CONTEXT_REQUIRED on the Home example-prompt send.
//
// `routes/plugins/index.ts` already ships exactly the behavior asserted below,
// and names the rule: an unbound resource "stays outside the isolation regime
// rather than becoming permanently un-uninstallable the moment a caller happens
// to carry workspace headers" (the design's "no retroactive tagging" rule, which
// design systems' `designSystemVisibleFromWorkspace` also follows). Project was
// the one resource type that disagreed.
//
// This ONLY permits the operation. The gate returns a boolean and writes nothing,
// so a previously-unbound resource is not adopted into the asserting caller's
// workspace — #6213's objection to silently rebinding an orphan is untouched.
describe('enforceWorkspaceResourceMutation — a resource no workspace has claimed', () => {
  it('allows an asserted identity, exactly as it already allows a headerless caller', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({});
    const { calls, sendApiError } = spySendApiError();

    const allowed = enforceWorkspaceResourceMutation(
      'project',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-1' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'project-unbound',
      'writeFiles',
    );

    expect(allowed, 'the same caller would be allowed by simply omitting its headers').toBe(true);
    expect(calls).toEqual([]);
  });

  // The boundary that must NOT move: "no row in MY workspace" is not the same
  // fact as "no row anywhere". A resource bound to someone else's workspace stays
  // refused, which is what `e2e/tests/collab/headerless-mutation.test.ts` pins
  // for the headerless path and what stops dropping/forging headers from becoming
  // an escalation route.
  it('still refuses an asserted identity when the resource is bound to another workspace', () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'project-elsewhere': {
        workspaceId: 'ws-someone-else',
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-other',
      },
    });
    const { calls, sendApiError } = spySendApiError();

    const allowed = enforceWorkspaceResourceMutation(
      'project',
      fakeReq(workspaceHeaders({ workspaceId: 'ws-1', memberId: 'member-1' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'project-elsewhere',
      'writeFiles',
    );

    expect(allowed).toBe(false);
    expect(calls).toEqual([{
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project mutation is not allowed',
    }]);
  });
});

describe('authoritative Workspace-bound mutation regression', () => {
  it('rejects a forged owner role when the authoritative member is ordinary', async () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'project-a': {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-owner',
      },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = await enforceVerifiedWorkspaceResourceMutation(
      'project',
      fakeReq(workspaceHeaders({
        workspaceId: 'workspace-a',
        memberId: 'member-attacker',
        role: 'owner',
      })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'project-a',
      'writeFiles',
      async () => ({
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId: 'workspace-a',
          workspaceName: 'Workspace A',
          workspaceType: 'team',
          workspaceMemberId: 'member-attacker',
          role: 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      }),
    );

    expect(allowed).toBe(false);
    expect(calls.at(-1)?.code).toBe('WORKSPACE_PROJECT_PERMISSION_DENIED');
  });

  it('does not let ambient Workspace A authorize a headerless bound mutation', async () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'project-a': {
        workspaceId: 'workspace-a',
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-a',
      },
    });
    const { calls, sendApiError } = spySendApiError();
    const allowed = await enforceVerifiedWorkspaceResourceMutation(
      'project',
      fakeReq(),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'project-a',
      'writeFiles',
      async () => ({
        ok: false,
        status: 400,
        code: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'an explicit workspace context is required',
      }),
    );

    expect(allowed).toBe(false);
    expect(calls.at(-1)?.code).toBe('WORKSPACE_CONTEXT_REQUIRED');
  });

  it('fails closed before side effects when membership authority is unavailable', async () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'project-a': {
        workspaceId: 'workspace-a',
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-a',
      },
    });
    const { calls, sendApiError } = spySendApiError();
    let sideEffects = 0;
    const allowed = await enforceVerifiedWorkspaceResourceMutation(
      'project',
      fakeReq(workspaceHeaders({ workspaceId: 'workspace-a', memberId: 'member-a' })),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'project-a',
      'writeFiles',
      async () => ({
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      }),
    );
    if (allowed) sideEffects += 1;

    expect(allowed).toBe(false);
    expect(sideEffects).toBe(0);
    expect(calls.at(-1)).toMatchObject({
      status: 503,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      details: { retryable: true },
    });
  });

  it('re-verifies every mutation after a prior success and blocks removal or outage with zero new side effects', async () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({
      'plugin-a': {
        workspaceId: 'workspace-a',
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-a',
      },
    });
    const { sendApiError } = spySendApiError();
    const authorityResults = [
      {
        ok: true as const,
        context: workspaceContextFromDirectoryItem({
          workspaceId: 'workspace-a',
          workspaceName: 'Workspace A',
          workspaceType: 'team',
          workspaceMemberId: 'member-a',
          role: 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      },
      {
        ok: false as const,
        status: 403 as const,
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'the member was removed',
      },
      {
        ok: false as const,
        status: 503 as const,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace authority is unavailable',
        retryable: true as const,
      },
    ];
    let authorityReads = 0;
    let sideEffects = 0;
    const mutate = async () => {
      const allowed = await enforceVerifiedWorkspaceResourceMutation(
        'plugin',
        fakeReq(workspaceHeaders({
          workspaceId: 'workspace-a',
          memberId: 'member-a',
        })),
        fakeRes(),
        sendApiError,
        getWorkspaceResource,
        getWorkspaceResourceByResourceId,
        {},
        'plugin-a',
        'writeFiles',
        async () => authorityResults[authorityReads++]!,
      );
      if (allowed) sideEffects += 1;
      return allowed;
    };

    await expect(mutate()).resolves.toBe(true);
    expect(sideEffects).toBe(1);
    await expect(mutate()).resolves.toBe(false);
    expect(sideEffects).toBe(1);
    await expect(mutate()).resolves.toBe(false);
    expect(sideEffects).toBe(1);
    expect(authorityReads).toBe(3);
  });

  it('keeps a truly unbound legacy local resource mutable', async () => {
    const { getWorkspaceResource, getWorkspaceResourceByResourceId } = makeLookups({});
    const { calls, sendApiError } = spySendApiError();
    const allowed = await enforceVerifiedWorkspaceResourceMutation(
      'project',
      fakeReq(),
      fakeRes(),
      sendApiError,
      getWorkspaceResource,
      getWorkspaceResourceByResourceId,
      {},
      'legacy-local',
      'writeFiles',
      undefined,
    );

    expect(allowed).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe('authoritative Personal and Team resource visibility', () => {
  const verifiedAs = (
    memberId: string,
    role: 'owner' | 'admin' | 'member' = 'member',
  ) => async () => ({
    ok: true as const,
    context: workspaceContextFromDirectoryItem({
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      workspaceType: 'team' as const,
      workspaceMemberId: memberId,
      role,
      memberStatus: 'active' as const,
      lifecycleState: 'active' as const,
    }),
  });

  async function readAs(
    row: WorkspaceResourceAccessInput & { workspaceId: string },
    memberId: string,
    role: 'owner' | 'admin' | 'member' = 'member',
  ) {
    const lookups = makeLookups({ resource: row });
    const errors = spySendApiError();
    const allowed = await enforceVerifiedWorkspaceResourceRead(
      'skill',
      fakeReq(workspaceHeaders({ workspaceId: 'workspace-a', memberId, role })),
      fakeRes(),
      errors.sendApiError,
      lookups.getWorkspaceResource,
      lookups.getWorkspaceResourceByResourceId,
      {},
      'resource',
      verifiedAs(memberId, role),
    );
    return { allowed, errors: errors.calls };
  }

  it('allows the Personal creator to read', async () => {
    const result = await readAs({
      workspaceId: 'workspace-a',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    }, 'member-a');
    expect(result.allowed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it.each(['owner', 'admin'] as const)(
    'does not let a same-Workspace %s read another member\'s Personal resource',
    async (role) => {
      const result = await readAs({
        workspaceId: 'workspace-a',
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-a',
      }, `member-${role}`, role);
      expect(result.allowed).toBe(false);
      expect(result.errors.at(-1)?.code).toBe('WORKSPACE_SKILL_PERMISSION_DENIED');
    },
  );

  it('quarantines an attributed Personal row whose creator is missing', async () => {
    const result = await readAs({
      workspaceId: 'workspace-a',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
    }, 'member-owner', 'owner');
    expect(result.allowed).toBe(false);
  });

  it('lets another active member read a Team resource', async () => {
    const result = await readAs({
      workspaceId: 'workspace-a',
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    }, 'member-b');
    expect(result.allowed).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
