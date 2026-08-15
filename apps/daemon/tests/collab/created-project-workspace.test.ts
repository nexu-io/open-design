import { describe, expect, it, vi } from 'vitest';
import {
  authorizeCreatedProjectWorkspace,
  createdProjectWorkspaceHome,
  CreatedProjectWorkspaceResolutionError,
  localProjectWorkspaceAttribution,
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

  it('returns a non-retryable 401 when the AMR credential has expired', async () => {
    const result = await authorizeCreatedProjectWorkspace(
      request(),
      async () => ({
        ok: false,
        items: [],
        reason: 'unauthorized',
        status: 401,
      }),
    );

    expectDenied(result, 401, 'AMR_AUTH_REQUIRED');
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('retryable');
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

describe('localProjectWorkspaceAttribution', () => {
  it('keeps a complete local attribution without consulting remote authority', () => {
    expect(localProjectWorkspaceAttribution(request())).toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      workspaceType: 'team',
    });
  });

  it('leaves missing or partial identity unbound instead of blocking local creation', () => {
    expect(localProjectWorkspaceAttribution(request({}))).toBeNull();
    expect(localProjectWorkspaceAttribution(request({
      'x-od-workspace-id': 'workspace-a',
    }))).toBeNull();
  });
});

// Resolver-style creation paths use the exact same authority result as direct
// POST /api/projects. Headerless legacy remains unbound; once identity is
// asserted, denial/outage must propagate before any project side effect.
describe('createdProjectWorkspaceHome', () => {
  /** Headers naming a workspace/member pair the caller has no membership in. */
  const FOREIGN_HEADERS: Record<string, string> = {
    ...ACTIVE_HEADERS,
    'x-od-workspace-id': 'workspace-foreign',
    'x-od-workspace-member-id': 'member-foreign',
  };

  it('binds an asserted identity the directory confirms, using the DIRECTORY context', async () => {
    const home = await createdProjectWorkspaceHome(request(), async () => ({
      ok: true,
      items: [directoryItem()],
    }));

    expect(home).toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      memberStatus: 'active',
    });
  });

  it('rejects an asserted workspace the caller has no membership in', async () => {
    await expect(createdProjectWorkspaceHome(
      request(FOREIGN_HEADERS),
      async () => ({ ok: true, items: [directoryItem()] }),
    )).rejects.toMatchObject({
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
    });
  });

  it('rejects an unreadable or throwing membership authority as retryable', async () => {
    await expect(createdProjectWorkspaceHome(request(), async () => ({
      ok: false,
      items: [],
    }))).rejects.toMatchObject({
      status: 503,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      retryable: true,
    });
    await expect(createdProjectWorkspaceHome(request(), async () => {
      throw new Error('authority exploded');
    })).rejects.toBeInstanceOf(CreatedProjectWorkspaceResolutionError);
  });

  it('leaves a completely headerless legacy request unbound', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: true, items: [directoryItem()] }));
    const home = await createdProjectWorkspaceHome(request({}), fetchDirectory);

    expect(home).toBeNull();
    expect(fetchDirectory).not.toHaveBeenCalled();
  });

  it('rejects a partial asserted identity instead of dropping its scope', async () => {
    await expect(createdProjectWorkspaceHome(
      request({ 'x-od-workspace-id': 'workspace-a' }),
    )).rejects.toMatchObject({
      status: 400,
      code: 'WORKSPACE_CONTEXT_INCOMPLETE',
    });
  });
});
