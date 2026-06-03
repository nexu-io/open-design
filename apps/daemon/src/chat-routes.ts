import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';
import { seedProviderIfMissing } from './media-config.js';
import {
  buildLegacyMaxTokensParam,
  buildMaxCompletionTokensParam,
  buildOpenAIChatTokenParam,
  isUnsupportedMaxTokensError,
} from './openai-chat-token-params.js';
import {
  BYOK_SENSEAUDIO_TOOLS,
  executeGenerateImage,
  executeGenerateSpeech,
  executeGenerateVideo,
  isSenseAudioImageModel,
  type BYOKToolContext,
} from './byok-tools.js';
import { isSafeId as isSafeProjectId } from './projects.js';
import { projectKindToTracking } from '@open-design/contracts/analytics';
import { proxyDispatcherRequestInit, validateBaseUrlResolved } from './connectionTest.js';
import { googleStreamGenerateContentUrl } from './google-models.js';
import { createRoleMarkerGuard } from './role-marker-guard.js';

// Allowlist for the `/feedback` route. Mirrors the
// ChatMessageFeedbackReasonCode union in packages/contracts/src/api/chat.ts.
// Kept inline (not imported as a runtime value, since the contract type is
// type-only) so a stale client can't poison Langfuse with unknown categories.
const FEEDBACK_REASON_ALLOWLIST: ReadonlySet<string> = new Set([
  'matched_request',
  'strong_visual',
  'useful_structure',
  'easy_to_continue',
  'followed_design_system',
  'missed_request',
  'weak_visual',
  'incomplete_output',
  'hard_to_use',
  'missed_design_system',
  'other',
]);

export interface RegisterChatRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'chat' | 'agents' | 'critique' | 'validation' | 'lifecycle' | 'paths' | 'telemetry'> {}

