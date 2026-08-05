import { describe, expect, it } from 'vitest';
import {
  assertTeamResourceCopyAllowed,
  evaluateTeamResourceCopy,
  WORKSPACE_INVALIDATION_EVENTS,
  type TeamResourcesChangedSsePayload,
  TeamResourceCopyForbiddenError,
} from '../src/index.js';

describe('evaluateTeamResourceCopy (AC-9 copy red-line)', () => {
  it('allows copying a personal resource regardless of state', () => {
    expect(evaluateTeamResourceCopy({ scope: 'personal' }).allowed).toBe(true);
    expect(evaluateTeamResourceCopy({ scope: 'personal', state: 'frozen' }).allowed).toBe(true);
  });

  it('allows copying an active team resource', () => {
    expect(evaluateTeamResourceCopy({ scope: 'team', state: 'active' }).allowed).toBe(true);
    // Missing state on a team resource is treated as active (permissive default).
    expect(evaluateTeamResourceCopy({ scope: 'team' }).allowed).toBe(true);
  });

  it('blocks copying a frozen team resource with WORKSPACE_RESOURCE_FROZEN', () => {
    const decision = evaluateTeamResourceCopy({ scope: 'team', state: 'frozen' });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('WORKSPACE_RESOURCE_FROZEN');
  });

  it('blocks copying a deleted team resource with WORKSPACE_RESOURCE_DELETED', () => {
    const decision = evaluateTeamResourceCopy({ scope: 'team', state: 'deleted' });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('WORKSPACE_RESOURCE_DELETED');
  });
});

describe('assertTeamResourceCopyAllowed', () => {
  it('returns silently when the copy is allowed', () => {
    expect(() => assertTeamResourceCopyAllowed({ scope: 'team', state: 'active' })).not.toThrow();
    expect(() => assertTeamResourceCopyAllowed({ scope: 'personal' })).not.toThrow();
  });

  it('throws a coded error for a frozen team resource', () => {
    try {
      assertTeamResourceCopyAllowed({ scope: 'team', state: 'frozen' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TeamResourceCopyForbiddenError);
      expect((error as TeamResourceCopyForbiddenError).code).toBe('WORKSPACE_RESOURCE_FROZEN');
    }
  });

  it('throws a coded error for a deleted team resource', () => {
    try {
      assertTeamResourceCopyAllowed({ scope: 'team', state: 'deleted' });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as TeamResourceCopyForbiddenError).code).toBe('WORKSPACE_RESOURCE_DELETED');
    }
  });
});

describe('Team resource workspace invalidation contract', () => {
  it('exposes a thin team-resources-changed signal without resource state', () => {
    const payload: TeamResourcesChangedSsePayload = {
      type: 'team-resources-changed',
      resourceKind: 'skill',
      resourceId: 'skill-1',
      at: 123,
    };

    expect(WORKSPACE_INVALIDATION_EVENTS).toContain('team-resources-changed');
    expect(payload).toEqual({
      type: 'team-resources-changed',
      resourceKind: 'skill',
      resourceId: 'skill-1',
      at: 123,
    });
    expect(payload).not.toHaveProperty('resourceStatus');
  });
});
