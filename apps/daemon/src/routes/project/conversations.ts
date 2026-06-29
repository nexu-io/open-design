import type { Express } from 'express';
import { type ChatSessionMode } from '@open-design/contracts';
import { readAnalyticsContext } from '../../analytics.js';
import { backfillBrandExtractionTranscriptForProject } from '../../brands/index.js';
import type { RouteDeps } from '../../server-context.js';
import { registerProjectCommentRoutes } from './comments.js';

export interface RegisterProjectConversationRoutesDeps extends RouteDeps<'db' | 'paths' | 'projectStore' | 'conversations' | 'ids' | 'telemetry' | 'appConfig' | 'agents'> {}

function normalizeChatSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' ? 'chat' : 'design';
}

export function registerProjectConversationRoutes(app: Express, ctx: RegisterProjectConversationRoutesDeps): void {
  const { db } = ctx;
  const { getProject, updateProject } = ctx.projectStore;
  const {
    insertConversation,
    getConversation,
    listConversations,
    updateConversation,
    deleteConversation,
    listMessages,
    upsertMessage,
  } = ctx.conversations;
  const { randomId } = ctx.ids;
  const { BRANDS_DIR, PROJECTS_DIR } = ctx.paths;
  const { readAppConfig } = ctx.appConfig;
  const { getAgentDef } = ctx.agents;

  // ---- Conversations --------------------------------------------------------

  app.get('/api/projects/:id/conversations', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json({ conversations: listConversations(db, req.params.id) });
  });

  app.post('/api/projects/:id/conversations', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { title, seedFromConversationId, forkAfterMessageId } = req.body || {};
    const now = Date.now();
    const hasExplicitSessionMode = Boolean(
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'sessionMode'),
    );
    const requestedForkMessageId =
      typeof forkAfterMessageId === 'string' && forkAfterMessageId
        ? forkAfterMessageId
        : null;
    const sourceConversation =
      typeof seedFromConversationId === 'string' && seedFromConversationId
        ? getConversation(db, seedFromConversationId)
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
        ? normalizeChatSessionMode(req.body.sessionMode)
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

  app.patch('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    const updated = updateConversation(db, req.params.cid, req.body || {});
    res.json({ conversation: updated });
  });

  app.delete('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    deleteConversation(db, req.params.cid);
    res.json({ ok: true });
  });

  // ---- Messages -------------------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/messages', async (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
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

  app.put('/api/projects/:id/conversations/:cid/messages/:mid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
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
