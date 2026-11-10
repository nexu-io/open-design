import { describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  canPublishPublicFile,
  publicFilePublishFailureKey,
} from '../src/collab/public-file-publish';

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    teamId: 'team-1',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
    ...overrides,
  };
}

describe('canPublishPublicFile', () => {
  it('allows a team workspace with a resolved member', () => {
    expect(canPublishPublicFile(context())).toBe(true);
  });

  // A personal workspace publishes under its OWN id. B's control-key auth path
  // stopped refusing non-team callers and now mints a principal whose teamId is
  // the workspace id, so the hub scopes a personal workspace as a partition of
  // one. The daemon's `publicFilePrincipal` applies the same rule; this is the
  // client half of that pair.
  it('allows a personal workspace with a resolved member', () => {
    expect(canPublishPublicFile(context({ workspaceType: 'personal' }))).toBe(true);
  });

  it('allows a personal workspace that carries no teamId at all', () => {
    const personal = context({ workspaceType: 'personal' });
    delete personal.teamId;
    expect(canPublishPublicFile(personal)).toBe(true);
  });

  // …but the gate is widened, not removed. Without a workspace there is no id
  // to publish under, and the daemon answers 409 WORKSPACE_IDENTITY_REQUIRED.
  it('refuses a signed-out / unresolved context', () => {
    expect(canPublishPublicFile(null)).toBe(false);
    expect(canPublishPublicFile(undefined)).toBe(false);
  });

  it('refuses a context whose member id has not resolved yet', () => {
    expect(canPublishPublicFile(context({ workspaceMemberId: '' }))).toBe(false);
    expect(canPublishPublicFile(context({ workspaceType: 'personal', workspaceMemberId: '' }))).toBe(false);
  });

  it('refuses a context whose workspace id has not resolved yet', () => {
    expect(canPublishPublicFile(context({ workspaceId: '' }))).toBe(false);
  });
});

describe('publicFilePublishFailureKey', () => {
  it('maps the workspace-identity refusal to its own explanation', () => {
    // Sign-in, NOT "switch to a team" — the gate is no longer team-scoped, and
    // the old copy sent personal users after a workspace they do not need.
    expect(publicFilePublishFailureKey(new Error('WORKSPACE_IDENTITY_REQUIRED'))).toBe(
      'fileViewer.publishFileRequiresWorkspace',
    );
  });

  it.each([
    ['network', undefined, 'fileViewer.publishFileUnconfirmed'],
    ['timeout', undefined, 'fileViewer.publishFileUnconfirmed'],
    ['not_signed_in', undefined, 'fileViewer.publishFileSignInRequired'],
    ['upstream_http', 401, 'fileViewer.publishFileSignInRequired'],
    ['upstream_http', 403, 'fileViewer.publishFileAccessDenied'],
    ['upstream_http', 409, 'fileViewer.publishFileServiceRejected'],
    ['upstream_http', 503, 'fileViewer.publishFileServiceRejected'],
    ['session_setup', undefined, 'fileViewer.publishFileLocalSessionFailed'],
    ['cli_missing', undefined, 'fileViewer.publishFileLocalSessionFailed'],
    ['session_cleanup', undefined, 'fileViewer.publishFileUnconfirmed'],
    ['invalid_receipt', undefined, 'fileViewer.publishFileUnconfirmed'],
    ['unknown', undefined, 'fileViewer.publishFileUnconfirmed'],
  ])('maps safe snapshot reason %s / %s to its own explanation', (reason, upstreamStatus, key) => {
    const error = Object.assign(new Error('PUBLIC_FILE_PUBLISH_UNAVAILABLE'), {
      failure: { stage: 'snapshot', reason, upstreamStatus },
    });
    expect(publicFilePublishFailureKey(error)).toBe(key);
  });

  it.each([
    ['public_share_too_large', 413, 'fileViewer.publishFileTooLarge'],
    ['manifest_blobs_missing', 409, 'fileViewer.publishFileContentUnavailable'],
    ['public_upload_expired', 409, 'fileViewer.publishFileConflict'],
    ['workspace_subscription_locked', 403, 'fileViewer.publishFileWorkspaceLocked'],
  ])('maps server detail %s before generic status', (upstreamCode, upstreamStatus, expected) => {
    expect(publicFilePublishFailureKey({failure: {stage: 'push',reason:'upstream_http',upstreamCode,upstreamStatus}})).toBe(expected);
  });

  it('does not infer a network error from unknown or malformed detail', () => {
    expect(publicFilePublishFailureKey({ failure: { stage: 'push', reason: 'unknown' } })).toBe('fileViewer.publishFileFailed');
    expect(publicFilePublishFailureKey({ failure: { stage: 'snapshot', reason: 'private text' } })).toBe('fileViewer.publishFileFailed');
  });

  it('falls back to a generic failure for anything else', () => {
    expect(publicFilePublishFailureKey(new Error('PUBLIC_FILE_URL_UNAVAILABLE'))).toBe(
      'fileViewer.publishFileFailed',
    );
    expect(publicFilePublishFailureKey(null)).toBe('fileViewer.publishFileFailed');
  });
});
