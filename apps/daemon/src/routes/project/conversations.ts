import type { Express } from 'express';
import { type ChatSessionMode } from '@open-design/contracts';
import { readAnalyticsContext } from '../../analytics.js';
import { backfillBrandExtractionTranscriptForProject } from '../../brands/index.js';
import type { RouteDeps } from '../../server-context.js';
import type { BoundWorkspaceResourceMutationGate } from '../../collab/workspace-resource-mutation.js';
import type { AuthorizeProjectRequest } from '../../collab/project-request-authority.js';
import { registerProjectCommentRoutes } from './comments.js';
import { cancelRunsOwnedBy } from './cancel-owned-runs.js';
import {
  deleteConversationAndRepairTeamCommentAnchor,
  isProjectCommentAnchorConversationId,
} from '../../db.js';

export interface RegisterProjectConversationRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'paths' | 'projectStore' | 'conversations' | 'ids' | 'telemetry' | 'appConfig' | 'agents'> {
  /**
   * Threaded straight through to `registerProjectCommentRoutes` — a comment
   * has no workspace binding of its own, so it borrows its PARENT PROJECT's
   * `enforceWorkspaceProjectMutation` gate (built once in
   * `registerProjectRoutes`, complete with the last-known-membership
   * cross-check) rather than re-deriving a weaker one here. See
   * `RegisterProjectCommentRoutesDeps` in `./comments.js`.
   */
  enforceWorkspaceProjectMutation?: BoundWorkspaceResourceMutationGate;
  authorizeProjectRequest?: AuthorizeProjectRequest;
  /**
   * Passed alongside `enforceWorkspaceProjectMutation` above — the gate calls
   * this to write the 401/403 response body when it denies a mutation. Kept
   * as its own field (rather than requiring the full `http` dep bag) so
   * fixtures that only exercise comment CRUD semantics, not workspace
   * isolation, are not forced to stub unrelated HTTP helpers.
   */
  sendApiError?: (res: any, status: number, code: string, message: string) => unknown;
}

function normalizeChatSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' || value === 'plan' ? value : 'design';
}

function isChatSessionMode(value: unknown): value is ChatSessionMode {
  return value === 'chat' || value === 'design' || value === 'plan';
}

