// Fresh-install wipe guard (飞书 recvqzaDvUU6B3): the "unmaterialized
// shared-project placeholder" invariant.
//
// `ensureSharedProjectPlaceholder` (routes/collab-sync.ts) registers a minimal
// local `projects` row (named "共享项目") the moment someone opens a
// hub-shared project this daemon has no local copy of, so the project's other
// routes stop 404ing while a pull materializes real content. That row is a
// UI convenience — it is NOT content authority. On a daemon whose data root
// was wiped (uninstall + reinstall under the same signed-in owner), the
// placeholder is the ONLY local record of the owner's own shared project, its
// content directory is empty, and the hub still names this member as the
// project's single writer. Without this guard the collab publish watcher
// discovered that placeholder as an ordinary owned+shared local project and
// its initial-publish-on-first-watch pushed the EMPTY directory to the
// resource hub as a new published version — erasing the project's content and
// catalog display name for the whole team, one project after another as the
// owner opened them (reproduced live on the feature-test hub, 2026-07-27:
// both repro projects advanced to a head whose manifestDigest was
// sha256:e3b0c442… — the empty tree — ~13s after `/collab/status` first ran).
//
// Invariant: while a project's local record still carries the
// `sharedProjectPlaceholderAt` metadata stamp, this daemon must treat the
// local copy as NOT publishable — no publish watcher may attach to it and no
// scheduler-driven publish may run for it. The stamp is set when the
// placeholder is registered and cleared exactly once a pull has materialized
// real hub content locally (`markSharedProjectPlaceholder(projectId, false)`
// in the pull flow). Explicit share requests (`requestTeamShare`) are not
// gated: a share is a deliberate "publish my local state" action on a project
// the user created locally, which never carries the stamp.
//
// The stamp lives in the project row's metadata (same pattern as
// `teamMirrorRevokedAt`) so it survives daemon restarts — a placeholder left
// behind by a crashed/restarted daemon must stay unpublishable until it is
// actually materialized.

export const SHARED_PROJECT_PLACEHOLDER_METADATA_KEY = 'sharedProjectPlaceholderAt';

/** The `sharedProjectPlaceholderAt` stamp from a project's metadata, or null
 *  when the metadata does not mark an unmaterialized placeholder. */
export function sharedProjectPlaceholderStamp(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[
    SHARED_PROJECT_PLACEHOLDER_METADATA_KEY
  ];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Whether this local project record is still an unmaterialized shared-project
 * placeholder — i.e. local state that must never be published to the resource
 * hub (see module doc comment). Null/undefined (no local record at all) is
 * not a placeholder: it has nothing to publish either way, and the publish
 * paths already require a local record.
 */
export function isUnmaterializedSharedPlaceholder(
  project: { metadata?: unknown } | null | undefined,
): boolean {
  if (!project) return false;
  return sharedProjectPlaceholderStamp(project.metadata) != null;
}
