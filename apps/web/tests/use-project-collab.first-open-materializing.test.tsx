// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCollab } from '../src/collab/useProjectCollab';

// Red spec for the QA P0 "first open of a shared project shows nothing".
//
// This is the web half of `apps/daemon/tests/collab-first-open-materializing
// .test.ts`. The payload below is the daemon's REAL first-open response for a
// shared project this install has never materialized: the hub named an owner
// (so the project is shared and read-only for this member), but the published
// head is still null because a fresh daemon's in-process head map is empty and
// the actual hub head is fetched fire-and-forget for a LATER poll to consume.
//
// `downloadPending` is what DesignFilesPanel uses to choose between
// "Syncing files from the team…" and the "Creations appear here" empty state
// with its create-a-file CTAs. Gated only on `publishedVersion > cursor` /
// `contentTransferState` / an in-flight pull, all three of which are blank
// here, it computes false — so the member is shown an empty project with CTAs
// that invite them to start creating over content that is still downloading.

const MEMBER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: 'ws-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-member',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  displayName: 'Member',
};

const OWNER_CONTEXT: WorkspaceCollabContext = {
  ...MEMBER_CONTEXT,
  workspaceMemberId: 'wm-owner',
};

function response(payload: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  } as unknown as Response;
}

/** The daemon's first-open `/collab/status` payload for a project whose only
 *  local record is an unmaterialized shared-project placeholder. */
function firstOpenStatus(overrides: Record<string, unknown> = {}) {
  return {
    publishedVersion: null,
    materializedVersion: null,
    contentTransferState: null,
    syncState: 'synced',
    ownerMemberId: 'wm-owner',
    awaitingFirstMaterialization: true,
    ...overrides,
  };
}

function daemonWith(status: Record<string, unknown>, context: WorkspaceCollabContext) {
  return (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/workspace/context')) return response({ context });
    if (pathname.endsWith('/collab/status')) return response(status);
    if (pathname.endsWith('/presence/heartbeat')) return response({ present: [] });
    return response({ ok: true });
  }) as typeof fetch;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('first open of an unmaterialized shared project (QA P0)', () => {
  it('reports downloadPending from the first status, before any published head is known', async () => {
    // Hoisted: `useProjectCollab` keys its effects on the fetch identity, so a
    // fresh closure per render would loop.
    const fetchImpl = daemonWith(firstOpenStatus(), MEMBER_CONTEXT);
    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 30_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Precondition: this really is the blank first-open response — none of the
    // existing download signals can fire.
    expect(result.current.publishedVersion).toBeNull();
    expect(result.current.syncState).toBe('synced');
    expect(result.current.isOwner).toBe(false);

    expect(result.current.downloadPending).toBe(true);
  });

  it('reports downloadPending for the OWNER of a placeholder they have not materialized either', async () => {
    // The reinstall case (recvqzaDvUU6B3): the daemon self-pulls for the owner,
    // but the owner never auto-pulls from the web, so the member-only
    // `shouldAutoPull` gate would leave them staring at the same empty state.
    // A placeholder means "local files are not the content" for every viewer.
    const fetchImpl = daemonWith(firstOpenStatus(), OWNER_CONTEXT);
    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 30_000,
        workspaceContext: OWNER_CONTEXT,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOwner).toBe(true);
    expect(result.current.downloadPending).toBe(true);
  });

  it('clears downloadPending once the daemon stops reporting the awaiting state', async () => {
    const fetchImpl = daemonWith(
      firstOpenStatus({
        awaitingFirstMaterialization: false,
        publishedVersion: 4,
        materializedVersion: 4,
      }),
      MEMBER_CONTEXT,
    );
    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 30_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.downloadPending).toBe(false);
  });
});