export function registerProjectConversationRoutes(app: Express, ctx: RegisterProjectConversationRoutesDeps): void {
  const { db, design } = ctx;
  const { sendApiError } = ctx.http;
  const { getProject, updateProject } = ctx.projectStore;
  const {
    insertConversation,
    getConversation,
    listConversations,
    updateConversation,
    listMessages,
    upsertMessage,
  } = ctx.conversations;
  const { randomId } = ctx.ids;
  const { BRANDS_DIR, PROJECTS_DIR } = ctx.paths;
  const { readAppConfig } = ctx.appConfig;
  const { getAgentDef } = ctx.agents;
  // Production registration always injects the shared project authority gate.
  // The fallback preserves narrow unit fixtures whose in-memory projects have
  // no Workspace binding and do not construct the full server authority graph.
  const authorizeProjectRequest: AuthorizeProjectRequest =
    ctx.authorizeProjectRequest ?? (async () => true);
  const getRoutableConversation = (projectId: string, conversationId: string) => {
    if (isProjectCommentAnchorConversationId(conversationId)) return null;
    const conversation = getConversation(db, conversationId);
    return conversation?.projectId === projectId ? conversation : null;
  };

  // ---- Conversations --------------------------------------------------------

  app.get('/api/projects/:id/conversations', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    res.json({ conversations: listConversations(db, req.params.id) });
  });

  app.post('/api/projects/:id/conversations', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    if (!await authorizeProjectRequest(
      req,
      res,
      req.params.id,
      { mode: 'write', capability: 'writeFiles' },
    )) return;
    const { title, seedFromConversationId, forkAfterMessageId } = req.body || {};
    const now = Date.now();
    const hasExplicitSessionMode = Boolean(
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'sessionMode'),
    );
    if (hasExplicitSessionMode && !isChatSessionMode(req.body.sessionMode)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'sessionMode must be one of design, chat, or plan');
    }
    const requestedForkMessageId =
      typeof forkAfterMessageId === 'string' && forkAfterMessageId
        ? forkAfterMessageId
        : null;
    const sourceConversation =
      typeof seedFromConversationId === 'string' && seedFromConversationId
        ? getRoutableConversation(req.params.id, seedFromConversationId)
        : null;
    // Client-supplied fork snapshot. The chat "Fork" action sends the exact
    // messages the user is looking at (up to the fork point). We prefer it over
    // reading the source conversation from the DB so a fork point that was
    // never persisted — e.g. an assistant turn whose run errored / had its
    // connection reset before reaching the database — still forks instead of
    // 404ing on `forkAfterMessageId`.
    const clientSeedMessages = Array.isArray(req.body?.seedMessages)
      ? (req.body.seedMessages as any[]).filter(
          (message) => message && typeof message.role === 'string',
        )
      : null;
    let seedMessages: any[] = [];
    if (clientSeedMessages && clientSeedMessages.length > 0) {
      seedMessages = clientSeedMessages;
      if (requestedForkMessageId) {
        const forkIndex = seedMessages.findIndex(
          (message) => message.id === requestedForkMessageId,
        );
        if (forkIndex >= 0) {
          seedMessages = seedMessages.slice(0, forkIndex + 1);
        }
      }
    } else if (sourceConversation && sourceConversation.projectId === req.params.id) {
      seedMessages = listMessages(db, seedFromConversationId);
      if (requestedForkMessageId) {
        const forkIndex = seedMessages.findIndex((message) => message.id === requestedForkMessageId);
        if (forkIndex < 0) {
          return res.status(404).json({ error: 'fork message not found' });
        }
        seedMessages = seedMessages.slice(0, forkIndex + 1);
      }
    } else if (requestedForkMessageId) {
      return res.status(404).json({ error: 'fork source conversation not found' });
    }
    const sessionMode =
      hasExplicitSessionMode
        ? req.body.sessionMode
        : sourceConversation && sourceConversation.projectId === req.params.id
          ? normalizeChatSessionMode(sourceConversation.sessionMode)
          : 'design';
    const conv = insertConversation(db, {
      id: randomId(),
      projectId: req.params.id,
      title: typeof title === 'string' ? title.trim() || null : null,
      sessionMode,
      createdAt: now,
      updatedAt: now,
    });
    // Side Chat: inherit the source conversation's context by copying its
    // messages into the fresh conversation. Be defensive — a missing or
    // cross-project source id silently yields an empty conversation.
    if (conv && seedMessages.length > 0) {
      for (const m of seedMessages) {
        // Fresh id per copied message; upsertMessage assigns the next
        // position so role/content ordering is preserved. Drop the source's
        // run pointers (runId/runStatus/lastRunEventId): they belong to the
        // OTHER conversation's runs, and a copied still-`running` assistant
        // turn would otherwise render a perpetual spinner in the side chat.
        upsertMessage(db, conv.id, {
          ...m,
          id: randomId(),
          runId: undefined,
          runStatus: undefined,
          lastRunEventId: undefined,
        });
      }
    }
    res.json({ conversation: conv });
  });

  app.patch('/api/projects/:id/conversations/:cid', async (req, res) => {
    if (!await authorizeProjectRequest(
      req,
      res,
      req.params.id,
      { mode: 'write', capability: 'writeFiles' },
    )) return;
    const conv = getRoutableConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'not found' });
    }
    if (
      req.body &&
      Object.prototype.hasOwnProperty.call(req.body, 'sessionMode') &&
      !isChatSessionMode(req.body.sessionMode)
    ) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'sessionMode must be one of design, chat, or plan');
    }
    const updated = updateConversation(db, req.params.cid, req.body || {});
    res.json({ conversation: updated });
  });

  app.delete('/api/projects/:id/conversations/:cid', async (req, res) => {
    if (!await authorizeProjectRequest(
      req,
      res,
      req.params.id,
      { mode: 'write', capability: 'writeFiles' },
    )) return;
    const conv = getRoutableConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'not found' });
    }
    // Stop any live agent run for this conversation before the row is gone,
    // otherwise the CLI subprocess is orphaned and keeps billing (#5468).
    await cancelRunsOwnedBy(design.runs, { conversationId: req.params.cid });
    deleteConversationAndRepairTeamCommentAnchor(db, req.params.id, req.params.cid);
    res.json({ ok: true });
  });

  // ---- Messages -------------------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/messages', async (req, res) => {
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    const conv = getRoutableConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    const project = getProject(db, req.params.id);
    if (project && listMessages(db, req.params.cid).length === 0) {
      const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR).catch(() => ({}));
      const agentId = typeof config.agentId === 'string' && config.agentId ? config.agentId : null;
      await backfillBrandExtractionTranscriptForProject({
        db,
        conversationId: req.params.cid,
        randomId,
        brandsRoot: BRANDS_DIR,
        projectsRoot: PROJECTS_DIR,
        project,
        ...(agentId ? {
          transcriptAgent: {
            agentId,
            agentName: getAgentDef(agentId)?.name ?? agentId,
          },
        } : {}),
      }).catch((err) => {
        console.warn(`[brand] failed to backfill programmatic extraction transcript for ${req.params.id}`, err);
      });
    }
    res.json({ messages: listMessages(db, req.params.cid) });
  });

  app.put('/api/projects/:id/conversations/:cid/messages/:mid', async (req, res) => {
    if (!await authorizeProjectRequest(
      req,
      res,
      req.params.id,
      { mode: 'write', capability: 'writeFiles' },
    )) return;
    const conv = getRoutableConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    const m = req.body || {};
    if (m.id && m.id !== req.params.mid) {
      return res.status(400).json({ error: 'id mismatch' });
    }
    const saved = upsertMessage(db, req.params.cid, {
      ...m,
      id: req.params.mid,
    });
    // Bump the parent project's updatedAt so the project list re-orders.
    updateProject(db, req.params.id, {});
    ctx.telemetry?.reportFinalizedMessage(saved, m, {
      analyticsContext: readAnalyticsContext(req),
      projectId: req.params.id,
      conversationId: req.params.cid,
    });
    res.json({ message: saved });
  });

  registerProjectCommentRoutes(app, ctx);
}
