import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';
import { newInsertId } from './analytics.js';
import {
  agentIdToTracking,
  projectKindToTracking,
} from '@open-design/contracts/analytics';
import { validateBaseUrlResolved } from './connectionTest.js';

export interface RegisterChatRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'chat' | 'agents' | 'critique' | 'validation' | 'lifecycle'> {}

// Invariant: a chat assistant message row reflects its run's terminal state
// even when the web client never persists the cancel/finish itself (refresh
// or dropped PUT). Without this, a row stuck at run_status='running' /
// ended_at=NULL makes the elapsed-time renderer fall back to now - startedAt
// after reload. COALESCE preserves any endedAt the web already wrote; the
// run_status guard skips rows the web has already finalized.
function reconcileAssistantMessageOnRunEnd(
  db: RegisterChatRoutesDeps['db'],
  runs: RegisterChatRoutesDeps['design']['runs'],
  run: { assistantMessageId: string | null },
): void {
  if (!run.assistantMessageId) return;
  void runs
    .wait(run)
    .then((finalStatus: { status: string }) => {
      db.prepare(
        `UPDATE messages
            SET run_status = ?, ended_at = COALESCE(ended_at, ?)
          WHERE id = ? AND run_status IN ('queued', 'running')`,
      ).run(finalStatus.status, Date.now(), run.assistantMessageId);
    })
    .catch((err: unknown) => {
      console.warn('[runs] message reconciliation failed', err);
    });
}

