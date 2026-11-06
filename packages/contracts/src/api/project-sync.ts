// Project sync contract for team-edition resource sharing. Describes whether a
// project's content is synced to the shared team store, and the intent events
// emitted when a project's visibility changes so the sync trigger can react.
// Dependency-free so any surface (daemon, web, CLI) can consume it.

/**
 * The sync state of a project's content.
 *
 * - `local_only`     — personal / not shared; never uploaded.
 * - `pending_upload` — a team share was requested; the upload is not yet
 *                      confirmed visible to other members.
 * - `synced`         — the published head is uploaded and members can pull it.
 * - `sync_failed`    — the last publish attempt failed; the prior head stands.
 */
export type ProjectSyncState = 'local_only' | 'pending_upload' | 'synced' | 'sync_failed';

/**
 * Sync-intent events emitted when a project's visibility changes, so the sync
 * trigger knows whether to publish the project's content for the team.
 *
 * - `project_visibility_changed`   — visibility flipped in either direction.
 * - `project_team_share_requested` — a project became team-visible; publish its
 *                                    content so members can pull it.
 * - `project_team_unshare_requested` — a project left the team space; remove it
 *                                      from the shared team index.
 */
export type ProjectSyncIntentEvent =
  | 'project_visibility_changed'
  | 'project_team_share_requested'
  | 'project_team_unshare_requested';

/**
 * Payload for a project sync-intent event. `workspaceId` is required: a
 * team-share transition must carry the workspace so the sync trigger can route
 * the publish to the correct team store — an intent without it is incomplete.
 */
export interface ProjectSyncIntent {
  event: ProjectSyncIntentEvent;
  projectId: string;
  /** The team workspace the visibility transition happened in. */
  workspaceId: string;
}
