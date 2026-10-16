/**
 * Who may edit, delete, or send a preview comment to the agent.
 *
 * Lifted VERBATIM out of `FileViewer.tsx` so the decision has one testable
 * home. The behaviour here is exactly what shipped; the known defects in it
 * are documented below and covered by failing specs in
 * `comment-authority.test.ts`, so the fix is a small edit to a pure function
 * rather than surgery inside a 20k-line component.
 *
 * Original team-collab model (庆雨, 2026-07-09): only the author may EDIT
 * their own note; the author OR the project owner may delete it or send it to
 * the agent. The server enforces the same rules — this is the client half.
 */

export interface CommentAuthorityComment {
  /** The author's workspaceMemberId. Absent on legacy, off-team, and external rows. */
  authorMemberId?: string | undefined;
  /**
   * Which identity the author holds. `user` means a share-page commenter: an
   * account with no membership in this workspace, so `authorMemberId` is
   * absent for a reason that is NOT "legacy row".
   */
  authorKind?: 'member' | 'user' | undefined;
}

export interface CommentAuthorityContext {
  /** The viewer's presence identity; null off-team. */
  viewerMemberId: string | null;
  /** Whether cloud collaboration is active for this project. */
  collabEnabled: boolean;
  /** The collab-resolved project owner flag; fails closed until the poll confirms. */
  isProjectOwner: boolean;
}

/**
 * Does this comment belong to the viewer?
 *
 * ## Known defect 2 — an external comment reads as the owner's own
 *
 * A share-page commenter has no `authorMemberId`, so they fall into the
 * "no author" branch below. On a PERSONAL project `collabEnabled` is false,
 * which makes `!collabEnabled` true, so the branch answers "yes, yours" — and
 * a personal project being shared is exactly the case the share feature
 * creates. The viewer is then offered edit and delete on a stranger's comment.
 *
 * The missing distinction is `authorKind === 'user'`: an absent
 * `authorMemberId` used to mean only "legacy or off-team row", and now also
 * means "written by someone outside this workspace". Those two must not share
 * a branch.
 */
export function commentAuthoredByViewer(
  comment: CommentAuthorityComment | null | undefined,
  context: CommentAuthorityContext,
): boolean {
  // No persisted comment means this is the create flow: the draft belongs to
  // the current viewer, including a read-only member annotating someone
  // else's shared project.
  if (!comment) return true;
  // A share-page user is never a workspace member, even when its member id is
  // absent. Keep that explicit identity separate from legacy rows, whose
  // missing author data retains the historical fallback below.
  if (comment.authorKind === 'user') return false;

  const authorId = comment.authorMemberId ?? null;
  // A legacy shared comment without an author is deliberately owner-only.
  // Treating it as "mine" for every member made the client advertise a
  // destructive action the daemon must reject. Personal/unshared comments
  // retain their historical single-user behaviour.
  if (authorId == null) return !context.collabEnabled || context.isProjectOwner;
  return authorId === context.viewerMemberId;
}

/**
 * Is the viewer the project's owner?
 *
 * ## Known defect 3 — always false on a personal project
 *
 * `collab.isOwner` is resolved by the collab status poll, which does not run
 * for a personal project. The sole owner of a personal project therefore
 * reads as "not the owner", and the delete / send-to-agent affordances never
 * appear on their own project once it is shared.
 *
 * A personal project has exactly one writer, so the viewer IS its owner; the
 * flag needs a personal-project arm rather than deferring entirely to collab.
 */
export function viewerIsProjectOwner(context: CommentAuthorityContext): boolean {
  return !context.collabEnabled || context.isProjectOwner;
}

/** Only the author may edit their own note. */
export function canEditComment(
  comment: CommentAuthorityComment | null | undefined,
  context: CommentAuthorityContext,
): boolean {
  return commentAuthoredByViewer(comment, context);
}

/** The author OR the project owner may delete. */
export function canDeleteComment(
  comment: CommentAuthorityComment | null | undefined,
  context: CommentAuthorityContext,
): boolean {
  return commentAuthoredByViewer(comment, context) || viewerIsProjectOwner(context);
}

/** The author OR the project owner may send to the agent. */
export function canSendCommentToAgent(
  comment: CommentAuthorityComment | null | undefined,
  context: CommentAuthorityContext,
): boolean {
  return commentAuthoredByViewer(comment, context) || viewerIsProjectOwner(context);
}
