import type { Express } from 'express';
import { type ChatSessionMode } from '@open-design/contracts';
import { readAnalyticsContext } from '../../analytics.js';
import { backfillBrandExtractionTranscriptForProject } from '../../brands/index.js';
import type { RouteDeps } from '../../server-context.js';
import type { BoundWorkspaceResourceMutationGate } from '../../collab/workspace-resource-mutation.js';
import type { AuthorizeProjectRequest } from '../../collab/project-request-authority.js';
import { TERMINAL_RUN_STATUSES } from '../../runtimes/runs.js';

import { registerProjectCommentRoutes } from './comments.js';
import { cancelRunsOwnedBy } from './cancel-owned-runs.js';
import {
  compactAdjacentMessageAgentEvents,
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
    getMessage,
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
    // Keep accepting full snapshots from older clients. Current clients copy
    // persisted history first and retry with one compact fallback message only
    // when an in-memory fork point never reached the database.
    const clientSeedMessages = Array.isArray(req.body?.seedMessages)
      ? (req.body.seedMessages as any[]).filter(
          (message) => message && typeof message.role === 'string',
        )
      : null;
    const clientForkFallbackMessage =
      req.body?.forkFallbackMessage
      && typeof req.body.forkFallbackMessage.id === 'string'
      && typeof req.body.forkFallbackMessage.role === 'string'
      && typeof req.body.forkFallbackMessage.content === 'string'
        ? req.body.forkFallbackMessage
        : null;
    const rawForkFallbackPredecessorMessageId = req.body?.forkFallbackPredecessorMessageId;
    let clientForkFallbackPredecessorMessageId: string | null | undefined;
    if (rawForkFallbackPredecessorMessageId === null) {
      clientForkFallbackPredecessorMessageId = null;
    } else if (
      typeof rawForkFallbackPredecessorMessageId === 'string'
      && rawForkFallbackPredecessorMessageId
    ) {
      clientForkFallbackPredecessorMessageId = rawForkFallbackPredecessorMessageId;
    }
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
          if (clientForkFallbackMessage?.id !== requestedForkMessageId) {
            return res.status(404).json({ error: 'fork message not found' });
          }
          if (clientForkFallbackPredecessorMessageId === undefined) {
            return res.status(400).json({ error: 'fork fallback predecessor is required' });
          }
          if (clientForkFallbackPredecessorMessageId === null) {
            seedMessages = [];
          } else {
            const predecessorIndex = seedMessages.findIndex(
              (message) => message.id === clientForkFallbackPredecessorMessageId,
            );
            if (predecessorIndex < 0) {
              return res.status(404).json({ error: 'fork fallback predecessor not found' });
            }
            seedMessages = seedMessages.slice(0, predecessorIndex + 1);
          }
          seedMessages.push(clientForkFallbackMessage);
        } else {
          seedMessages = seedMessages.slice(0, forkIndex + 1);
        }
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
    // TODO(native-session-clone): Add a runtime-capability-gated adapter contract
    // that forks the source agent session at this exact message and persists the
    // clone's independent handle for `conv.id`. Never copy/reuse the source
    // `agent_sessions.session_id`, because branch turns could then advance the
    // original conversation. Unsupported runtimes, historical fork-point
    // mismatches, and clone failures must keep today's transcript-reseed path.
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

  // #6396: the daemon is the single writer of a daemon-backed assistant
  // message's run events / content / last-run-event id / run status. A stale
  // web-client snapshot (captured in memory before a reconnect or project
  // switch, then PUT after the daemon appended more events) must never regress
  // those fields — that's how the early `status:model` event got wiped.
  //
  // The guard is a "no regression" rule, not a blanket write-ownership rule,
  // and it has two independent triggers:
  //   1. Run events are append-only, so a stale snapshot can only SHRINK the
  //      stored list — preserve stored events/content when the incoming
  //      snapshot would drop already-persisted events.
  //   2. Terminal run status is a daemon-owned latch: the daemon writes it
  //      separately (no event appended), so a snapshot captured after the
  //      final event but before that write has the SAME event count yet still
  //      carries a non-terminal status. Never let it regress a terminal status.
  // Both paths also preserve the daemon-ownership marker (role + runId), since
  // a snapshot captured before `/api/runs` assigned a run id can omit `runId`
  // and would otherwise null `run_id` and drop the message back out of the
  // protected path on the next stale PUT.
  //
  // A web write that carries at least as many events and a non-regressing
  // status still flows through — which keeps mock-agent flows working (the
  // daemon never persisted events/status there, so the web is the legitimate
  // writer) and lets UI metadata (feedback, comment attachments, telemetry)
  // land on every PUT.
  const mergeMessageWriteForDaemonBacked = (
    stored: ReturnType<typeof getMessage>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> => {
    if (!stored || stored.role !== 'assistant' || !stored.runId) return incoming;
    // A delayed PUT from a superseded run generation (incoming.runId differs
    // from the stored, current run — e.g. an old attempt's snapshot landing
    // after a retry pinned run B) must not repopulate the current run's data.
    // Keep the stored run fields; metadata/feedback from the incoming snapshot
    // still land (nettee P2 on #6418).
    if (typeof incoming.runId === 'string' && incoming.runId !== stored.runId) {
      return {
        ...incoming,
        role: stored.role,
        runId: stored.runId,
        runStatus: stored.runStatus,
        events: stored.events ?? [],
        content: stored.content ?? '',
        lastRunEventId: stored.lastRunEventId,
        startedAt: stored.startedAt,
        endedAt: stored.endedAt,
      };
    }
    const incomingEvents = Array.isArray(incoming.events) ? incoming.events : [];
    const shrinksEvents =
      Boolean(stored.events) &&
      stored.events!.length > 0 &&
      incomingEvents.length < stored.events!.length;
    const incomingStatus =
      typeof incoming.runStatus === 'string' ? incoming.runStatus : null;
    const regressesTerminalStatus =
      stored.runStatus !== undefined &&
      TERMINAL_RUN_STATUSES.has(stored.runStatus) &&
      incomingStatus !== stored.runStatus;
    const daemonRun = stored.runId ? design.runs.get(stored.runId) : null;
    const daemonKnown = daemonRun !== null && daemonRun !== undefined;
    // After a same-run resume the stored row is non-terminal, so a terminal
    // `failed` snapshot may be a stale copy from BEFORE the resume. Accept it
    // only when the daemon confirms the run genuinely failed (it writes that
    // via reconcileAssistantMessageOnRunEnd); otherwise discard it so the
    // resumed run does not relatch the old failure (nettee on #6418).
    // Terminal-write arbitration across ALL client terminal statuses, keyed on
    // what the daemon positively knows (nettee 8/10 on #6418):
    //   1. Daemon has no record of the run (mock/client-owned row) -> the
    //      client is the writer; accept its terminal write.
    //   2. Daemon still owns the run and hasn't reached terminal -> the client
    //      write is a stale pre-terminal snapshot (or premature); preserve the
    //      daemon-owned fields so the row can't be latched wrong or reopened
    //      for a competing claim while the daemon is still writing.
    //   3. Daemon is terminal and disagrees with the client's terminal -> the
    //      daemon is authoritative (reconcileAssistantMessageOnRunEnd writes
    //      its outcome); preserve. Terminal agreement falls through.
    const incomingIsTerminal =
      incomingStatus !== null && TERMINAL_RUN_STATUSES.has(incomingStatus);
    // A stale whole-message PUT can omit `runStatus` entirely (which would
    // otherwise null the DB column), so arbitration must not depend on the
    // stored status being defined — a terminal snapshot against any
    // non-terminal (or status-less) stored row is keyed on what the daemon
    // positively knows (nettee 8/10 on #6418).
    const storedNonTerminal =
      stored.runStatus === undefined || !TERMINAL_RUN_STATUSES.has(stored.runStatus);
    if (incomingIsTerminal && storedNonTerminal) {
      const daemonTerminal =
        daemonKnown && TERMINAL_RUN_STATUSES.has(daemonRun!.status);
      if (!daemonKnown) {
        const incomingEndedAt =
          typeof incoming.endedAt === 'number' ? incoming.endedAt : null;
        const storedEndedAt =
          typeof stored.endedAt === 'number' ? stored.endedAt : null;
        return {
          ...incoming,
          role: stored.role,
          runId: stored.runId,
          runStatus: incomingStatus,
          events: incomingEvents,
          content:
            typeof incoming.content === 'string'
              ? incoming.content
              : stored.content ?? '',
          lastRunEventId: mergeLastRunEventId(
            stored.lastRunEventId,
            incoming.lastRunEventId,
          ),
          startedAt: stored.startedAt ?? incoming.startedAt,
          endedAt:
            incomingEndedAt !== null &&
            (storedEndedAt === null || incomingEndedAt >= storedEndedAt)
              ? incomingEndedAt
              : stored.endedAt,
        };
      }
      if (
        (daemonKnown && !daemonTerminal) ||
        (daemonKnown && daemonTerminal && incomingStatus !== daemonRun!.status)
      ) {
        return {
          ...incoming,
          role: stored.role,
          runId: stored.runId,
          runStatus: stored.runStatus,
          events: stored.events ?? [],
          content: stored.content ?? '',
          lastRunEventId: stored.lastRunEventId,
          startedAt: stored.startedAt,
          endedAt: stored.endedAt,
        };
      }
    }
    if (!shrinksEvents && !regressesTerminalStatus) {
      const storedEventCount = Array.isArray(stored.events) ? stored.events.length : 0;
      const eventsGrew = incomingEvents.length > storedEventCount;
      const incomingText = typeof incoming.content === 'string' ? incoming.content : null;
      const storedText = typeof stored.content === 'string' ? stored.content : null;
      const incomingTextIsStrictlyLonger =
        incomingText !== null &&
        (storedText === null || incomingText.length > storedText.length);
      const mergedRunStatus =
        daemonKnown &&
        stored.runStatus === 'running' &&
        incoming.runStatus === 'queued'
          ? stored.runStatus
          : incoming.runStatus ?? stored.runStatus;
      let mergedContent: string;
      if (daemonKnown) {
        mergedContent = incomingTextIsStrictlyLonger
          ? incomingText
          : storedText !== null && storedText.length > 0
            ? storedText
            : incomingText ?? storedText ?? '';
      } else {
        mergedContent =
          eventsGrew && incomingText !== null && incomingText.length > 0
            ? incomingText
            : storedText !== null && storedText.length > 0
              ? storedText
              : incomingText ?? storedText ?? '';
      }
      // A pinned-but-event-less daemon-backed row can still be hit by a stale
      // pre-run snapshot that omits `runId` (the web persisted the assistant
      // placeholder before /api/runs assigned ownership). Preserve the
      // daemon-ownership markers AND the pin-written start time so the row does
      // not drop out of the protected path or lose its lifecycle timestamps on
      // the next stale PUT (#6418 review). A same-message retry is handled at
      // pin time (pinAssistantMessageOnRunCreate resets the generation), so no
      // runId carve-out is needed here.
      return {
        ...incoming,
        role: stored.role,
        runId: stored.runId,
        content: mergedContent,
        // Preserve the stored run status when the snapshot omits it, and keep a
        // daemon-known running row from moving backward to a delayed queued PUT.
        runStatus: mergedRunStatus,
        lastRunEventId: mergeLastRunEventId(stored.lastRunEventId, incoming.lastRunEventId),
        startedAt: stored.startedAt ?? incoming.startedAt,
        // endedAt is a monotonic watermark: never regress the daemon's value.
        endedAt:
          typeof incoming.endedAt === 'number' &&
          (typeof stored.endedAt !== 'number' || incoming.endedAt >= stored.endedAt)
            ? incoming.endedAt
            : stored.endedAt,
      };
    }
    // Daemon-written lifecycle timestamps. startedAt is the daemon's first
    // start (COALESCE keeps it), so a stale snapshot must never regress it —
    // keep the stored value unconditionally. endedAt is a watermark that only
    // advances: a stale snapshot carrying an older endedAt — or omitting it —
    // must not regress the daemon's value, while a metadata update that
    // genuinely advances endedAt (e.g. the retry flow) still lands.
    const incomingEndedAt = typeof incoming.endedAt === 'number' ? incoming.endedAt : null;
    const storedEndedAt = typeof stored.endedAt === 'number' ? stored.endedAt : null;
    const mergedContent =
      typeof stored.content === 'string' && stored.content
        ? stored.content
        : incomingStatus === stored.runStatus && typeof incoming.content === 'string'
          ? incoming.content
          : stored.content ?? '';
    return {
      ...incoming,
      role: stored.role,
      runId: stored.runId,
      events: stored.events ?? [],
      content: mergedContent,
      lastRunEventId: stored.lastRunEventId,
      runStatus: stored.runStatus,
      startedAt: stored.startedAt,
      endedAt:
        incomingEndedAt !== null &&
        (storedEndedAt === null || incomingEndedAt >= storedEndedAt)
          ? incomingEndedAt
          : stored.endedAt,
    };
  };

  const parseRunEventCursor = (value: unknown): number | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const cursor = Number(value);
    return Number.isFinite(cursor) && cursor >= 0 ? cursor : null;
  };

  const mergeLastRunEventId = (
    stored: unknown,
    incoming: unknown,
  ): unknown => {
    if (incoming === null || incoming === undefined || incoming === '') return stored;
    if (stored === null || stored === undefined || stored === '') return incoming;
    const storedCursor = parseRunEventCursor(stored);
    const incomingCursor = parseRunEventCursor(incoming);
    if (storedCursor !== null && incomingCursor !== null) {
      return incomingCursor >= storedCursor ? incoming : stored;
    }
    return stored;
  };

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
    // Scope the stored lookup to the conversation authorized by the route. If a
    // message with this id exists in ANOTHER conversation, reject rather than
    // rewrite the wrong row through this endpoint (looper review on #6418).
    const existing = getMessage(db, req.params.mid, req.params.cid);
    if (existing === null && getMessage(db, req.params.mid) !== null) {
      return res.status(404).json({ error: 'message not found' });
    }
    const normalizedMessage = Array.isArray(m.events)
      ? { ...m, events: compactAdjacentMessageAgentEvents(m.events) }
      : m;
    const saved = upsertMessage(db, req.params.cid, {
      ...mergeMessageWriteForDaemonBacked(existing, normalizedMessage),
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
