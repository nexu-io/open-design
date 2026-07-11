import type { Express, Request } from 'express';
import type { PreviewComment } from '@open-design/contracts';
import type { RouteDeps } from '../../server-context.js';

export interface RegisterProjectCommentRoutesDeps extends RouteDeps<'db' | 'projectStore' | 'conversations'> {
  /**
   * Resolve the CURRENT caller's workspaceMemberId from the request identity
   * (workspace context). Server-authoritative — used both to stamp the author on
   * a new/edited comment and to gate status/delete on the caller's identity.
   * Optional: off-team it returns undefined and comments are stored without an
   * author and no permission gating applies.
   */
  resolveAuthorMemberId?: (authorization: string | undefined) => Promise<string | undefined>;
  /**
   * Resolve a shared project's OWNER workspaceMemberId (server-authoritative,
   * from the team hub). Used to let the project owner delete / send-to-agent on
   * another member's comment. Null off-team / when the project is not shared.
   */
  resolveProjectOwnerMemberId?: (projectId: string) => Promise<string | null>;
  /**
   * Fired after a comment is created OR edited (body upsert), so the collab-cloud
   * service can push it to the cross-daemon relay (best-effort — a push failure
   * must not fail the local save). No-op off-team / when the collab cloud is
   * unconfigured.
   */
  onCommentCreated?: (comment: PreviewComment) => void;
  /**
   * Fired after a comment's status changes (the send-to-agent lifecycle), so the
   * new status propagates to other members. Best-effort.
   */
  onCommentUpdated?: (comment: PreviewComment) => void;
  /**
   * Fired after a comment is deleted, with the comment as it last existed, so a
   * tombstone can be pushed to the relay. Best-effort.
   */
  onCommentDeleted?: (comment: PreviewComment) => void;
}

export function registerProjectCommentRoutes(app: Express, ctx: RegisterProjectCommentRoutesDeps): void {
  const { db } = ctx;
  const { updateProject } = ctx.projectStore;
  const {
    getConversation,
    listPreviewComments,
    upsertPreviewComment,
    getPreviewComment,
    updatePreviewCommentStatus,
    updatePreviewCommentAnchor,
    deletePreviewComment,
  } = ctx.conversations;

  /** The caller's workspaceMemberId, or undefined off-team / personal mode. */
  async function resolveCaller(req: Request): Promise<string | undefined> {
    if (!ctx.resolveAuthorMemberId) return undefined;
    return ctx.resolveAuthorMemberId(req.headers.authorization);
  }

  /**
   * Server-authoritative permission gate for status change + delete. Both are
   * allowed for the comment's author and the project owner (owner drives
   * send-to-agent and may delete any comment). Degrades open only when the
   * comment itself has no author (legacy/personal comments). Authored shared
   * comments fail closed if the current caller cannot be resolved.
   */
  async function callerMayMutate(
    req: Request,
    projectId: string,
    comment: PreviewComment,
  ): Promise<boolean> {
    const author = comment.authorMemberId;
    if (!author) return true;
    const me = await resolveCaller(req);
    if (!me) return false;
    if (me === author) return true;
    if (ctx.resolveProjectOwnerMemberId) {
      const owner = await ctx.resolveProjectOwnerMemberId(projectId);
      if (owner && owner === me) return true;
    }
    return false;
  }

  // ---- Preview comments ----------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/comments', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    res.json({
      comments: listPreviewComments(db, req.params.id, req.params.cid),
    });
  });

  app.post('/api/projects/:id/conversations/:cid/comments', async (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    try {
      // Server-authoritative author: stamp the current member id so the stored
      // (and pushed) comment carries who wrote it, rather than trusting the body.
      // New comments do not use a natural element key; editing requires an id
      // and is author-only.
      const body = { ...(req.body || {}) };
      const authorMemberId = await resolveCaller(req);
      const requestedId = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '';
      if (requestedId) {
        const existing = getPreviewComment(
          db,
          req.params.id,
          req.params.cid,
          requestedId,
        ) as PreviewComment | null;
        if (!existing) {
          return res.status(404).json({ error: 'comment not found' });
        }
        const existingAuthor = existing.authorMemberId ?? null;
        if (existingAuthor) {
          if (!authorMemberId || existingAuthor !== authorMemberId) {
            return res.status(403).json({ error: 'not permitted' });
          }
          body.authorMemberId = existingAuthor;
        } else if (authorMemberId) {
          body.authorMemberId = authorMemberId;
        }
      } else if (authorMemberId) {
        body.authorMemberId = authorMemberId;
      }
      const comment = upsertPreviewComment(db, req.params.id, req.params.cid, body);
      updateProject(db, req.params.id, {});
      // Best-effort cross-daemon push; never fails the local save.
      if (comment) {
        try {
          ctx.onCommentCreated?.(comment as unknown as PreviewComment);
        } catch {
          /* push is best-effort */
        }
      }
      res.json({ comment });
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message || err) });
    }
  });

  app.patch(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    async (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        const existing = getPreviewComment(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
        ) as PreviewComment | null;
        if (!existing) return res.status(404).json({ error: 'comment not found' });
        // Status change is the send-to-agent lifecycle: allowed for the author
        // and the project owner, blocked for other members.
        if (!(await callerMayMutate(req, req.params.id, existing))) {
          return res.status(403).json({ error: 'not permitted' });
        }
        const comment = updatePreviewCommentStatus(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
          req.body?.status,
        );
        if (!comment)
          return res.status(404).json({ error: 'comment not found' });
        updateProject(db, req.params.id, {});
        try {
          ctx.onCommentUpdated?.(comment as unknown as PreviewComment);
        } catch {
          /* push is best-effort */
        }
        res.json({ comment });
      } catch (err: any) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  app.patch(
    '/api/projects/:id/conversations/:cid/comments/:commentId/anchor',
    (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        // Drift-ladder write-back: the client resolves anchor state each render
        // and reports it here. This is a per-daemon DERIVED read-back (each
        // daemon anchors against its own content), not a user edit or a synced
        // field — so it is neither permission-gated nor pushed to the relay, and
        // it does not bump updated_at.
        const comment = updatePreviewCommentAnchor(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
          req.body || {},
        );
        if (!comment) return res.status(404).json({ error: 'comment not found' });
        res.json({ comment });
      } catch (err: any) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  app.delete(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    async (req, res) => {
      const conv = getConversation(db, req.params.cid);
      if (!conv || conv.projectId !== req.params.id) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      // Load before deleting so we can gate on the author and build the tombstone.
      const existing = getPreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.params.commentId,
      ) as PreviewComment | null;
      if (!existing) return res.status(404).json({ error: 'comment not found' });
      // Delete is allowed for the comment's author and the project owner.
      if (!(await callerMayMutate(req, req.params.id, existing))) {
        return res.status(403).json({ error: 'not permitted' });
      }
      const ok = deletePreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.params.commentId,
      );
      if (!ok) return res.status(404).json({ error: 'comment not found' });
      updateProject(db, req.params.id, {});
      try {
        ctx.onCommentDeleted?.(existing);
      } catch {
        /* push is best-effort */
      }
      res.json({ ok: true });
    },
  );
}
