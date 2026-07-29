import { describe, expect, it, vi } from 'vitest';
import {
  authorizeCreatedProjectWorkspace,
  createdProjectWorkspaceHome,
  type CreatedProjectWorkspaceResolution,
} from '../../src/collab/created-project-workspace.js';

const ACTIVE_HEADERS: Record<string, string> = {
  'x-od-workspace-id': 'workspace-a',
  'x-od-workspace-type': 'team',
  'x-od-workspace-member-id': 'member-a',
  'x-od-workspace-role': 'owner',
  'x-od-workspace-lifecycle-state': 'active',
  'x-od-workspace-member-status': 'active',
  'x-od-workspace-can-share-projects': 'true',
  'x-od-workspace-can-write-synced-files': 'true',
};

function request(headers: Record<string, string> = ACTIVE_HEADERS) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name: string) {
      return normalized.get(name.toLowerCase());
    },
  };
}

function directoryItem(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'workspace-a',
    workspaceName: 'Workspace A',
    workspaceType: 'team' as const,
    workspaceMemberId: 'member-a',
    role: 'owner' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    ...overrides,
  };
}

function expectDenied(
  result: CreatedProjectWorkspaceResolution,
  status: number,
  code: string,
): void {
  expect(result).toMatchObject({ ok: false, status, code });
}

describe('authorizeCreatedProjectWorkspace', () => {
  it('returns the exact authoritative workspace/member context, independent of ambient workspace', async () => {
    const result = await authorizeCreatedProjectWorkspace(
      request(),
      async () => ({
        ok: true,
        items: [
          directoryItem({
            workspaceId: 'workspace-b',
            workspaceName: 'Workspace B',
            workspaceMemberId: 'member-b',
            role: 'member',
          }),
          directoryItem(),
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      context: {
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        workspaceType: 'team',
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
        canWriteSyncedFiles: true,
      },
    });
  });

  it('rejects a workspace/member pair that exists only across different directory rows', async () => {
    const result = await authorizeCreatedProjectWorkspace(
      request({
        ...ACTIVE_HEADERS,
        'x-od-workspace-member-id': 'member-b',
      }),
      async () => ({
        ok: true,
        items: [
          directoryItem(),
          directoryItem({
            workspaceId: 'workspace-b',
            workspaceName: 'Workspace B',
            workspaceMemberId: 'member-b',
          }),
        ],
      }),
    );

    expectDenied(result, 403, 'WORKSPACE_PROJECT_PERMISSION_DENIED');
  });

  it.each([
    ['removed member', { memberStatus: 'removed' }],
    ['locked workspace', { lifecycleState: 'locked' }],
    ['deleting workspace', { lifecycleState: 'deleting' }],
  ])('fails closed for an authoritative %s', async (_label, override) => {
    const result = await authorizeCreatedProjectWorkspace(
      request(),
      async () => ({ ok: true, items: [directoryItem(override)] }),
    );

    expectDenied(result, 403, 'WORKSPACE_PROJECT_PERMISSION_DENIED');
  });

  it('returns a retryable 503 when AMR workspace authority is unavailable', async () => {
    const result = await authorizeCreatedProjectWorkspace(
      request(),
      async () => ({ ok: false, items: [] }),
    );

    expectDenied(result, 503, 'WORKSPACE_AUTHORITY_UNAVAILABLE');
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('preserves explicitly anonymous/headerless compatibility without consulting AMR', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: false, items: [] }));
    const result = await authorizeCreatedProjectWorkspace(
      request({}),
      fetchDirectory,
    );

    expect(result).toEqual({ ok: true, context: null });
    expect(fetchDirectory).not.toHaveBeenCalled();
  });

  it('rejects a partial workspace identity before consulting AMR', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: true, items: [] }));
    const result = await authorizeCreatedProjectWorkspace(
      request({ 'x-od-workspace-id': 'workspace-a' }),
      fetchDirectory,
    );

    expectDenied(result, 400, 'WORKSPACE_CONTEXT_INCOMPLETE');
    expect(fetchDirectory).not.toHaveBeenCalled();
  });
});

