import { normalizeWorkspaceInviteCreateErrorCode } from '@open-design/contracts';
import type { Dict } from '../i18n/types';

// Single source of truth for "which sentence does the invite dialog show when a
// row comes back failed". Kept as a pure code → i18n-key function (not inline
// `switch`es next to `t(...)` calls) so the mapping is testable on its own and
// so a new B failure code has exactly one place to be taught.

/**
 * The i18n key describing WHY one invite row failed.
 *
 * The invariant: a failure the user can act on must name its actual reason, and
 * only a failure we genuinely do not understand may fall back to the
 * retry-later copy. Retrying is the wrong advice for every conflict in the
 * allowlist — an address that is already a member, or already holds a pending
 * invite, stays that way no matter how many times the user presses the button.
 *
 * B reports both duplicate conflicts as HTTP 409, so the body's `error` code is
 * the only thing that tells them apart; a bare 409 with no recognized code is
 * deliberately NOT read as a duplicate, because the same status also carries
 * seat and subscription conflicts (and codes this client has not learned yet).
 */
export function workspaceInviteErrorMessageKey(code: string | undefined): keyof Dict {
  switch (normalizeWorkspaceInviteCreateErrorCode(code)) {
    case 'already_member':
      return 'workspaceInvite.errorAlreadyMember';
    case 'active_pending_invite':
      return 'workspaceInvite.errorPendingInvite';
    case 'workspace_seat_limit_reached':
    case 'workspace_subscription_seat_allocation_unavailable':
      return 'workspaceInvite.seatsExhaustedBody';
  }
  switch (code) {
    case 'no_session':
      return 'workspaceInvite.errorNoSession';
    case 'no_workspace':
      return 'workspaceInvite.errorNoWorkspace';
    case 'create_unreachable':
      return 'workspaceInvite.errorUnreachable';
    default:
      return 'workspaceInvite.submitFailed';
  }
}
