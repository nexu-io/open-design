import { describe, expect, it } from 'vitest';
import type {
  WorkspaceCollabContext,
  WorkspaceInviteAcceptResponse,
} from '@open-design/contracts';
import {
  clearPendingInviteContinuation,
  deriveWorkspaceActivation,
  evaluateAccountMatch,
  markPendingInviteContinuation,
  pendingContinuationFromAccept,
  readPendingInviteContinuation,
  readWorkspaceActivation,
  writePendingInviteContinuation,
  writeWorkspaceActivation,
  type KeyValueStorage,
  type LocalPendingInviteContinuation,
} from '../src/collab/invite-continuation';

function memStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-7',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team',
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
    ...overrides,
  };
}

function acceptResponse(overrides: Partial<WorkspaceInviteAcceptResponse> = {}): WorkspaceInviteAcceptResponse {
  return {
    workspaceId: 'ws-1',
    workspaceMemberId: 'wm-7',
    memberId: 'mem-7',
    inviteId: 'inv-42',
    role: 'member',
    lifecycleState: 'active',
    continuation: {
      nonce: 'nonce-abc',
      deeplinkUrl:
        'opendesign://workspace/invite/continue?workspace_id=ws-1&member_id=mem-7&invite_id=inv-42&nonce=nonce-abc',
      expiresAt: 10_000,
      fallbackDownloadUrl: 'https://open-design.example/download',
    },
    currentWorkspaceContext: context(),
    ...overrides,
  };
}

describe('pending continuation storage', () => {
  it('round-trips a pending continuation and never stores the raw token', () => {
    const storage = memStorage();
    const entry = pendingContinuationFromAccept(acceptResponse());
    expect(entry.status).toBe('pending');
    expect(entry.nonce).toBe('nonce-abc');
    writePendingInviteContinuation(entry, storage);

    const read = readPendingInviteContinuation(storage, 1_000);
    expect(read).toEqual(entry);
    // The serialized blob must not contain the raw invite token.
    const blob = storage.map.get('od.collab.pendingInviteContinuation') ?? '';
    expect(blob).not.toContain('token');
  });

  it('drops an expired continuation on read', () => {
    const storage = memStorage();
    writePendingInviteContinuation(pendingContinuationFromAccept(acceptResponse()), storage);
    // expiresAt is 10_000; reading at 10_000 (or later) is expired.
    expect(readPendingInviteContinuation(storage, 10_000)).toBeNull();
    expect(storage.map.has('od.collab.pendingInviteContinuation')).toBe(false);
  });

  it('drops a malformed continuation and self-heals', () => {
    const storage = memStorage();
    storage.map.set('od.collab.pendingInviteContinuation', '{ not json');
    expect(readPendingInviteContinuation(storage, 0)).toBeNull();
    storage.map.set('od.collab.pendingInviteContinuation', JSON.stringify({ nonce: 'x' }));
    expect(readPendingInviteContinuation(storage, 0)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('replaces a prior continuation (single slot)', () => {
    const storage = memStorage();
    writePendingInviteContinuation(pendingContinuationFromAccept(acceptResponse()), storage);
    const next = pendingContinuationFromAccept(
      acceptResponse({
        inviteId: 'inv-99',
        continuation: {
          nonce: 'nonce-xyz',
          deeplinkUrl: 'opendesign://workspace/invite/continue?workspace_id=ws-1&member_id=mem-7&invite_id=inv-99&nonce=nonce-xyz',
          expiresAt: 20_000,
          fallbackDownloadUrl: 'https://open-design.example/download',
        },
      }),
    );
    writePendingInviteContinuation(next, storage);
    const read = readPendingInviteContinuation(storage, 1_000);
    expect(read?.inviteId).toBe('inv-99');
    expect(read?.nonce).toBe('nonce-xyz');
  });

  it('marks status transitions with an attempt timestamp', () => {
    const storage = memStorage();
    writePendingInviteContinuation(pendingContinuationFromAccept(acceptResponse()), storage);
    const opened = markPendingInviteContinuation('opened', 1_500, storage);
    expect(opened?.status).toBe('opened');
    expect(opened?.lastAttemptAt).toBe(1_500);
    const failed = markPendingInviteContinuation('failed', 2_000, storage);
    expect(failed?.status).toBe('failed');
    expect(readPendingInviteContinuation(storage, 3_000)?.status).toBe('failed');
  });

  it('mark returns null when there is nothing to update', () => {
    const storage = memStorage();
    expect(markPendingInviteContinuation('opened', 1, storage)).toBeNull();
  });

  it('clears the continuation', () => {
    const storage = memStorage();
    writePendingInviteContinuation(pendingContinuationFromAccept(acceptResponse()), storage);
    clearPendingInviteContinuation(storage);
    expect(readPendingInviteContinuation(storage, 0)).toBeNull();
  });
});

describe('deriveWorkspaceActivation', () => {
  it('derives the activation verbatim from the accept response context', () => {
    const res = acceptResponse({
      currentWorkspaceContext: context({ role: 'admin', lifecycleState: 'billing_past_due' }),
    });
    const activation = deriveWorkspaceActivation(res.currentWorkspaceContext, 5_000);
    expect(activation).toEqual({
      workspaceId: 'ws-1',
      workspaceMemberId: 'wm-7',
      role: 'admin',
      memberStatus: 'active',
      lifecycleState: 'billing_past_due',
      activatedAt: 5_000,
    });
  });

  it('persists and reads back the activation', () => {
    const storage = memStorage();
    const activation = deriveWorkspaceActivation(context(), 5_000);
    writeWorkspaceActivation(activation, storage);
    expect(readWorkspaceActivation(storage)).toEqual(activation);
  });
});

describe('evaluateAccountMatch', () => {
  it('is unknown when signed out or the email is unparseable', () => {
    expect(evaluateAccountMatch(null, 'j***@company.com')).toBe('unknown');
    expect(evaluateAccountMatch('', 'j***@company.com')).toBe('unknown');
    expect(evaluateAccountMatch('not-an-email', 'j***@company.com')).toBe('unknown');
    expect(evaluateAccountMatch('user@company.com', 'no-at-sign')).toBe('unknown');
  });

  it('matches when the domain and visible prefix line up', () => {
    expect(evaluateAccountMatch('john@company.com', 'j***@company.com')).toBe('match');
    expect(evaluateAccountMatch('John@Company.com', 'j***@company.com')).toBe('match');
    expect(evaluateAccountMatch('jordan@company.com', 'j***n@company.com')).toBe('match');
  });

  it('flags a different domain as a mismatch', () => {
    expect(evaluateAccountMatch('john@personal.com', 'j***@company.com')).toBe('mismatch');
  });

  it('flags a different visible local segment as a mismatch', () => {
    expect(evaluateAccountMatch('mary@company.com', 'j***@company.com')).toBe('mismatch');
    expect(evaluateAccountMatch('john@company.com', 'j***y@company.com')).toBe('mismatch');
  });

  it('requires an exact local part when nothing is masked', () => {
    expect(evaluateAccountMatch('john@company.com', 'john@company.com')).toBe('match');
    expect(evaluateAccountMatch('johnny@company.com', 'john@company.com')).toBe('mismatch');
  });

  it('falls back to a domain-only match for a fully masked local part', () => {
    expect(evaluateAccountMatch('anyone@company.com', '***@company.com')).toBe('match');
    expect(evaluateAccountMatch('anyone@other.com', '***@company.com')).toBe('mismatch');
  });
});
