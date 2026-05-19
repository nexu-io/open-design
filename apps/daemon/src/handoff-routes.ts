import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';

export interface RegisterHandoffRoutesDeps
  extends RouteDeps<
    'db' | 'http' | 'paths' | 'projectStore' | 'conversations' | 'validation' | 'handoff'
  > {}

/**
 * `POST /api/projects/:id/handoff` — synthesise a "first user message"
 * prompt the next conversation can send so a fresh chat can resume the
 * work without replaying the full transcript.
 *
 * Handoff is conversation-scoped: the request carries a `conversationId`
 * the route validates belongs to `:id` (404 CONVERSATION_NOT_FOUND
 * otherwise), and only that conversation's transcript is synthesized.
 *
 * The validation block and BYOK upstream call mirror
 * `import-export-routes.ts::registerFinalizeRoutes`. Error mapping is
 * largely shared but diverges deliberately: handoff maps
 * `TranscriptExportLockedError` to 409 CONFLICT (the transcript-export
 * lock is acquired transitively, not a handoff lockfile of its own),
 * maps `EmptyTranscriptError` to 400 EMPTY_TRANSCRIPT (an empty
 * conversation is caller input, not a server fault), and maps an
 * upstream 400 to the caller's 400 BAD_REQUEST rather than 502.
 */
export function registerHandoffRoutes(app: Express, ctx: RegisterHandoffRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { getConversation } = ctx.conversations;
  const { isSafeId, validateExternalApiBaseUrl } = ctx.validation;
  const {
    synthesizeHandoffPrompt,
    FinalizeUpstreamError,
    TranscriptExportLockedError,
    EmptyTranscriptError,
    redactSecrets,
  } = ctx.handoff;

  app.post('/api/projects/:id/handoff', async (req, res) => {
    const { conversationId, apiKey, baseUrl, model, maxTokens } = req.body || {};
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }

      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'apiKey is required');
      }
      if (typeof model !== 'string' || !model.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'model is required');
      }
      if (baseUrl !== undefined) {
        if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'baseUrl must be a non-empty string when provided',
          );
        }
        const validated = await validateExternalApiBaseUrl(baseUrl);
        if (validated.error) {
          return sendApiError(
            res,
            validated.forbidden ? 403 : 400,
            validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
            validated.error,
          );
        }
      }
      if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens <= 0)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'maxTokens must be a positive number when provided',
        );
      }
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'conversationId is required');
      }
      if (!isSafeId(conversationId)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid conversationId');
      }

      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }

      // Handoff is conversation-scoped — the conversation must exist AND
      // belong to this project, otherwise the synthesized transcript would
      // either be empty or (worse) summarize an unrelated project's chat.
      const conversation = getConversation(db, conversationId);
      if (!conversation || conversation.projectId !== req.params.id) {
        return sendApiError(
          res,
          404,
          'CONVERSATION_NOT_FOUND',
          'conversation not found in this project',
        );
      }

      const handoffAbort = new AbortController();
      const abortFromRequest = (): void => {
        if (!handoffAbort.signal.aborted) handoffAbort.abort();
      };
      res.on('close', abortFromRequest);

      let result;
      try {
        result = await synthesizeHandoffPrompt(db, PROJECTS_DIR, req.params.id, {
          conversationId,
          apiKey,
          baseUrl,
          model,
          maxTokens,
          signal: handoffAbort.signal,
        });
      } finally {
        res.off('close', abortFromRequest);
      }
      res.json(result);
    } catch (err: any) {
      // Concurrent handoff (or a handoff that overlaps a finalize / other
      // transcript-export consumer) loses the race on `.transcript.lock`
      // and surfaces as `TranscriptExportLockedError` from
      // `exportProjectTranscript`. Map it to the same `409 CONFLICT` code
      // finalize uses for its own lockfile contention
      // (`import-export-routes.ts:603-605`) so callers see an intentional
      // retryable response instead of an opaque 500.
      if (err instanceof TranscriptExportLockedError) {
        return sendApiError(res, 409, 'CONFLICT', err.message);
      }

      // The selected conversation has no messages — fail fast as caller
      // input rather than spending BYOK tokens on an empty synthesis.
      if (err instanceof EmptyTranscriptError) {
        return sendApiError(res, 400, 'EMPTY_TRANSCRIPT', err.message);
      }

      if (err instanceof FinalizeUpstreamError) {
        const safeDetails = redactSecrets(err.rawText || '', [apiKey]);
        const init = safeDetails ? { details: safeDetails } : {};
        if (err.status === 401) {
          return sendApiError(res, 401, 'UNAUTHORIZED', err.message, init);
        }
        if (err.status === 429) {
          return sendApiError(res, 429, 'RATE_LIMITED', err.message, init);
        }
        // An upstream 400 is a deterministic request-shape error (unknown
        // model, invalid maxTokens, malformed body) — caller input, not a
        // transient outage. Surface it as the caller's own BAD_REQUEST with
        // the redacted upstream detail so they fix the offending field
        // rather than retrying a 502.
        if (err.status === 400) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message, init);
        }
        return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', err.message, init);
      }

      const errName =
        err && typeof err === 'object' && 'name' in err ? (err as { name?: unknown }).name : '';
      if (errName === 'AbortError') {
        return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'handoff timed out');
      }

      console.error('[handoff]', err);
      const safeMsg = redactSecrets(String(err?.message || err), [apiKey]);
      return sendApiError(res, 500, 'INTERNAL_ERROR', safeMsg);
    }
  });
}
