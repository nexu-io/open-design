import { describe, expect, it } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { WorkspaceContextState } from '../../src/collab/useWorkspaceContext';
import { workspaceIdentitySettledSignedOut } from '../../src/collab/workspace-identity-signed-out';

const context = { workspaceId: 'ws' } as unknown as WorkspaceCollabContext;
const state = (overrides: Partial<WorkspaceContextState>): WorkspaceContextState =>
  ({ context: null, loading: false, ...overrides });

describe('workspaceIdentitySettledSignedOut', () => {
  it('is false whenever an identity is present', () => {
    expect(workspaceIdentitySettledSignedOut(state({ context }))).toBe(false);
  });

  it('is false while the identity read is loading', () => {
    expect(workspaceIdentitySettledSignedOut(state({ loading: true }))).toBe(false);
  });

  it.each(['unavailable', 'reauth-required'] as const)('is false on failure %s', (failure) => {
    expect(workspaceIdentitySettledSignedOut(state({ failure }))).toBe(false);
  });

  it('is true on an unsupported (pre-workspace) daemon: headerless behavior is legal and no share surface can exist', () => {
    expect(workspaceIdentitySettledSignedOut(state({ failure: 'unsupported' }))).toBe(true);
  });

  it('is true only when the read settled with no identity at all', () => {
    expect(workspaceIdentitySettledSignedOut(state({}))).toBe(true);
  });
});
