import {
  PUBLIC_FILE_MANUAL_REVOKE_REQUIRED,
  workspaceContextHasWorkspaceIdentity,
  type PublicFileManualRevokeRequiredData,
  type PublicProjectFilePublication,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

export class PublicFilePublishError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly data?: PublicFileManualRevokeRequiredData,
  ) {
    super(message);
    this.name = 'PublicFilePublishError';
  }
}

export function publicFileManualRevokePublication(
  error: unknown,
): PublicProjectFilePublication | null {
  if (
    !(error instanceof PublicFilePublishError)
    || error.code !== PUBLIC_FILE_MANUAL_REVOKE_REQUIRED
    || !error.data
  ) {
    return null;
  }
  return {
    url: error.data.url,
    slug: error.data.slug,
    fileName: error.data.fileName,
  };
}

/**
 * Whether the public single-file "Publish" entry point may be rendered.
 *
 * The rule is A WORKSPACE, not a TEAM workspace.
 *
 * This gate was briefly `workspaceContextHasTeamIdentity`, on the premise that a
 * public link is a resource-hub snapshot keyed by `teamId` and a personal
 * session therefore had nothing to publish under. That premise no longer holds:
 * B stopped refusing a personal workspace on its control-key auth path and now
 * mints a principal whose `teamId` IS the workspace id — a partition of one —
 * while its access check only ever compares that id against the resource's own.
 * A personal workspace addresses its own resource plane exactly as well as a
 * team does.
 *
 * What still fails, and therefore still gates, is a session with NO workspace at
 * all: signed out, or a context read that came back empty. Such a caller has no
 * id to publish under and no member id to own the resource with, and the daemon
 * answers it 409 `WORKSPACE_IDENTITY_REQUIRED`.
 *
 * This must stay the same predicate the daemon applies (`publicFilePrincipal` in
 * apps/daemon/src/routes/collab-sync.ts) — rendering a button where the daemon
 * returns 409 is the exact failure this pair exists to prevent. Both are
 * deliberately narrow: team PROJECT SHARING still requires a real team, because
 * a shared project needs teammates to share it with.
 */
export function canPublishPublicFile(
  context: WorkspaceCollabContext | null | undefined,
): boolean {
  return workspaceContextHasWorkspaceIdentity(context);
}

/** Dict keys this module may return; keeps the i18n contract explicit. */
export type PublicFilePublishFailureKey =
  | 'fileViewer.publishFileRequiresWorkspace'
  | 'fileViewer.publishFileFailed';

/**
 * Map a publish/unpublish failure to the message key the user should read.
 *
 * The daemon answers with an error CODE, which must never reach the screen. The
 * one code worth its own sentence is `WORKSPACE_IDENTITY_REQUIRED`: it is
 * reachable even with the entry point gated, because a workspace context read
 * can fail transiently (offline, hub hiccup, billing/seat state in flux) and the
 * UI then falls back to the last-known context. Telling that user "your
 * workspace identity could not be confirmed" is actionable; "Publish failed" is
 * not.
 *
 * The sentence must ask the user to SIGN IN, not to switch to a team — the gate
 * no longer has anything to do with teams, and the old copy sent personal users
 * chasing a workspace they did not need.
 */
export function publicFilePublishFailureKey(error: unknown): PublicFilePublishFailureKey {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('WORKSPACE_IDENTITY_REQUIRED')
    ? 'fileViewer.publishFileRequiresWorkspace'
    : 'fileViewer.publishFileFailed';
}
