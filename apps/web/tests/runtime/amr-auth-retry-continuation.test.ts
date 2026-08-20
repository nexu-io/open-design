import { describe, expect, it } from 'vitest';

import {
  AMR_AUTH_RETRY_CONTINUATION_TTL_MS,
  canConsumeAmrAuthRetryContinuation,
  routeStillMatchesAmrAuthRetryContinuation,
  type AmrAuthRetryContinuation,
} from '../../src/runtime/amr-auth-retry-continuation';

const pending: AmrAuthRetryContinuation = {
  projectId: 'project-a',
  conversationId: 'conversation-a',
  assistantId: 'assistant-a',
  workspaceIdentityKey: 'workspace-a:personal:member-a:owner:active:active:true:true',
  originMountId: 'mount-origin',
  accountIdAtArm: null,
  createdAtMs: 1_000,
};

const matchingCandidate = {
  projectId: pending.projectId,
  conversationId: pending.conversationId,
  assistantId: pending.assistantId,
  workspaceIdentityKey: pending.workspaceIdentityKey,
  mountId: 'mount-fresh',
  loggedInAccountId: 'account-a',
  nowMs: 1_001,
  originMountObservedSignedOut: false,
  personalAdoptionWitness: null,
};

const personalAdoptionWitness = {
  workspaceIdentityKey:
    'personal-a:personal:member-personal-a:owner:active:active:true:true',
  workspaceId: 'personal-a',
  workspaceMemberId: 'member-personal-a',
  workspaceType: 'personal' as const,
  memberStatus: 'active' as const,
};

describe('AMR auth retry continuation', () => {
  it('cannot be consumed by the ProjectView mount that armed it', () => {
    expect(canConsumeAmrAuthRetryContinuation(pending, {
      ...matchingCandidate,
      mountId: pending.originMountId,
    })).toBe(false);
  });

  it('is consumable once by a fresh mount with the exact failed turn and authority', () => {
    expect(canConsumeAmrAuthRetryContinuation(pending, matchingCandidate)).toBe(true);
  });

  it('allows a real none -> Personal adoption on the origin mount only after signed-out was observed', () => {
    const unbound = { ...pending, workspaceIdentityKey: 'none' };
    expect(canConsumeAmrAuthRetryContinuation(unbound, {
      ...matchingCandidate,
      workspaceIdentityKey: personalAdoptionWitness.workspaceIdentityKey,
      mountId: pending.originMountId,
      originMountObservedSignedOut: false,
      personalAdoptionWitness,
    })).toBe(false);
    expect(canConsumeAmrAuthRetryContinuation(unbound, {
      ...matchingCandidate,
      workspaceIdentityKey: personalAdoptionWitness.workspaceIdentityKey,
      mountId: pending.originMountId,
      originMountObservedSignedOut: true,
      personalAdoptionWitness,
    })).toBe(true);
  });

  it('rejects none -> none and none -> Team on the origin mount', () => {
    const unbound = { ...pending, workspaceIdentityKey: 'none' };
    expect(canConsumeAmrAuthRetryContinuation(unbound, {
      ...matchingCandidate,
      workspaceIdentityKey: 'none',
      mountId: pending.originMountId,
      originMountObservedSignedOut: true,
      personalAdoptionWitness: null,
    })).toBe(false);
    expect(canConsumeAmrAuthRetryContinuation(unbound, {
      ...matchingCandidate,
      workspaceIdentityKey: 'team-a:team:member-team-a:owner:active:active:true:true',
      mountId: pending.originMountId,
      originMountObservedSignedOut: true,
      personalAdoptionWitness: {
        ...personalAdoptionWitness,
        workspaceIdentityKey: 'team-a:team:member-team-a:owner:active:active:true:true',
        workspaceType: 'team',
      } as unknown as typeof personalAdoptionWitness,
    })).toBe(false);
  });

  it('rejects an unbound continuation on a fresh unbound mount', () => {
    const unbound = { ...pending, workspaceIdentityKey: 'none' };
    expect(canConsumeAmrAuthRetryContinuation(unbound, {
      ...matchingCandidate,
      workspaceIdentityKey: 'none',
      mountId: 'mount-fresh',
    })).toBe(false);
  });

  it('requires the same-mount Personal adoption to begin signed out', () => {
    expect(canConsumeAmrAuthRetryContinuation(
      {
        ...pending,
        workspaceIdentityKey: 'none',
        accountIdAtArm: 'account-a',
      },
      {
        ...matchingCandidate,
        workspaceIdentityKey: personalAdoptionWitness.workspaceIdentityKey,
        mountId: pending.originMountId,
        originMountObservedSignedOut: true,
        personalAdoptionWitness,
      },
    )).toBe(false);
  });

  it('keeps bound Workspace continuations fresh-mount-only after signed-out was observed', () => {
    expect(canConsumeAmrAuthRetryContinuation(pending, {
      ...matchingCandidate,
      mountId: pending.originMountId,
      originMountObservedSignedOut: true,
    })).toBe(false);
  });

  it('expires instead of retrying a stale failed turn', () => {
    expect(canConsumeAmrAuthRetryContinuation(pending, {
      ...matchingCandidate,
      nowMs: pending.createdAtMs + AMR_AUTH_RETRY_CONTINUATION_TTL_MS + 1,
    })).toBe(false);
  });

  it.each([
    ['projectId', 'project-b'],
    ['conversationId', 'conversation-b'],
    ['assistantId', 'assistant-b'],
    ['workspaceIdentityKey', 'workspace-b:team:member-b:admin:active:active:true:true'],
  ] as const)('rejects a %s mismatch', (field, value) => {
    expect(canConsumeAmrAuthRetryContinuation(pending, {
      ...matchingCandidate,
      [field]: value,
    })).toBe(false);
  });

  it('rejects signed-out candidates and account swaps when an account was known at arm time', () => {
    expect(canConsumeAmrAuthRetryContinuation(pending, {
      ...matchingCandidate,
      loggedInAccountId: null,
    })).toBe(false);
    expect(canConsumeAmrAuthRetryContinuation(
      { ...pending, accountIdAtArm: 'account-a' },
      { ...matchingCandidate, loggedInAccountId: 'account-b' },
    )).toBe(false);
  });

  it('keeps only the same project route and rejects explicit conversation changes', () => {
    expect(routeStillMatchesAmrAuthRetryContinuation(pending, {
      kind: 'project',
      projectId: pending.projectId,
      conversationId: null,
    })).toBe(true);
    expect(routeStillMatchesAmrAuthRetryContinuation(pending, {
      kind: 'project',
      projectId: pending.projectId,
      conversationId: pending.conversationId,
    })).toBe(true);
    expect(routeStillMatchesAmrAuthRetryContinuation(pending, {
      kind: 'project',
      projectId: pending.projectId,
      conversationId: 'conversation-b',
    })).toBe(false);
    expect(routeStillMatchesAmrAuthRetryContinuation(pending, {
      kind: 'home',
    })).toBe(false);
  });
});
