import type { Express } from 'express';
import { type ChatSessionMode } from '@open-design/contracts';
import { readAnalyticsContext } from '../../analytics.js';
import { nextForkedConversationTitle } from '../../conversation-fork-title.js';
import { backfillBrandExtractionTranscriptForProject } from '../../brands/index.js';
import type { RouteDeps } from '../../server-context.js';
import type { BoundWorkspaceResourceMutationGate } from '../../collab/workspace-resource-mutation.js';
import type { AuthorizeProjectRequest } from '../../collab/project-request-authority.js';
import { TERMINAL_RUN_STATUSES } from '../../runtimes/runs.js';
import { strategyTaskTurnsForRunIds } from '../../strategies/task-store.js';

import { registerProjectCommentRoutes } from './comments.js';
import { cancelRunsOwnedBy } from './cancel-owned-runs.js';
import {
  compactAdjacentMessageAgentEvents,
  countMessages,
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

/**
 * 分叉复制一条消息时,这一轮**到底成没成**要跟着走;指向那次 run 的把手不跟着走。
 *
 * `runId` / `lastRunEventId` 是**指针** —— 重连、完成通知去重、SSE 续流都拿 runId
 * 认人,带到新会话就是给它挂了一个不属于它的把手,所以照旧摘掉。
 * `runStatus` 不是指针,是**结论**。丢掉它,前端就没有任何东西宣布这一轮结束了,
 * 只能回退到「从事件里猜」(`AssistantMessage.legacyTurnFailed`):那条判据看到任何
 * 一条报错的 `tool_result` 就判整轮失败。于是一轮明明成功、只是中途某个工具报过错的
 * 回答,分叉之后壳头变成红色的「运行失败」(真机 2026-08-27,那一次是
 * `desktop renderer unavailable`)—— 把「不知道」显示成了「失败」。
 *
 * 只带**终态**:`queued` / `running` 说的是「源会话此刻还在跑」,那是活的运行状态,
 * 复制过来会让新会话里那一条永远转圈(原注释担心的正是这个),所以仍然不带。
 */
function settledForkVerdict(status: unknown): string | undefined {
  return typeof status === 'string' && TERMINAL_RUN_STATUSES.has(status) ? status : undefined;
}

/**
 * The `done_key` a Run stamps on its own assistant row, if it has one.
 *
 * Each physical Run mints exactly one key (`mintRunDoneKey`, emitted as the
 * `done_key` agent event before any model output), so the FIRST key in a row's
 * event list is that row's Run identity. Later keys in the same list are not
 * identity — they are the damage this guard exists to stop — which is why only
 * the first one counts.
 */
function ownDoneKeyOfPersistedEvents(events: unknown): string | null {
  if (!Array.isArray(events)) return null;
  for (const event of events) {
    if (
      event
      && typeof event === 'object'
      && (event as Record<string, unknown>).kind === 'done_key'
    ) {
      const key = (event as Record<string, unknown>).key;
      if (typeof key === 'string' && key) return key;
    }
  }
  return null;
}

/**
 * True when an incoming message payload carries the stream of a Run that
 * already owns a DIFFERENT assistant row in this conversation.
 *
 * A daemon-backed assistant row holds the stream of exactly one physical Run.
 * One logical OD Next turn, though, spans several Runs — the daemon gives each
 * its own row (`odnext_assistant_<hash>` for an automatic continuation) while
 * the client renders them as one turn and keeps appending the successor's
 * stream into the message object already on screen, which is the PREDECESSOR's
 * row. Persisting that folded copy stores the successor's answer twice, and a
 * freshly opened project then renders the conclusion two times.
 *
 * The claim-keyed check above (`incoming.runId !== stored.runId`) misses this
 * whenever the client sends the row's own `runId` — which is exactly what it
 * holds after a conversation refresh hands the server's `runId` and terminal
 * `runStatus` back to a message the stream is still writing into. So this test
 * is keyed on the PAYLOAD instead: a sibling row's own `done_key` appearing in
 * this row's events can only mean the client folded that sibling's Run in.
 *
 * Retries are unaffected: a re-driven attempt keeps the same Run — and
 * therefore the same key — on the same row.
 */
function payloadCarriesAnotherRowsRunStream(
  incomingEvents: unknown,
  siblingRunDoneKeys: ReadonlySet<string>,
): boolean {
  if (!Array.isArray(incomingEvents) || siblingRunDoneKeys.size === 0) return false;
  return incomingEvents.some((event) =>
    event
    && typeof event === 'object'
    && (event as Record<string, unknown>).kind === 'done_key'
    && typeof (event as Record<string, unknown>).key === 'string'
    && siblingRunDoneKeys.has((event as Record<string, unknown>).key as string),
  );
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
    const explicitTitle = typeof title === 'string' ? title.trim() || null : null;
    /*
     * 从一条回复新开的会话由 **daemon** 起名(「{源标题} (n)」,见
     * `../../conversation-fork-title.js`)。编号要唯一就得先看一眼这个项目里已有
     * 哪些标题,而那份名单只有这里是权威的 —— 客户端手上的是可能过期的快照,
     * 两个客户端各算各的必然撞号。
     *
     * 「读名单 → 算号 → 落库」这三步中间**一个 await 都没有**,better-sqlite3 又是
     * 同步的,所以同进程内它就是原子的:同一秒连点两下拿到的是 (1) 和 (2)。
     * 在这中间插入任何异步调用都会把这个性质弄没。
     *
     * 客户端显式传了标题就照传的来 —— 重命名、导入这些「我知道我要叫什么」的
     * 调用点不该被编号盖掉。
     */
    const resolvedTitle =
      explicitTitle
      ?? (sourceConversation
        ? nextForkedConversationTitle(
            sourceConversation.title,
            listConversations(db, req.params.id).map(
              (existing: { title?: string | null }) => existing.title,
            ),
          )
        : null);
    const conv = insertConversation(db, {
      id: randomId(),
      projectId: req.params.id,
      title: resolvedTitle,
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
      /*
       * 分叉分界线落在**新会话**里,盖在带过来的最后一条上(交付稿第 38 格)。
       *
       * 为什么是新会话而不是源会话:点完分叉页面就跳到新会话,人此刻站在这里。
       * 那行脚注写的是「上文已带过来,接着说就行」—— 这句只有对着**新会话**里
       * 那一截复制过来的上下文说才成立;盖在源会话上等于对着原地没动的人说
       * 「已经带过来了」。标题用**源会话**的标题:这条线回答的是「上面这些是从哪来的」。
       *
       * 只盖最后一条:线是那一截上下文的**下边界**,中间每条都盖就成了一堆线。
       */
      const boundaryAt = seedMessages.length - 1;
      const inheritedTitle =
        (typeof sourceConversation?.title === 'string' && sourceConversation.title.trim())
          ? sourceConversation.title.trim()
          : null;
      seedMessages.forEach((m, index) => {
        // Fresh id per copied message; upsertMessage assigns the next
        // position so role/content ordering is preserved. Drop the source's
        // run pointers (runId/lastRunEventId) but keep each turn's verdict —
        // see `settledForkVerdict`.
        upsertMessage(db, conv.id, {
          ...m,
          id: randomId(),
          runId: undefined,
          runStatus: settledForkVerdict(m.runStatus),
          lastRunEventId: undefined,
          /* 拿不到源标题就不盖 —— 没有标题的分界线是两条发丝线夹一行空白 */
          forkedInto:
            index === boundaryAt && inheritedTitle && seedFromConversationId
              ? { title: inheritedTitle, conversationId: seedFromConversationId }
              : undefined,
        });
      });
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
    // COUNT(*) rather than listMessages(...).length: the backfill only needs to
    // know whether the conversation is empty, and loading every message to
    // answer that parses each one's JSON columns — including event logs that
    // grow with tool output — before throwing the result away.
    if (project && countMessages(db, req.params.cid) === 0) {
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
    // A Full Plan turn spans several physical Runs and the daemon-issued
    // continuation carries no user prompt, so the client needs each message's
    // logical-task position to render one turn instead of an orphan answer.
    const messages = listMessages(db, req.params.cid) as Array<Record<string, unknown>>;
    const turns = strategyTaskTurnsForRunIds(
      db,
      messages
        .map((message) => message['runId'])
        .filter((runId): runId is string => typeof runId === 'string' && runId.length > 0),
    );
    res.json({
      messages: messages.map((message) => {
        const runId = typeof message['runId'] === 'string' ? message['runId'] : null;
        const turn = runId ? turns.get(runId) : undefined;
        if (!turn) return message;
        return {
          ...message,
          strategyTaskExecutionId: turn.taskExecutionId,
          strategyTaskRunIndex: turn.taskRunIndex,
          ...(turn.delivered ? { strategyTaskDelivered: true } : {}),
        };
      }),
    });
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
  /**
   * The `done_key` every OTHER assistant row in this conversation was recorded
   * with — i.e. the Run identities this row must never be allowed to absorb.
   * Only each sibling's FIRST key counts (see `ownDoneKeyOfPersistedEvents`),
   * so an already-damaged sibling cannot re-export the key it absorbed.
   */
  const siblingRunDoneKeys = (
    conversationId: string,
    messageId: string,
  ): ReadonlySet<string> => {
    const rows = db
      .prepare(
        `SELECT events_json AS eventsJson
           FROM messages
          WHERE conversation_id = ?
            AND role = 'assistant'
            AND id <> ?
            AND events_json IS NOT NULL
            AND events_json LIKE '%"done_key"%'`,
      )
      .all(conversationId, messageId) as Array<{ eventsJson: string | null }>;
    const keys = new Set<string>();
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = row.eventsJson ? JSON.parse(row.eventsJson) : null;
      } catch {
        continue;
      }
      const key = ownDoneKeyOfPersistedEvents(parsed);
      if (key) keys.add(key);
    }
    return keys;
  };

  const mergeMessageWriteForDaemonBacked = (
    stored: ReturnType<typeof getMessage>,
    incoming: Record<string, unknown>,
    foreignRunDoneKeys: ReadonlySet<string>,
  ): Record<string, unknown> => {
    if (!stored || stored.role !== 'assistant' || !stored.runId) return incoming;
    // A payload that carries a sibling row's Run stream is a client-side fold of
    // one logical task's several physical Runs, not a fresher view of this row.
    // Keep the daemon's copy of every Run-owned field; client metadata still
    // lands. See `payloadCarriesAnotherRowsRunStream`.
    if (payloadCarriesAnotherRowsRunStream(incoming.events, foreignRunDoneKeys)) {
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
    // A create-only write claims the row exactly once. The client asking for
    // it owns a payload whose identity is decided before the send (an inline
    // question form's answer belongs to one occurrence), and it cannot make
    // "read, then write" atomic against a second tab. Refusing the overwrite
    // here — the one place the check and the write are the same operation —
    // keeps the first accepted answer authoritative, and returning the stored
    // row tells the loser what actually ran instead of leaving it showing an
    // answer no run ever saw.
    if (m.createOnly === true && existing !== null) {
      return res.json({ message: existing });
    }
    const normalizedMessage = Array.isArray(m.events)
      ? { ...m, events: compactAdjacentMessageAgentEvents(m.events) }
      : m;
    const saved = upsertMessage(db, req.params.cid, {
      ...mergeMessageWriteForDaemonBacked(
        existing,
        normalizedMessage,
        siblingRunDoneKeys(req.params.cid, req.params.mid),
      ),
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
