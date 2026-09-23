import { describe, expect, it } from 'vitest';
import { workspaceInviteErrorMessageKey } from '../src/collab/invite-error-copy';
import { en } from '../src/i18n/locales/en';
import { zhCN } from '../src/i18n/locales/zh-CN';

// Red-spec for the V0.19.1 acceptance bug (record recvrovm9Bcyy0): inviting an
// address that is ALREADY an active member of the workspace showed the generic
// "invitation failed, try again later" copy, so the user could not tell that
// retrying would never help. B rejects that case with HTTP 409
// `{"error":"invite_existing_member"}`; before the fix that code was absent
// from the client's allowlist, degraded to the transport-shaped `create_409`,
// and fell through to the retry-later fallback.

describe('workspaceInviteErrorMessageKey', () => {
  it("names the reason when the address is already an active member (B's invite_existing_member)", () => {
    expect(workspaceInviteErrorMessageKey('invite_existing_member')).toBe(
      'workspaceInvite.errorAlreadyMember',
    );
  });

  it.each(['already_member', 'invite_existing_member'])(
    'maps the already-a-member code %s to member-specific copy',
    (code) => {
      expect(workspaceInviteErrorMessageKey(code)).toBe('workspaceInvite.errorAlreadyMember');
    },
  );

  it.each(['active_pending_invite', 'invite_duplicate'])(
    'maps the pending-invite code %s to invite-specific copy',
    (code) => {
      expect(workspaceInviteErrorMessageKey(code)).toBe('workspaceInvite.errorPendingInvite');
    },
  );

  it('keeps the two 409 duplicate variants distinguishable to the user', () => {
    const member = workspaceInviteErrorMessageKey('invite_existing_member');
    const pending = workspaceInviteErrorMessageKey('invite_duplicate');
    expect(member).not.toBe(pending);
    for (const dict of [en, zhCN]) {
      expect(dict[member]).not.toBe(dict[pending]);
      // Neither reason may reuse the retry-later sentence — retrying cannot
      // resolve either conflict.
      expect(dict[member]).not.toBe(dict['workspaceInvite.submitFailed']);
      expect(dict[pending]).not.toBe(dict['workspaceInvite.submitFailed']);
    }
  });

  it.each([
    'workspace_seat_limit_reached',
    'workspace_subscription_seat_allocation_unavailable',
  ])('routes the seat conflict %s to the seats copy', (code) => {
    expect(workspaceInviteErrorMessageKey(code)).toBe('workspaceInvite.seatsExhaustedBody');
  });

  it.each([
    ['no_session', 'workspaceInvite.errorNoSession'],
    ['no_workspace', 'workspaceInvite.errorNoWorkspace'],
    ['create_unreachable', 'workspaceInvite.errorUnreachable'],
  ])('keeps the transport/session outcome %s on its own copy', (code, key) => {
    expect(workspaceInviteErrorMessageKey(code)).toBe(key);
  });

  it.each([undefined, 'create_409', 'create_500', 'some_future_b_code'])(
    'falls back to the generic retry copy for the unrecognized code %s',
    (code) => {
      expect(workspaceInviteErrorMessageKey(code)).toBe('workspaceInvite.submitFailed');
    },
  );
});
