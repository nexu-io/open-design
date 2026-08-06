import { describe, expect, it, vi } from 'vitest';
import { pickAndImportFolder } from '../../src/main/runtime.js';

describe('pickAndImportFolder workspace authority', () => {
  it('forwards the exact renderer-selected workspace/member as daemon headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        project: { id: 'project-imported' },
        conversationId: 'conversation-imported',
        entryFile: 'index.html',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    // A faithful renderer-side context, wider than the subset the host bridge
    // models. Kept in a variable rather than inlined so it is checked for
    // structural compatibility instead of exact-shape excess properties —
    // carrying the extra fields is exactly what real callers do.
    const workspaceContext = {
      workspaceId: 'workspace-desktop',
      workspaceType: 'team',
      workspaceMemberId: 'member-desktop',
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: 'team',
      providerMode: 'platform_credits',
      seatSummary: {
        seatLimit: 5,
        usedSeats: 2,
        availableSeats: 3,
        isSeatFull: false,
      },
      permissions: {
        canManageMembers: false,
        canManageBilling: false,
        canInviteMembers: false,
        canManageAutoRecharge: false,
        canViewWorkspaceSettings: true,
        canManageSharedResources: false,
        canShareProjects: true,
        canWriteSyncedFiles: true,
      },
    };

    const result = await pickAndImportFolder({
      apiBaseUrl: 'http://127.0.0.1:17591',
      baseDir: '/tmp/workspace-folder',
      desktopAuthSecret: Buffer.alloc(32, 1),
      fetchImpl,
      mintToken: () => 'desktop-import-token',
      init: {
        skillId: 'prototype-skill',
        workspaceContext,
      },
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-od-desktop-import-token': 'desktop-import-token',
      'x-od-workspace-id': 'workspace-desktop',
      'x-od-workspace-member-id': 'member-desktop',
      'x-od-workspace-type': 'team',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      baseDir: '/tmp/workspace-folder',
      skillId: 'prototype-skill',
    });
  });
});
