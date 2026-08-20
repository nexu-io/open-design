import { describe, expect, it, vi } from 'vitest';
import {
  authorizeCreatedProjectWorkspace,
  createdProjectWorkspaceHome,
  localProjectWorkspaceAttribution,
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

describe('authorizeCreatedProjectWorkspace', () => {
  it('keeps complete local attribution without consulting remote authority', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: false as const, items: [] }));
    const result = await authorizeCreatedProjectWorkspace(
      request(),
      fetchDirectory,
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
    expect(fetchDirectory).not.toHaveBeenCalled();
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

  it('leaves a partial workspace identity unbound without consulting AMR', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: true, items: [] }));
    const result = await authorizeCreatedProjectWorkspace(
      request({ 'x-od-workspace-id': 'workspace-a' }),
      fetchDirectory,
    );

    expect(result).toEqual({ ok: true, context: null });
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

// Resolver-style local creation paths retain attribution without inheriting a
// cloud availability dependency. Remote publication is authorized later.
describe('createdProjectWorkspaceHome', () => {
  it('binds complete local attribution while Vela is unavailable', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: false as const, items: [] }));
    const home = await createdProjectWorkspaceHome(request(), fetchDirectory);

    expect(home).toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      memberStatus: 'active',
    });
    expect(fetchDirectory).not.toHaveBeenCalled();
  });

  it('leaves a completely headerless legacy request unbound', async () => {
    const fetchDirectory = vi.fn(async () => ({ ok: true as const, items: [] }));
    const home = await createdProjectWorkspaceHome(request({}), fetchDirectory);

    expect(home).toBeNull();
    expect(fetchDirectory).not.toHaveBeenCalled();
  });

  it('leaves a partial asserted identity unbound', async () => {
    await expect(createdProjectWorkspaceHome(
      request({ 'x-od-workspace-id': 'workspace-a' }),
    )).resolves.toBeNull();
  });
});