export function registerChatRoutes(app: Express, ctx: RegisterChatRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError, createSseResponse } = ctx.http;
  const { submitToolResultToRun } = ctx.chat;
  const { testProviderConnection, testAgentConnection, getAgentDef, isKnownModel, sanitizeCustomModel, listProviderModels } = ctx.agents;
  const {
    handleCritiqueArtifact,
    handleCritiqueInterrupt,
    critiqueArtifactsRoot,
    critiqueResponseCapBytes,
    critiqueRunRegistry,
  } = ctx.critique;
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

  // The canonical POST /api/runs handler lives in `server.ts` — it ran
  // first in Express's registration order long before this file existed,
  // so any handler we wired here was shadowed and never executed. Plugin
  // snapshot resolution, clientType inference, and the daemon-side
  // run_created/finished analytics all live in `server.ts` now.
  // POST /api/chat is likewise owned by `server.ts`; keep the chat run
  // launch path single-sourced so validation changes land on the live route.

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
      runId?: unknown;
    };
    if (typeof body.runId === 'string' && body.runId.length > 0 && body.runId !== req.params.id) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'runId must match the path run id');
    }
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

  // Receives the user's thumbs-up/down (+ reason codes) for an assistant
  // turn and forwards it to Langfuse as a `score-create`. Web persists the
  // feedback itself via PUT /messages/:id; this endpoint exists only as a
  // telemetry side channel — the daemon is the single network egress for
  // Langfuse and gates on `telemetry.metrics + telemetry.content` consent.
  //
  // The consent + sink decision is fast (awaits a small file read, no
  // network); we await it so the response status honestly reflects whether
  // the score was enqueued, skipped for consent, or skipped because no
  // Langfuse sink is configured. The actual Langfuse network call happens
  // as a detached promise inside the bridge.
  app.post('/api/runs/:id/feedback', async (req, res) => {
    const runId = req.params.id;
    const body = (req.body ?? {}) as Partial<{
      projectId: string;
      conversationId: string;
      assistantMessageId: string;
      rating: 'positive' | 'negative';
      reasonCodes: string[];
      hasCustomReason: boolean;
      customReason: string;
    }>;
    if (!runId) {
      return sendApiError(res, 400, 'INVALID_RUN_ID', 'runId missing');
    }
    if (body.rating !== 'positive' && body.rating !== 'negative') {
      return sendApiError(res, 400, 'INVALID_RATING', 'rating must be positive or negative');
    }
    // Drop anything outside the contract-side reason allowlist and
    // deduplicate; otherwise a malformed or replayed client payload could
    // create unknown Langfuse categories or duplicate score ids in the
    // same batch.
    const reasonCodes = Array.isArray(body.reasonCodes)
      ? Array.from(
          new Set(
            body.reasonCodes.filter(
              (c): c is string =>
                typeof c === 'string' && FEEDBACK_REASON_ALLOWLIST.has(c),
            ),
          ),
        )
      : [];
    const customReason = typeof body.customReason === 'string' ? body.customReason : '';
    const reportFeedback = ctx.telemetry?.reportFeedback;
    if (!reportFeedback) {
      res.status(202).json({ status: 'skipped_no_sink' });
      return;
    }
    // Build score metadata bag that lands in the Langfuse score body.
    // Mirrors the PostHog event so analysts can cross-reference.
    const scoreMetadata: Record<string, unknown> = {
      projectId: body.projectId,
      conversationId: body.conversationId,
      assistantMessageId: body.assistantMessageId,
      hasCustomReason: body.hasCustomReason === true,
      customReason,
    };
    const outcome = await reportFeedback({
      runId,
      rating: body.rating,
      reasonCodes,
      hasCustomReason: body.hasCustomReason === true,
      customReason,
      scoreMetadata,
    });
    res.status(202).json(outcome);
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
      !['anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio'].includes(protocol)
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'protocol must be one of anthropic|openai|azure|google|ollama|senseaudio',
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
      const proxyDispatcher = proxyDispatcherRequestInit();
      try {
        const result = await listProviderModels({
          protocol,
          baseUrl: body.baseUrl,
          apiKey: body.apiKey,
          apiVersion:
            typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
          signal: controller.signal,
          requestInit: proxyDispatcher.requestInit,
        });
        return res.json(result);
      } finally {
        await proxyDispatcher.close();
      }
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
          !['anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio'].includes(protocol)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'protocol must be one of anthropic|openai|azure|google|ollama|senseaudio',
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
        if (await onFrame(collectSseFrame(frame))) {
          // Fire-and-forget cancel: awaiting hangs on some response-stream
          // implementations (notably Response built from Uint8Array body,
          // exposed by tests/proxy-routes.test.ts ollama case where the
          // mock body's tee'd cancel() never resolves). The cancel signal
          // is a hint; we're already returning from the function, so we
          // don't gain anything by blocking on it.
          void reader.cancel().catch(() => {});
          return;
        }
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
          if (await onFrame({ data })) {
            // See note in streamUpstreamSse — fire-and-forget cancel.
            void reader.cancel().catch(() => {});
            return;
          }
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

  // Per-request role-marker guard for BYOK proxy streams (#3247).
  function createDeltaGuard(sse: any) {
    const guard = createRoleMarkerGuard('proxy');
    return {
      sendDelta(text: string) {
        if (guard.contaminated || !text) return;
        const safe = guard.feedText(text);
        if (safe.length > 0) {
          sse.send('delta', { delta: safe });
        }
        if (guard.contaminated) {
          const warn = guard.warningEvent();
          const markerText = warn?.marker ?? '## user';
          sse.send('delta', {
            delta: `\n\n---\n⚠️ **Security warning:** The model attempted to emit a fabricated role marker (\`${markerText}\`). Response was truncated to prevent unauthorized instruction injection. See issue #3247.\n`,
          });
        }
      },
      get contaminated() { 
        return guard.contaminated; 
      },
    };
  }

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
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      sse.send('start', { model });
      const response = await fetch(url, {
        ...proxyDispatcher.requestInit,
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
      const guard = createDeltaGuard(sse);
      await streamUpstreamSse(response, ({ event, data }: any) => {
        if (!data) return false;
        if (event === 'error' || data.type === 'error') {
          const message = data.error?.message || data.message || 'Anthropic upstream error';
          sendProxyError(sse, message, { details: data });
          ended = true;
          return true;
        }
        if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
          guard.sendDelta(data.delta.text);
          if (guard.contaminated) { 
            sse.send('end', {}); 
            ended = true; 
            return true; 
          }
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
    } finally {
      await proxyDispatcher?.close();
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
      ...buildOpenAIChatTokenParam(
        model,
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      ),
      stream: true,
    };

    const sse = createSseResponse(res);
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      sse.send('start', { model });
      const response = await fetch(url, {
        ...proxyDispatcher.requestInit,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(validated.parsed!.hostname === 'openrouter.ai' ? {
            'HTTP-Referer': 'https://opendesign.dev',
            'X-Title': 'Open Design',
          } : {}),
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
      const guard = createDeltaGuard(sse);
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
        if (delta) { 
          guard.sendDelta(delta); 
          if (guard.contaminated) { 
            sse.send('end', {}); 
            ended = true; 
            return true; 
          } 
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:openai] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    } finally {
      await proxyDispatcher?.close();
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

    const effectiveMaxTokens =
      typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192;
    const payload = {
      ...(usesVersionedOpenAIPath ? { model } : {}),
      messages: payloadMessages,
      ...buildLegacyMaxTokensParam(effectiveMaxTokens),
      stream: true,
    };
    const retryPayload = {
      ...(usesVersionedOpenAIPath ? { model } : {}),
      messages: payloadMessages,
      ...buildMaxCompletionTokensParam(effectiveMaxTokens),
      stream: true,
    };

    const sse = createSseResponse(res);
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      sse.send('start', { model });
      const requestInit = {
        ...proxyDispatcher.requestInit,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        redirect: 'error' as const,
      };
      let response = await fetch(url, {
        ...requestInit,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorText = await response.text();
        if (
          response.status === 400 &&
          isUnsupportedMaxTokensError(errorText)
        ) {
          console.warn(
            `[proxy:azure] retrying request with max_completion_tokens deployment=${model}`,
          );
          response = await fetch(url, {
            ...requestInit,
            body: JSON.stringify(retryPayload),
          });
          if (response.ok) {
            errorText = '';
          } else {
            errorText = await response.text();
          }
        }
        if (!response.ok) {
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
      }

      let ended = false;
      const guard = createDeltaGuard(sse);
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
        if (delta) { guard.sendDelta(delta); 
          if (guard.contaminated) { 
            sse.send('end', {}); 
            ended = true; 
            return true; 
          } 
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:azure] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    } finally {
      await proxyDispatcher?.close();
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

    const url = googleStreamGenerateContentUrl(effectiveBaseUrl, model);
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
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      sse.send('start', { model });
      const response = await fetch(url, {
        ...proxyDispatcher.requestInit,
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
      const guard = createDeltaGuard(sse);
      await streamUpstreamSse(response, ({ data }: any) => {
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Gemini error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractGeminiText(data);
        if (delta) { guard.sendDelta(delta); 
          if (guard.contaminated) { 
            sse.send('end', {}); 
            ended = true; 
            return true; 
          } 
        }
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
    } finally {
      await proxyDispatcher?.close();
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
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      sse.send('start', { model });
      const response = await fetch(url, {
        ...proxyDispatcher.requestInit,
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
      const guard = createDeltaGuard(sse);
      await streamUpstreamNdjson(response, ({ data }: any) => {
        if (!data) return false;
        if (data.done) {
          sse.send('end', {});
          ended = true;
          return true;
        }
        const content = data.message?.content;
        if (typeof content === 'string' && content) { 
          guard.sendDelta(content); 
          if (guard.contaminated) { 
            sse.send('end', {}); 
            ended = true; 
            return true; 
          } 
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[proxy:ollama] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    } finally {
      await proxyDispatcher?.close();
    }
  });

  // SenseAudio chat completions. Wire-compatible with OpenAI (POST
  // /v1/chat/completions, Bearer auth, SSE `data: {...}` + `data: [DONE]`)
  // plus a daemon-side tool loop: the handler injects an OpenAI
  // `tools` array on every upstream request and, when the model
  // responds with a `tool_calls` finish_reason, executes the call
  // locally, appends the assistant + tool messages to the conversation,
  // and re-issues the completion. This is how BYOK chat — which has
  // no agent-runtime scaffolding — gets image-generation parity with
  // the CLI agent path. Loop is bounded by MAX_BYOK_TOOL_LOOPS so a
  // misbehaving model can't pin the daemon in an infinite tool dance.
  const MAX_BYOK_TOOL_LOOPS = 3;

  type AccumulatedToolCall = { id: string; name: string; arguments: string };
  type TurnResult =
    | { kind: 'text_end' }
    | { kind: 'error' }
    | {
        kind: 'tool_calls';
        assistantMessage: any;
        toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
      };

  app.post('/api/proxy/senseaudio/stream', async (req, res) => {
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const {
      baseUrl,
      apiKey,
      model,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      byokImageModel,
    } = proxyBody;
    if (!apiKey || !model) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'apiKey and model are required',
      );
    }
    // projectId is required because the BYOK generate_image tool writes
    // into the active project's folder; without one we'd have to fall
    // back to a daemon-global cache that orphans the file. The web
    // client always passes project.id from ProjectView, so a missing
    // value means the request did not come through the chat surface.
    if (typeof projectId !== 'string' || !isSafeProjectId(projectId)) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'projectId is required and must be a safe identifier',
      );
    }

    const effectiveBaseUrl = baseUrl || 'https://api.senseaudio.cn';
    const validated = await validateExternalApiBaseUrl(effectiveBaseUrl);
    if (validated.error) {
      return sendApiError(
        res,
        validated.forbidden ? 403 : 400,
        validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
        validated.error,
      );
    }

    const url = appendVersionedApiPath(effectiveBaseUrl, '/chat/completions');
    console.log(
      `[proxy:senseaudio] ${req.method} ${validated.parsed?.hostname ?? '?'} model=${model} project=${projectId}`,
    );

    const workingMessages: any[] = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      workingMessages.unshift({ role: 'system', content: systemPrompt });
    }

    // Tool execution context — built once per request. The image tool
    // writes into `<projectsRoot>/<projectId>/byok-<id>.png` and returns
    // a relative URL via `/api/projects/:id/files/:filename`. The web's
    // Next.js rewrites `/api/:path*` to the daemon, so the chat UI
    // loads images same-origin through the standard project file
    // route — no CSP / CORS exceptions needed.
    // User-configured BYOK default image model. Drop silently if the
    // client sent an id outside the SenseAudio registry — the tool
    // will fall back to the registry default and the LLM can still
    // override per-call via the tool's `model` arg.
    const validDefaultImageModel = isSenseAudioImageModel(byokImageModel)
      ? byokImageModel
      : undefined;

    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;

    const toolCtx: BYOKToolContext = {
      projectRoot: ctx.paths.PROJECT_ROOT,
      projectsRoot: ctx.paths.PROJECTS_DIR,
      projectId,
      upstreamApiKey: apiKey,
      upstreamBaseUrl: effectiveBaseUrl,
      requestInit: {},
      // Spread-conditional because tsconfig's exactOptionalPropertyTypes
      // forbids `field: undefined` on an optional slot. The byok-tools
      // executor reads `ctx.defaultImageModel` with `isSenseAudioImageModel`
      // anyway, so a missing key and an undefined value behave the same.
      ...(validDefaultImageModel
        ? { defaultImageModel: validDefaultImageModel }
        : {}),
    };

    // Run one round-trip: POST to upstream, stream text deltas to the
    // client as they arrive, accumulate any tool_call deltas. Returns
    // a typed result describing what to do next (loop on tool calls,
    // close the stream, or bail on error). Closures capture all the
    // SSE helpers from registerChatRoutes.
    const runSenseAudioTurn = async (
      sse: any,
      messagesForTurn: any[],
    ): Promise<TurnResult> => {
      const payload: any = {
        model,
        messages: messagesForTurn,
        max_tokens:
          typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
        stream: true,
        tools: BYOK_SENSEAUDIO_TOOLS,
        tool_choice: 'auto',
      };
      const response = await fetch(url, {
        ...toolCtx.requestInit,
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
          `[proxy:senseaudio] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return { kind: 'error' };
      }

      const accum: Record<number, AccumulatedToolCall> = {};
      let finishReason = '';
      let providerError = '';

      const guard = createDeltaGuard(sse);
      await streamUpstreamSse(response, ({ payload, data }: any) => {
        if (payload === '[DONE]') return true;
        if (!data) return false;

        const streamErr = extractStreamErrorMessage(data);
        if (streamErr) {
          providerError = streamErr;
          return true;
        }

        const choices = (data as any).choices;
        if (!Array.isArray(choices) || choices.length === 0) return false;
        const choice = choices[0] || {};
        const delta = choice.delta || {};

        // Text content streams to the client unchanged. Tool turns and
        // text turns can both share this path — the OpenAI protocol
        // never emits text+tool_calls in the same chunk, but it can
        // emit text before / after a tool_call in the same turn, and
        // we want the user to see whatever the model decided to say.
        if (typeof delta.content === 'string' && delta.content) {
          guard.sendDelta(delta.content);
          if (guard.contaminated) { 
            sse.send('end', {}); 
            return true; 
          }
        }

        // Tool call deltas stream as fragments — `id` arrives once at
        // the start, `function.name` once at the start, and
        // `function.arguments` accumulates a chunked JSON string we
        // have to concatenate. Parallel calls use the `index` field to
        // distinguish slots. Default to 0 when omitted (older models).
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc?.index === 'number' ? tc.index : 0;
            if (!accum[idx]) {
              accum[idx] = { id: '', name: '', arguments: '' };
            }
            const slot = accum[idx];
            if (typeof tc.id === 'string' && tc.id) slot.id = tc.id;
            if (typeof tc.function?.name === 'string' && tc.function.name) {
              slot.name = tc.function.name;
            }
            if (typeof tc.function?.arguments === 'string') {
              slot.arguments += tc.function.arguments;
            }
          }
        }

        if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        return false;
      });

      if (providerError) {
        sendProxyError(sse, `Provider error: ${providerError}`, {
          details: providerError,
        });
        return { kind: 'error' };
      }

      if (finishReason === 'tool_calls' && Object.keys(accum).length > 0) {
        const indices = Object.keys(accum)
          .map(Number)
          .sort((a, b) => a - b);
        const toolCalls = indices.map((i) => ({
          id: accum[i]!.id || `call_${i}`,
          type: 'function' as const,
          function: {
            name: accum[i]!.name,
            arguments: accum[i]!.arguments,
          },
        }));
        return {
          kind: 'tool_calls',
          assistantMessage: {
            role: 'assistant',
            content: null,
            tool_calls: toolCalls,
          },
          toolCalls,
        };
      }

      return { kind: 'text_end' };
    };

    const executeOneTool = async (call: {
      id: string;
      function: { name: string; arguments: string };
    }): Promise<{ ok: boolean; url?: string; error?: string; kind?: 'image' | 'video' | 'speech' }> => {
      const fnName = call?.function?.name ?? '';
      if (fnName !== 'generate_image' && fnName !== 'generate_video' && fnName !== 'generate_speech') {
        return {
          ok: false,
          error: `unknown tool: ${fnName || 'unnamed'}`,
        };
      }
      const toolKind = fnName === 'generate_image' ? 'image' : fnName === 'generate_video' ? 'video' : 'speech';
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        return { ok: false, error: 'tool arguments were not valid JSON', kind: toolKind };
      }
      if (fnName === 'generate_image') {
        const result = await executeGenerateImage(args, toolCtx);
        return { ...result, kind: 'image' };
      }
      if (fnName === 'generate_speech') {
        const result = await executeGenerateSpeech(args, toolCtx);
        return { ...result, kind: 'speech' };
      }
      // generate_video — longer (up to 5 min), async-with-polling.
      const result = await executeGenerateVideo(args, toolCtx);
      return { ...result, kind: 'video' };
    };

    const sse = createSseResponse(res);
    // SenseAudio's gateway issues one API key that works for both
    // /v1/chat/completions and the image / TTS surfaces. Mirror the
    // BYOK key into media-config so the CLI agent path (`od media
    // generate`) picks it up automatically — fire-and-forget; the
    // chat stream must not block on the disk write. seedProviderIfMissing
    // is idempotent and preserves env-var-resolved keys.
    seedProviderIfMissing(ctx.paths.PROJECT_ROOT, 'senseaudio', {
      apiKey,
      baseUrl: effectiveBaseUrl,
    })
      .then((seeded) => {
        if (seeded) {
          console.log(
            '[proxy:senseaudio] seeded media-config.senseaudio from BYOK key',
          );
        }
      })
      .catch((err: unknown) => {
        console.warn(
          `[proxy:senseaudio] seed media-config failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      toolCtx.requestInit = proxyDispatcher.requestInit;
      sse.send('start', { model });
      for (let loop = 0; loop < MAX_BYOK_TOOL_LOOPS; loop++) {
        const turn = await runSenseAudioTurn(sse, workingMessages);
        if (turn.kind === 'error') return sse.end();
        if (turn.kind === 'text_end') {
          sse.send('end', {});
          return sse.end();
        }
        // turn.kind === 'tool_calls'
        workingMessages.push(turn.assistantMessage);
        for (const call of turn.toolCalls) {
          const result = await executeOneTool(call);
          // The tool result is delivered to the model as a `tool` role
          // message — a structured payload the model can interpret. We
          // also surface a daemon-side log line so a user reporting "no
          // image showed up" can grep for the call id. The kind field
          // distinguishes image vs video so the daemon picks the right
          // embedding hint for the model (markdown image syntax for
          // PNG, markdown link for MP4 since the chat renderer doesn't
          // currently render <video> tags).
          const toolName = call?.function?.name ?? 'unknown';
          if (result.ok) {
            console.log(
              `[proxy:senseaudio] ${toolName} OK: ${call.id} → ${result.url}`,
            );
          } else {
            console.warn(
              `[proxy:senseaudio] ${toolName} FAILED: ${call.id} — ${result.error}`,
            );
          }
          const content = result.ok
            ? result.kind === 'video'
              ? `Video generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link, e.g. [▶ Play video](${result.url}). Do NOT use markdown image syntax — the chat renderer does not embed <video> tags.`
              : result.kind === 'speech'
                ? `Speech generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link to the MP3, e.g. [▶ Play voiceover](${result.url}).`
              : `Image generated successfully. URL: ${result.url}. Reply to the user with: ![generated image](${result.url})`
            : result.kind === 'video'
              ? `Video generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt or a shorter duration.`
              : result.kind === 'speech'
                ? `Speech generation failed: ${result.error}. Apologize briefly and suggest a retry with a shorter script or a valid voice id.`
              : `Image generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt.`;
          workingMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content,
          });
        }
      }
      // Tool loop exhausted — the model still wants to call tools but we
      // refuse a 4th round. Close the stream gracefully; the last text
      // delta the model emitted (if any) is already on the wire.
      console.warn(
        '[proxy:senseaudio] tool loop bounded at MAX_BYOK_TOOL_LOOPS=3',
      );
      sse.send('end', {});
      return sse.end();
    } catch (err: any) {
      console.error(`[proxy:senseaudio] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    } finally {
      await proxyDispatcher?.close();
    }
  });

}