export function registerChatRoutes(app: Express, ctx: RegisterChatRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError, createSseResponse } = ctx.http;
  const { startChatRun, submitToolResultToRun } = ctx.chat;
  const { testProviderConnection, testAgentConnection, getAgentDef, isKnownModel, sanitizeCustomModel, listProviderModels } = ctx.agents;
  const {
    handleCritiqueArtifact,
    handleCritiqueInterrupt,
    critiqueArtifactsRoot,
    critiqueResponseCapBytes,
    critiqueRunRegistry,
  } = ctx.critique;
  const isDaemonShuttingDown = ctx.lifecycle?.isDaemonShuttingDown ?? (() => false);
  const rejectProxyPluginContext = (body: Record<string, unknown>, res: any) => {
    if (
      (typeof body.pluginId === 'string' && body.pluginId.trim().length > 0) ||
      (
        typeof body.appliedPluginSnapshotId === 'string' &&
        body.appliedPluginSnapshotId.trim().length > 0
      )
    ) {
      sendApiError(
        res,
        409,
        'PLUGIN_REQUIRES_DAEMON',
        'Plugin runs must go through POST /api/runs so the daemon can resolve and pin the applied plugin snapshot.',
      );
      return true;
    }
    return false;
  };

  app.post('/api/runs', (req, res) => {
    if (isDaemonShuttingDown()) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const run = design.runs.create(req.body || {});
    const declared = String(req.get('x-od-client') ?? '').toLowerCase();
    if (declared === 'desktop' || declared === 'web') {
      run.clientType = declared;
    } else {
      const ua = String(req.get('user-agent') ?? '');
      run.clientType = ua.includes('Electron/') ? 'desktop' : 'web';
    }
    /** @type {import('@open-design/contracts').ChatRunCreateResponse} */
    const body = { runId: run.id };
    res.status(202).json(body);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
    reconcileAssistantMessageOnRunEnd(db, design.runs, run);

    // Analytics: emit run_created (daemon-side, authoritative) and
    // schedule a run_finished emission on wait() resolution. Both events
    // use the same insert_id so PostHog dedupes against the web mirror
    // that fires on SSE start/end. No-op when POSTHOG_KEY is unset.
    const context = design.readAnalyticsContext?.(req);
    if (context) {
      const reqBody = (req.body || {}) as Record<string, unknown>;
      const runInsertId = newInsertId();
      const runStartedAt = Date.now();
      // Estimate user_query_tokens from the request prompt — we never
      // transmit the prompt text itself, just the integer count. The
      // canonical extraction (currentPrompt fallback to message) lives
      // in telemetryPromptFromRunRequest; mirroring it inline keeps the
      // analytics emit self-contained and out of the startChatRun
      // critical path.
      const promptText =
        typeof reqBody.currentPrompt === 'string'
          ? reqBody.currentPrompt
          : typeof reqBody.message === 'string'
            ? reqBody.message
            : '';
      // ~4 chars per token is the common rough heuristic for English /
      // Latin text; CJK skews token-per-char higher but this is still the
      // industry-standard estimate when no tokenizer is available. The
      // accompanying token_count_source field marks this as 'estimated'
      // so dashboards can tell estimate from real provider counts.
      const userQueryTokens = promptText.length > 0
        ? Math.ceil(promptText.length / 4)
        : 0;
      const baseProps: Record<string, unknown> = {
        page: 'studio',
        area: 'chat_composer',
        project_id: typeof reqBody.projectId === 'string' ? reqBody.projectId : null,
        conversation_id:
          typeof reqBody.conversationId === 'string' ? reqBody.conversationId : null,
        run_id: run.id,
        project_kind: null,
        design_system_id:
          typeof reqBody.designSystemId === 'string'
            ? reqBody.designSystemId
            : undefined,
        design_system_source: 'unknown',
        has_attachment: Array.isArray(reqBody.attachments)
          ? (reqBody.attachments as unknown[]).length > 0
          : false,
        user_query_tokens: userQueryTokens,
        model_id: typeof reqBody.model === 'string' ? reqBody.model : null,
        agent_provider_id:
          typeof reqBody.agentId === 'string'
            ? agentIdToTracking(reqBody.agentId)
            : null,
        skill_id: typeof reqBody.skillId === 'string' ? reqBody.skillId : null,
        mcp_id: null,
        token_count_source: userQueryTokens > 0 ? 'estimated' : 'unknown',
      };
      design.analytics.capture({
        eventName: 'run_created',
        context,
        appVersion: design.getAppVersion?.() ?? '0.0.0',
        properties: baseProps,
        insertId: runInsertId,
      });
      // Run lifecycle hook: emit run_finished when the run reaches a
      // terminal state. The same context is reused — captures are
      // synchronous and never block the run.
      design.runs.wait(run).then((status: { status: string }) => {
        const result =
          status.status === 'succeeded'
            ? 'success'
            : status.status === 'canceled'
              ? 'cancelled'
              : 'failed';
        // Pull input/output token totals from the agent's usage event,
        // which claude-stream.ts emits as `{ type: 'usage', usage: {...} }`
        // and the run service stores in run.events. Provider only gives
        // totals (no 7-subfield breakdown), so token_count_source flips
        // to 'provider_usage' here only when at least one number landed;
        // otherwise stays 'unknown'.
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        for (let i = run.events.length - 1; i >= 0; i -= 1) {
          const ev = run.events[i];
          const data = ev?.data as
            | { type?: string; usage?: Record<string, unknown> | null }
            | null
            | undefined;
          if (ev?.event === 'agent' && data?.type === 'usage' && data.usage) {
            const u = data.usage;
            if (typeof u.input_tokens === 'number') inputTokens = u.input_tokens;
            if (typeof u.output_tokens === 'number') outputTokens = u.output_tokens;
            if (inputTokens !== undefined || outputTokens !== undefined) break;
          }
        }
        const haveUsage = inputTokens !== undefined || outputTokens !== undefined;
        const totalTokens =
          inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined;
        design.analytics.capture({
          eventName: 'run_finished',
          context,
          appVersion: design.getAppVersion?.() ?? '0.0.0',
          properties: {
            ...baseProps,
            area: 'chat_panel',
            result,
            artifact_count: 0,
            total_duration_ms: Date.now() - runStartedAt,
            ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
            ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
            ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
            // Upgrade source to 'provider_usage' when the agent reported
            // input/output totals; otherwise inherit baseProps' value
            // ('estimated' when user_query_tokens > 0, else 'unknown').
            ...(haveUsage ? { token_count_source: 'provider_usage' } : {}),
          },
          insertId: `${runInsertId}-finish`,
        });
      }).catch(() => {
        // wait() can't reject in current runs.ts impl, but guard anyway.
      });
    }
  });

  app.get('/api/runs', (req, res) => {
    const { projectId, conversationId, status } = req.query;
    const runs = design.runs.list({ projectId, conversationId, status });
    /** @type {import('@open-design/contracts').ChatRunListResponse} */
    const body = { runs: runs.map(design.runs.statusBody) };
    res.json(body);
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    res.json(design.runs.statusBody(run));
  });

  app.get('/api/runs/:id/events', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.stream(run, req, res);
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    const run = design.runs.get(req.params.id);
    if (!run) return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    design.runs.cancel(run);
    /** @type {import('@open-design/contracts').ChatRunCancelResponse} */
    const body = { ok: true };
    res.json(body);
  });

  // Feed a `tool_result` content block into a running stream-json child.
  // Currently used to answer Claude's `AskUserQuestion` tool: the host UI
  // collects the user's choice, the web POSTs the formatted answer here,
  // and the daemon writes a JSONL line into the still-open stdin. Without
  // this path Claude auto-errors the tool in headless mode and falls back
  // to a markdown duplicate of the same options.
  app.post('/api/runs/:id/tool-result', (req, res) => {
    if (typeof submitToolResultToRun !== 'function') {
      return sendApiError(res, 501, 'NOT_IMPLEMENTED', 'tool-result wiring is not available');
    }
    const body = (req.body || {}) as {
      toolUseId?: unknown;
      content?: unknown;
      isError?: unknown;
    };
    const toolUseId = typeof body.toolUseId === 'string' ? body.toolUseId : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const isError = body.isError === true;
    if (!toolUseId) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'toolUseId is required');
    }
    const result = submitToolResultToRun(req.params.id, toolUseId, content, isError);
    if (!result || !result.ok) {
      const reason = result && result.reason ? result.reason : 'unknown';
      if (reason === 'not_found') {
        return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
      }
      if (reason === 'run_terminal' || reason === 'stdin_closed') {
        return sendApiError(res, 410, 'GONE', `run is no longer accepting tool results (${reason})`);
      }
      if (reason === 'stdin_text_mode') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'run does not support interactive tool results');
      }
      if (reason === 'bad_tool_use_id') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'toolUseId is invalid');
      }
      return sendApiError(res, 500, 'INTERNAL', `tool result write failed: ${reason}`);
    }
    res.json({ ok: true });
  });

  app.post('/api/chat', (req, res) => {
    if (isDaemonShuttingDown()) {
      return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'daemon is shutting down');
    }
    const run = design.runs.create();
    design.runs.stream(run, req, res);
    design.runs.start(run, () => startChatRun(req.body || {}, run));
  });

  // ---- Connection tests (single-shot JSON; no SSE) ------------------------
  // Settings dialog uses these to verify a config works without sending a
  // real chat. Always return HTTP 200 with `ok: false` on upstream-caused
  // failures so the web layer can render a categorized inline status without
  // unwrapping nested error envelopes; real 4xx/5xx here mean a malformed
  // request or daemon bug.
  app.post('/api/provider/models', async (req, res) => {
    const controller = new AbortController();
    const abortIfRequestAborted = () => {
      if ((req.aborted || !req.complete) && !res.writableEnded) {
        controller.abort();
      }
    };
    const abortIfResponseClosed = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on('close', abortIfRequestAborted);
    res.on('close', abortIfResponseClosed);
    const body = req.body || {};
    const protocol = body.protocol;
    if (
      typeof protocol !== 'string' ||
      !['anthropic', 'openai', 'azure', 'google', 'ollama'].includes(protocol)
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'protocol must be one of anthropic|openai|azure|google|ollama',
      );
    }
    if (
      typeof body.baseUrl !== 'string' ||
      typeof body.apiKey !== 'string' ||
      !body.baseUrl.trim() ||
      !body.apiKey.trim()
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl and apiKey are required',
      );
    }
    try {
      const result = await listProviderModels({
        protocol,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        apiVersion:
          typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
        signal: controller.signal,
      });
      return res.json(result);
    } catch (err: any) {
      console.warn(
        `[provider:models] uncaught: ${err instanceof Error ? err.message : String(err)}`,
      );
      return sendApiError(res, 500, 'INTERNAL', 'Provider model discovery failed');
    } finally {
      req.off('close', abortIfRequestAborted);
      res.off('close', abortIfResponseClosed);
    }
  });

  app.post('/api/test/connection', async (req, res) => {
    const controller = new AbortController();
    const abortIfRequestAborted = () => {
      if ((req.aborted || !req.complete) && !res.writableEnded) {
        controller.abort();
      }
    };
    const abortIfResponseClosed = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on('close', abortIfRequestAborted);
    res.on('close', abortIfResponseClosed);
    const body = req.body || {};
    try {
      if (body.mode === 'provider') {
        const protocol = body.protocol;
        if (
          typeof protocol !== 'string' ||
          !['anthropic', 'openai', 'azure', 'google', 'ollama'].includes(protocol)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'protocol must be one of anthropic|openai|azure|google|ollama',
          );
        }
        if (
          typeof body.baseUrl !== 'string' ||
          typeof body.apiKey !== 'string' ||
          typeof body.model !== 'string' ||
          !body.baseUrl.trim() ||
          !body.apiKey.trim() ||
          !body.model.trim()
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'baseUrl, apiKey, and model are required',
          );
        }
        try {
          const result = await testProviderConnection({
            protocol,
            baseUrl: body.baseUrl,
            apiKey: body.apiKey,
            model: body.model,
            apiVersion:
              typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
            signal: controller.signal,
          });
          return res.json(result);
        } catch (err: any) {
          console.warn(
            `[test:provider] uncaught: ${err instanceof Error ? err.message : String(err)}`,
          );
          return sendApiError(res, 500, 'INTERNAL', 'Connection test failed');
        }
      }

      if (body.mode === 'agent') {
        if (typeof body.agentId !== 'string' || !body.agentId.trim()) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'agentId is required');
        }
        try {
          const def = getAgentDef(body.agentId);
          const testStart = Date.now();
          const safeModel =
            def && typeof body.model === 'string'
              ? isKnownModel(def, body.model)
                ? body.model
                : sanitizeCustomModel(body.model)
              : undefined;
          if (def && typeof body.model === 'string' && body.model.trim() && !safeModel) {
            return res.json({
              ok: false,
              kind: 'invalid_model_id',
              latencyMs: Date.now() - testStart,
              model: body.model.trim(),
              agentName: def.name,
              detail: 'Invalid custom model id. Use a model id that starts with a letter or number and contains no spaces.',
            });
          }
          const safeReasoning =
            def &&
            typeof body.reasoning === 'string' &&
            Array.isArray(def.reasoningOptions)
              ? (def.reasoningOptions.find((r: any) => r.id === body.reasoning)?.id ?? undefined)
              : undefined;
          const result = await testAgentConnection({
            agentId: body.agentId,
            model: safeModel ?? undefined,
            reasoning: safeReasoning,
            agentCliEnv:
              body.agentCliEnv && typeof body.agentCliEnv === 'object'
                ? body.agentCliEnv
                : undefined,
            signal: controller.signal,
          });
          return res.json(result);
        } catch (err: any) {
          console.warn(
            `[test:agent] uncaught: ${err instanceof Error ? err.message : String(err)}`,
          );
          return sendApiError(res, 500, 'INTERNAL', 'Agent test failed');
        }
      }

      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'mode must be one of provider|agent',
      );
    } finally {
      req.off('close', abortIfRequestAborted);
      res.off('close', abortIfResponseClosed);
    }
  });

  // ---- Critique Theater endpoints (Phase 6) --------------------------------

  // POST /api/projects/:projectId/critique/:runId/interrupt
  // Cascades an AbortController to the in-flight orchestrator for the given run.
  app.post(
    '/api/projects/:projectId/critique/:runId/interrupt',
    handleCritiqueInterrupt(db, critiqueRunRegistry),
  );

  // GET /api/projects/:projectId/critique/:runId/artifact
  // Streams the SHIP <ARTIFACT> body the orchestrator persisted, with
  // mime derived from the file extension on disk. Cross-project leak
  // guard mirrors the interrupt route. The web layer fetches this as
  // the logical artifact handle so it never sees daemon paths.
  //
  // Response cap is threaded from cfg.parserMaxBlockBytes so a row that
  // the orchestrator + writer accepted is always retrievable.
  app.get(
    '/api/projects/:projectId/critique/:runId/artifact',
    handleCritiqueArtifact(db, {
      artifactsRoot: critiqueArtifactsRoot,
      responseCapBytes: critiqueResponseCapBytes,
    }),
  );

  // ---- API Proxy (SSE) for API-compatible endpoints ------------------------
  // Browser → daemon → external API. Avoids CORS issues with third-party
  // providers. This keeps BYOK setup zero-config for local users at the cost of
  // one local streaming hop through the daemon.

  const redactAuthTokens = (text: string) =>
    text.replace(/Bearer [A-Za-z0-9_\-.+/=]+/g, 'Bearer [REDACTED]');

  // DNS-aware wrapper. The sync `validateBaseUrl` only inspects the literal
  // hostname string, so a public DNS name pointing at an internal address
  // (`internal.example.com → 10.0.0.5`) still passes. We delegate to
  // `validateBaseUrlResolved` here so every proxy/stream handler runs the
  // same resolved-IP check before issuing the upstream request.
  const validateExternalApiBaseUrl = (baseUrl: string) => {
    return validateBaseUrlResolved(baseUrl);
  };

  const proxyErrorCode = (status: number) => {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 429) return 'RATE_LIMITED';
    return 'UPSTREAM_UNAVAILABLE';
  };

  const sendProxyError = (sse: any, message: string, init: any = {}) => {
    sse.send('error', {
      message,
      error: {
        code: init.code || 'UPSTREAM_UNAVAILABLE',
        message,
        ...(init.details === undefined ? {} : { details: init.details }),
        ...(init.retryable === undefined ? {} : { retryable: init.retryable }),
      },
    });
  };

  const appendVersionedApiPath = (baseUrl: string, path: string) => {
    const url = new URL(baseUrl);
    // `URL.pathname` setter normalizes an empty string back to "/", so
    // we work in a local string to detect the no-path and no-version
    // cases.
    const trimmed = url.pathname.replace(/\/+$/, '');
    // Auto-inject `/v1` whenever the supplied path doesn't already
    // contain a `/vN` segment. This handles all four preset shapes:
    //   bare host                            → /v1/<route>            (api.openai.com, api.anthropic.com)
    //   ends in /vN                          → no inject              (api.openai.com/v1, /v1)
    //   /vN sub-path                         → no inject              (api.deepinfra.com/v1/openai, openrouter.ai/api/v1)
    //   non-versioned compat sub-path        → /v1/<route>            (api.deepseek.com/anthropic, api.minimaxi.com/anthropic)
    // Previously the check was end-of-path only, which broke the
    // /v1/openai sub-path case. A naive "non-empty path → respect"
    // would break the /anthropic sub-path case. Matching `/vN` as a
    // segment anywhere in the path threads both correctly.
    url.pathname = /\/v\d+(\/|$)/.test(trimmed)
      ? `${trimmed}${path}`
      : `${trimmed}/v1${path}`;
    return url.toString();
  };

  const collectSseFrame = (frame: string) => {
    const lines = frame.replace(/\r/g, '').split('\n');
    const dataLines = [];
    let event = 'message';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      let value = line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      dataLines.push(value);
    }
    const payload = dataLines.join('\n');
    if (!payload) return { event, payload: '', data: null };
    if (payload === '[DONE]') return { event, payload, data: null };
    try {
      return { event, payload, data: JSON.parse(payload) };
    } catch {
      return { event, payload, data: null };
    }
  };

  const streamUpstreamSse = async (response: any, onFrame: any) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match || match.index === undefined) break;
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (await onFrame(collectSseFrame(frame))) return;
      }
    }

    const tail = buffer.trim();
    if (tail) await onFrame(collectSseFrame(tail));
  };

  const streamUpstreamNdjson = async (response: any, onFrame: any) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (await onFrame({ data })) return;
        } catch {
          // Ignore malformed provider keepalive lines.
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        const data = JSON.parse(tail);
        await onFrame({ data });
      } catch {
        // Ignore malformed provider tail data.
      }
    }
  };

  const extractOpenAIText = (data: any) => {
    const choices = data?.choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const first = choices[0];
    if (typeof first?.delta?.content === 'string') return first.delta.content;
    if (typeof first?.text === 'string') return first.text;
    return '';
  };

  const extractStreamErrorMessage = (data: any) => {
    const err = data?.error;
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (typeof err?.message === 'string') return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return 'unspecified provider error';
    }
  };

  const extractGeminiText = (data: any) => {
    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return '';
    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part) => part?.text).filter((text) => typeof text === 'string').join('');
  };

  const benignGeminiFinishReasons = new Set(['', 'STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED']);
  const extractGeminiBlockMessage = (data: any) => {
    const feedback = data?.promptFeedback;
    if (typeof feedback?.blockReason === 'string' && feedback.blockReason) {
      const tail = typeof feedback.blockReasonMessage === 'string' && feedback.blockReasonMessage
        ? ` — ${feedback.blockReasonMessage}`
        : '';
      return `Gemini blocked the prompt (${feedback.blockReason})${tail}.`;
    }
    const candidates = data?.candidates;
    if (!Array.isArray(candidates)) return '';
    for (const candidate of candidates) {
      const reason = candidate?.finishReason;
      if (typeof reason !== 'string' || benignGeminiFinishReasons.has(reason)) continue;
      const tail = typeof candidate?.finishMessage === 'string' && candidate.finishMessage
        ? ` — ${candidate.finishMessage}`
        : '';
      return `Gemini stopped the response (${reason})${tail}.`;
    }
    return '';
  };

  app.post('/api/proxy/anthropic/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } =
      proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl, apiKey, and model are required',
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

    const url = appendVersionedApiPath(baseUrl, '/messages');
    console.log(
      `[proxy:anthropic] ${req.method} ${validated.parsed!.hostname} model=${model}`,
    );

    const payload: any = {
      model,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      messages: Array.isArray(messages) ? messages : [],
      stream: true,
    };
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payload.system = systemPrompt;
    }

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:anthropic] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ event, data }: any) => {
        if (!data) return false;
        if (event === 'error' || data.type === 'error') {
          const message = data.error?.message || data.message || 'Anthropic upstream error';
          sendProxyError(sse, message, { details: data });
          ended = true;
          return true;
        }
        if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
          sse.send('delta', { delta: data.delta.text });
        }
        if (event === 'message_stop') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:anthropic] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/openai/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } =
      proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl, apiKey, and model are required',
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

    const url = appendVersionedApiPath(baseUrl, '/chat/completions');
    console.log(
      `[proxy:openai] ${req.method} ${validated.parsed!.hostname} model=${model}`,
    );

    const payloadMessages = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payloadMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const payload: any = {
      model,
      messages: payloadMessages,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      stream: true,
    };

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:openai] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ payload, data }: any) => {
        if (payload === '[DONE]') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Provider error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractOpenAIText(data);
        if (delta) sse.send('delta', { delta });
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:openai] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/azure/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens, apiVersion } =
      proxyBody;
    if (!baseUrl || !apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'baseUrl, apiKey, and model are required',
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

    const url = new URL(baseUrl);
    const basePath = url.pathname.replace(/\/+$/, '');
    const usesVersionedOpenAIPath = /\/openai\/v\d+(?:$|\/)/.test(basePath);
    const version =
      typeof apiVersion === 'string' && apiVersion.trim()
        ? apiVersion.trim()
        : usesVersionedOpenAIPath
          ? ''
          : '2024-10-21';
    url.pathname = usesVersionedOpenAIPath
      ? `${basePath}/chat/completions`
      : `${basePath}/openai/deployments/${encodeURIComponent(model)}/chat/completions`;
    if (usesVersionedOpenAIPath && !version) {
      url.searchParams.delete('api-version');
    }
    if (version) {
      url.searchParams.set('api-version', version);
    }
    console.log(
      `[proxy:azure] ${req.method} ${validated.parsed!.hostname} deployment=${model} api-version=${version || 'omitted'}`,
    );

    const payloadMessages = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payloadMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const payload = {
      ...(usesVersionedOpenAIPath ? { model } : {}),
      messages: payloadMessages,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      stream: true,
    };

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:azure] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ payload: ssePayload, data }: any) => {
        if (ssePayload === '[DONE]') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Azure error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractOpenAIText(data);
        if (delta) sse.send('delta', { delta });
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:azure] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/google/stream', async (req, res) => {
    /** @type {Partial<ProxyStreamRequest>} */
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } = proxyBody;
    if (!apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'apiKey and model are required',
      );
    }

    const effectiveBaseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
    const validated = await validateExternalApiBaseUrl(effectiveBaseUrl);
    if (validated.error) {
      return sendApiError(
        res,
        validated.forbidden ? 403 : 400,
        validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
        validated.error,
      );
    }

    const clean = effectiveBaseUrl.replace(/\/+$/, '');
    const url = `${clean}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    console.log(
      `[proxy:google] ${req.method} ${validated.parsed!.hostname} model=${model}`,
    );

    const contents = (Array.isArray(messages) ? messages : []).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const payload: any = {
      contents,
      generationConfig: {
        maxOutputTokens:
          typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      },
    };
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[proxy:google] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamSse(response, ({ data }: any) => {
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Gemini error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractGeminiText(data);
        if (delta) sse.send('delta', { delta });
        const blockMessage = extractGeminiBlockMessage(data);
        if (blockMessage) {
          sendProxyError(sse, blockMessage, { details: data });
          ended = true;
          return true;
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:google] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

  app.post('/api/proxy/ollama/stream', async (req, res) => {
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const { baseUrl, apiKey, model, systemPrompt, messages, maxTokens } = proxyBody;
    if (!apiKey || !model) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'apiKey and model are required');
    }

    const effectiveBaseUrl = baseUrl || 'https://ollama.com';
    const validated = await validateExternalApiBaseUrl(effectiveBaseUrl);
    if (validated.error) {
      return sendApiError(
        res,
        validated.forbidden ? 403 : 400,
        validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
        validated.error,
      );
    }

    const clean = effectiveBaseUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
    const url = `${clean}/api/chat`;
    console.log(`[proxy:ollama] ${req.method} ${validated.parsed!.hostname} model=${model}`);

    const payloadMessages = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payloadMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const payload: any = { model, messages: payloadMessages, stream: true };
    if (typeof maxTokens === 'number' && maxTokens > 0) {
      payload.options = { num_predict: maxTokens };
    }

    const sse = createSseResponse(res);
    sse.send('start', { model });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[proxy:ollama] upstream error: ${response.status} ${redactAuthTokens(errorText)}`);
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      await streamUpstreamNdjson(response, ({ data }: any) => {
        if (!data) return false;
        if (data.done) {
          sse.send('end', {});
          ended = true;
          return true;
        }
        const content = data.message?.content;
        if (typeof content === 'string' && content) sse.send('delta', { delta: content });
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:ollama] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    }
  });

}