// `x-od-workspace-*` headers are an UNAUTHENTICATED hint. Any local caller — the
// `od` CLI, a plain curl, a compromised page — can assert an arbitrary
// workspace/member pair. The creation paths with no authorization gate of their
// own (duplicate, design-system-copy, project-location scan, the library
// capture-as-page exit, brand extraction, the plugin share-project task) must
// therefore VERIFY an asserted identity before persisting it, and must still
// never answer 4xx — they ship today and answer 200 today.
//
// So: verify, then degrade. Never reject, never trust.
describe('createdProjectWorkspaceHome', () => {
  const AMBIENT = {
    workspaceId: 'workspace-ambient',
    workspaceType: 'personal' as const,
    workspaceMemberId: 'member-ambient',
    role: 'owner' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    permissions: { canShareProjects: true, canWriteSyncedFiles: true },
  };
  const ambient = () => AMBIENT;
  /** Headers naming a workspace/member pair the caller has no membership in. */
  const FOREIGN_HEADERS: Record<string, string> = {
    ...ACTIVE_HEADERS,
    'x-od-workspace-id': 'workspace-foreign',
    'x-od-workspace-member-id': 'member-foreign',
  };

  it('binds an asserted identity the directory confirms, using the DIRECTORY context', async () => {
    const home = await createdProjectWorkspaceHome(request(), ambient, async () => ({
      ok: true,
      items: [directoryItem()],
    }));

    expect(home).toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      memberStatus: 'active',
    });
  });

  it('refuses to persist an asserted workspace the caller has no membership in', async () => {
    const home = await createdProjectWorkspaceHome(
      request(FOREIGN_HEADERS),
      ambient,
      async () => ({ ok: true, items: [directoryItem()] }),
    );

    // The unverifiable claim is never written...
    expect(home?.workspaceId).not.toBe('workspace-foreign');
    expect(home?.workspaceMemberId).not.toBe('member-foreign');
    // ...and creation is NOT refused: it degrades to what the daemon can vouch for.
    expect(home).toMatchObject({
      workspaceId: AMBIENT.workspaceId,
      workspaceMemberId: AMBIENT.workspaceMemberId,
    });
  });

  it('leaves the project unbound when an unverifiable claim has no ambient workspace to fall back to', async () => {
    const home = await createdProjectWorkspaceHome(
      request(FOREIGN_HEADERS),
      () => null,
      async () => ({ ok: true, items: [directoryItem()] }),
    );

    // Unbound is strictly better than a fabricated binding.
    expect(home).toBeNull();
  });

  it('treats an unreadable membership authority as CANNOT CONFIRM, not as valid', async () => {
    const home = await createdProjectWorkspaceHome(request(), ambient, async () => ({
      ok: false,
      items: [],
    }));

    expect(home?.workspaceId).not.toBe('workspace-a');
    expect(home).toMatchObject({ workspaceId: AMBIENT.workspaceId });
  });

  it('degrades an authority that throws outright, rather than propagating', async () => {
    const home = await createdProjectWorkspaceHome(request(), ambient, async () => {
      throw new Error('authority exploded');
    });

    expect(home).toMatchObject({ workspaceId: AMBIENT.workspaceId });
  });

  it('does not persist a claim the daemon last-known state says was removed', async () => {
    const home = await createdProjectWorkspaceHome(
      request(),
      ambient,
      async () => ({ ok: true, items: [directoryItem()] }),
      () => ({ workspaceId: 'workspace-a', memberStatus: 'removed' }),
    );

    expect(home?.workspaceId).not.toBe('workspace-a');
    expect(home).toMatchObject({ workspaceId: AMBIENT.workspaceId });
  });

  it('binds the ambient workspace when the request asserts nothing at all', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: true, items: [directoryItem()] }));
    const home = await createdProjectWorkspaceHome(request({}), ambient, fetchDirectory);

    expect(home).toMatchObject({ workspaceId: AMBIENT.workspaceId });
    // A headerless caller asserts nothing, so there is nothing to verify.
    expect(fetchDirectory).not.toHaveBeenCalled();
  });

  it('stays unbound for a signed-out daemon with no identity anywhere', async () => {
    const home = await createdProjectWorkspaceHome(request({}), () => null);

    expect(home).toBeNull();
  });

  it('never binds an ambient workspace the daemon itself reports as unusable', async () => {
    for (const broken of [
      { ...AMBIENT, memberStatus: 'removed' as const },
      { ...AMBIENT, lifecycleState: 'locked' as const },
      { ...AMBIENT, permissions: { canShareProjects: true, canWriteSyncedFiles: false } },
    ]) {
      expect(await createdProjectWorkspaceHome(request({}), () => broken)).toBeNull();
    }
  });
});
