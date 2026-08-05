// Computing a workspace identity must be TOTAL — it may never throw.
//
// `workspaceIdentityCacheKey` used to dereference `context.permissions`
// unguarded. That was survivable while it was only called during render (a throw
// there fails loudly, in the right place) and inside `fetchSkills`'s own
// try/catch. It stopped being survivable once `beginWorkspaceScopedRead` put it
// on ASYNC CONTINUATIONS: a late `isStillCurrent(...)` that throws does not
// surface as a handled error but as an unhandled rejection from whatever promise
// happened to be settling — which, in CI, killed the web suite with
// `TypeError: Cannot read properties of undefined (reading 'canShareProjects')`
// AFTER all 555 files had passed, so every test was green and the process still
// exited 1.
//
// `permissions` is required on the contract, so an absent one means a partial or
// malformed context. That is a normal state to be asked about (a signed-out or
// still-resolving caller, or a partial fixture), and the honest answer is a
// distinct cache partition — never an exception.

import { describe, expect, it } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import {
  beginWorkspaceScopedRead,
  workspaceIdentityCacheKey,
} from '../../src/collab/useWorkspaceContext';

/** A context missing `permissions` entirely — the shape many fixtures build. */
const partial = { workspaceId: 'ws-1', workspaceMemberId: 'wm-1' } as unknown as
  WorkspaceCollabContext;

const complete = {
  workspaceId: 'ws-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canShareProjects: true, canWriteSyncedFiles: true },
} as unknown as WorkspaceCollabContext;

describe('workspaceIdentityCacheKey is total', () => {
  it('computes a key for a context with no permissions instead of throwing', () => {
    expect(() => workspaceIdentityCacheKey(partial)).not.toThrow();
    expect(typeof workspaceIdentityCacheKey(partial)).toBe('string');
  });

  it('keeps null, partial and complete contexts in distinct partitions', () => {
    const none = workspaceIdentityCacheKey(null);
    expect(none).toBe('none');
    expect(workspaceIdentityCacheKey(partial)).not.toBe(none);
    expect(workspaceIdentityCacheKey(partial)).not.toBe(workspaceIdentityCacheKey(complete));
  });

  // The path that actually broke CI: the guard runs long after the request, so
  // it must tolerate whatever context is current by then.
  it('lets a late commit-time guard compare a partial context without throwing', () => {
    const read = beginWorkspaceScopedRead(complete);
    expect(() => read.isStillCurrent(partial)).not.toThrow();
    expect(read.isStillCurrent(partial)).toBe(false);
    expect(read.isStillCurrent(complete)).toBe(true);

    const fromPartial = beginWorkspaceScopedRead(partial);
    expect(() => fromPartial.isStillCurrent(undefined)).not.toThrow();
    expect(fromPartial.isStillCurrent(partial)).toBe(true);
  });
});
