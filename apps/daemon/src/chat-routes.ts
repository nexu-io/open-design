import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';
import { seedProviderIfMissing } from './media-config.js';
import {
  buildMaxCompletionTokensParam,
  buildOpenAIChatTokenParam,
  isUnsupportedMaxTokensError,
} from './openai-chat-token-params.js';
import {
  BYOK_MEDIA_TOOLS,
  defaultMediaModelsForProvider,
  executeGenerateImage,
  executeGenerateVideo,
  executeGenerateAudio,
  isImageModel,
  isVideoModel,
  isAudioModel,
  SENSEAUDIO_DEFAULT_IMAGE_MODEL,
  SENSEAUDIO_DEFAULT_VIDEO_MODEL,
  SENSEAUDIO_DEFAULT_AUDIO_MODEL,
  type BYOKToolContext,
} from './byok-tools.js';
import { isSafeId as isSafeProjectId } from './projects.js';
import { projectKindToTracking } from '@open-design/contracts/analytics';
import { proxyDispatcherRequestInit, validateBaseUrlResolved } from './connectionTest.js';
import { googleStreamGenerateContentUrl } from './google-models.js';

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

  // The canonical POST /api/runs handler lives in `server.ts` — it ran
  // first in Express's registration order long before this file existed,
  // so any handler we wired here was shadowed and never executed. Plugin
  // snapshot resolution, clientType inference, and the daemon-side
  // run_created/finished analytics all live in `server.ts` now.

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

  // ---- BYOK proxy ↔ run-registry bridge -----------------------------------
  // BYOK chats used to stream straight from the upstream LLM into the POST
  // response, so navigating away tore the stream down with no way to resume —
  // the chat froze mid-output. To give BYOK the same background + reattach
  // capability the agent path has, every proxy/*/stream handler now runs its
  // work as a registry run: the POST returns `202 { runId }` immediately and
  // the worker emits into the run's event buffer. A disconnected client
  // leaves the worker running and the buffer intact, so the web layer can
  // reattach via GET /api/runs/:id/events?after=<lastEventId> exactly as it
  // does for agent runs.
  //
  // The adapter exposes the same `{ send, end }` shape the handlers already
  // use against `createSseResponse`, so each handler keeps its per-protocol
  // streaming/tool-loop logic untouched — only the sink changes. Event names
  // are translated to the daemon-run vocabulary the web's consumeDaemonRun
  // understands: `delta` → `stdout {chunk}`, `error` is buffered verbatim
  // (its `{message, error:{…}}` shape matches what the consumer parses), and
  // `end` is finalized through runs.finish so the run reaches a terminal
  // status with a buffered `end` event.
  const makeRunBackedProxyStream = (run: any) => {
    let finished = false;
    let errored = false;
    return {
      send(event: string, data: any) {
        if (event === 'delta') {
          design.runs.emit(run, 'stdout', {
            chunk: String(data?.delta ?? data?.text ?? ''),
          });
        } else if (event === 'start') {
          design.runs.emit(run, 'start', data ?? {});
        } else if (event === 'error') {
          errored = true;
          design.runs.emit(run, 'error', data);
        } else if (event === 'end') {
          // Terminal transition is owned by end() so the run status and the
          // buffered `end` event stay consistent; ignore the bare frame.
        } else {
          design.runs.emit(run, event, data);
        }
      },
      end() {
        if (finished) return;
        finished = true;
        if (run.cancelRequested) {
          design.runs.finish(run, 'canceled', null, 'SIGTERM');
        } else {
          design.runs.finish(
            run,
            errored ? 'failed' : 'succeeded',
            errored ? 1 : 0,
            null,
          );
        }
      },
    };
  };

  // Create a registry run for a BYOK proxy request, answer the POST with the
  // runId, and execute `work` in the background. `work` receives the
  // run-backed stream plus an AbortSignal wired to POST /api/runs/:id/cancel
  // (BYOK runs have no OS child, so cancellation is cooperative — the worker
  // must pass the signal to its upstream fetch and bail when it aborts).
  const runByokProxy = (
    res: any,
    meta: { projectId?: unknown; conversationId?: unknown; assistantMessageId?: unknown },
    work: (args: { sse: any; signal: AbortSignal; run: any }) => Promise<void>,
  ) => {
    const run = design.runs.create({
      projectId: typeof meta.projectId === 'string' ? meta.projectId : null,
      conversationId: typeof meta.conversationId === 'string' ? meta.conversationId : null,
      assistantMessageId:
        typeof meta.assistantMessageId === 'string' ? meta.assistantMessageId : null,
    });
    const abort = new AbortController();
    run.onCancel = () => abort.abort();
    res.status(202).json({ runId: run.id });
    const sse = makeRunBackedProxyStream(run);
    design.runs.start(run, async () => {
      await work({ sse, signal: abort.signal, run });
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
    const { projectId, byokImageModel, byokVideoModel, byokAudioModel } =
      proxyBody;
    console.log(
      `[proxy:anthropic] ${req.method} ${validated.parsed!.hostname} model=${model} project=${projectId ?? '-'}`,
    );

    // Anthropic's Messages API uses a different tool protocol than OpenAI, so
    // it runs through a dedicated adapter. Claude has no media API of its own,
    // so in-chat media routes to whatever the user configured in Settings →
    // Media; the adapter degrades to a plain passthrough without a projectId.
    await runAnthropicMediaChat({
      res,
      proxyBody,
      url,
      apiKey,
      model,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      byokImageModel,
      byokVideoModel,
      byokAudioModel,
    });
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
    const { projectId, byokImageModel, byokVideoModel, byokAudioModel } =
      proxyBody;
    console.log(
      `[proxy:openai] ${req.method} ${validated.parsed!.hostname} model=${model} project=${projectId ?? '-'}`,
    );

    // OpenAI's key unlocks image (gpt-image) + speech (TTS) media too — seed it
    // so those work in-chat, and default each surface to OpenAI's model. The
    // shared loop degrades to a plain LLM passthrough when no projectId is
    // present, so non-project OpenAI chats keep working unchanged.
    await runByokMediaChat({
      res,
      proxyBody,
      providerTag: 'openai',
      url,
      authHeaders: { Authorization: `Bearer ${apiKey}` },
      model,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      seed: { provider: 'openai', apiKey, baseUrl },
      surfaceDefaults: defaultMediaModelsForProvider('openai'),
      byokImageModel,
      byokVideoModel,
      byokAudioModel,
    });
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
    const { projectId, byokImageModel, byokVideoModel, byokAudioModel } =
      proxyBody;
    console.log(
      `[proxy:azure] ${req.method} ${validated.parsed!.hostname} deployment=${model} api-version=${version || 'omitted'} project=${projectId ?? '-'}`,
    );

    // Azure Open AI is OpenAI-compatible for chat, but the deployment path
    // carries the model in the URL (so omit it from the body there). Azure has
    // no dedicated media provider in the registry, so we don't self-seed —
    // in-chat media routes to whatever the user configured in Settings → Media.
    await runByokMediaChat({
      res,
      proxyBody,
      providerTag: 'azure',
      url: url.toString(),
      authHeaders: { 'api-key': apiKey },
      model,
      includeModel: usesVersionedOpenAIPath,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      seed: null,
      byokImageModel,
      byokVideoModel,
      byokAudioModel,
    });
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

    runByokProxy(res, proxyBody, async ({ sse, signal }) => {
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
          signal,
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
        if (err?.name === 'AbortError') return sse.end();
        console.error(`[proxy:google] internal error: ${err.message}`);
        sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
        sse.end();
      }
    });
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

    runByokProxy(res, proxyBody, async ({ sse, signal }) => {
      sse.send('start', { model });
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal,
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
        if (err?.name === 'AbortError') return sse.end();
        console.error(`[proxy:ollama] internal error: ${err.message}`);
        sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
        sse.end();
      }
    });
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

  // Shared media-chat tool loop for OpenAI-compatible BYOK proxies. SenseAudio,
  // OpenAI, Azure, DeepSeek, and Ollama all speak the same /chat/completions +
  // `tools` / `tool_calls` streaming protocol, so one loop drives them all:
  // inject BYOK_MEDIA_TOOLS, stream text deltas to the client, accumulate any
  // tool_calls, run generate_image/video/audio through generateMedia (which
  // routes each model to its provider and reads media-config), feed the result
  // back as a `tool` message, and loop until the model stops calling tools.
  // Per-vendor differences are just the upstream url, auth headers, which
  // provider's BYOK key to seed into media-config, and the surface fallback
  // models used when the user neither named a model nor picked one.
  const runByokMediaChat = async (opts: {
    res: any;
    proxyBody: any;
    providerTag: string;
    url: string;
    authHeaders: Record<string, string>;
    model: string;
    /** Azure's deployment path carries the model in the URL and rejects it in
     *  the body; pass false there. Defaults to true (standard OpenAI shape). */
    includeModel?: boolean;
    systemPrompt?: unknown;
    messages?: unknown;
    maxTokens?: unknown;
    projectId: string;
    seed?: { provider: string; apiKey: string; baseUrl?: string } | null;
    surfaceDefaults?: { image?: string; video?: string; audio?: string };
    byokImageModel?: unknown;
    byokVideoModel?: unknown;
    byokAudioModel?: unknown;
  }): Promise<void> => {
    const {
      res,
      proxyBody,
      providerTag,
      url,
      authHeaders,
      model,
      includeModel = true,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      seed,
      surfaceDefaults = {},
      byokImageModel,
      byokVideoModel,
      byokAudioModel,
    } = opts;

    const workingMessages: any[] = Array.isArray(messages) ? [...messages] : [];
    if (typeof systemPrompt === 'string' && systemPrompt) {
      workingMessages.unshift({ role: 'system', content: systemPrompt });
    }

    // Media tools write into the active project's folder, so they only work
    // when the request carries a valid projectId. When it doesn't (e.g. a BYOK
    // chat outside a project), degrade to a plain LLM passthrough: no tools are
    // injected, so the model never tries to generate media it can't persist.
    const mediaEnabled =
      typeof projectId === 'string' && isSafeProjectId(projectId);

    // Tool execution context — built once per request. Media tools write into
    // `<projectsRoot>/<projectId>/` and return `/api/projects/:id/files/:name`
    // URLs that the web loads same-origin. `surfaceDefaults` are the fallback
    // when nothing is pinned and the LLM omits a model; the composer pick is
    // the per-surface default, and an explicit `model` arg from the LLM (the
    // user named one in chat) overrides both. Spread-conditional because
    // exactOptionalPropertyTypes forbids `field: undefined` on optional slots.
    const toolCtx: BYOKToolContext = {
      projectRoot: ctx.paths.PROJECT_ROOT,
      projectsRoot: ctx.paths.PROJECTS_DIR,
      projectId,
      ...(surfaceDefaults.image ? { defaultImageModel: surfaceDefaults.image } : {}),
      ...(surfaceDefaults.video ? { defaultVideoModel: surfaceDefaults.video } : {}),
      ...(surfaceDefaults.audio ? { defaultAudioModel: surfaceDefaults.audio } : {}),
      ...(isImageModel(byokImageModel) ? { composerImageModel: byokImageModel } : {}),
      ...(isVideoModel(byokVideoModel) ? { composerVideoModel: byokVideoModel } : {}),
      ...(isAudioModel(byokAudioModel) ? { composerAudioModel: byokAudioModel } : {}),
    };

    // One upstream round-trip: POST with tools, stream text deltas as they
    // arrive, accumulate tool_call fragments. Returns what to do next.
    const runTurn = async (
      sse: any,
      messagesForTurn: any[],
      signal: AbortSignal,
    ): Promise<TurnResult> => {
      const effectiveMaxTokens =
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192;
      const buildPayload = (
        tokenParam: { max_tokens: number } | { max_completion_tokens: number },
      ): any => ({
        ...(includeModel ? { model } : {}),
        messages: messagesForTurn,
        ...tokenParam,
        stream: true,
        ...(mediaEnabled ? { tools: BYOK_MEDIA_TOOLS, tool_choice: 'auto' } : {}),
      });
      const fetchUpstream = (body: any): Promise<Response> =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
          redirect: 'error',
          signal,
        });

      // Newer OpenAI/Azure chat models (GPT-5/o-series) reject max_tokens and
      // require max_completion_tokens. buildOpenAIChatTokenParam switches the
      // known families up front; the 400 retry below covers the rest (e.g.
      // Azure deployment aliases that hide the underlying model family).
      let response = await fetchUpstream(
        buildPayload(buildOpenAIChatTokenParam(model, effectiveMaxTokens)),
      );

      if (!response.ok) {
        let errorText = await response.text();
        if (response.status === 400 && isUnsupportedMaxTokensError(errorText)) {
          console.warn(
            `[proxy:${providerTag}] retrying request with max_completion_tokens model=${model}`,
          );
          response = await fetchUpstream(
            buildPayload(buildMaxCompletionTokensParam(effectiveMaxTokens)),
          );
          if (!response.ok) errorText = await response.text();
        }
        if (!response.ok) {
          console.error(
            `[proxy:${providerTag}] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
          );
          sendProxyError(sse, `Upstream error: ${response.status}`, {
            code: proxyErrorCode(response.status),
            details: errorText,
            retryable: response.status === 429 || response.status >= 500,
          });
          return { kind: 'error' };
        }
      }

      const accum: Record<number, AccumulatedToolCall> = {};
      let finishReason = '';
      let providerError = '';

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

        if (typeof delta.content === 'string' && delta.content) {
          sse.send('delta', { delta: delta.content });
        }

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
    }): Promise<{ ok: boolean; url?: string; error?: string; kind?: 'image' | 'video' | 'audio' }> => {
      const fnName = call?.function?.name ?? '';
      if (
        fnName !== 'generate_image'
        && fnName !== 'generate_video'
        && fnName !== 'generate_audio'
      ) {
        return {
          ok: false,
          error: `unknown tool: ${fnName || 'unnamed'}`,
        };
      }
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        return { ok: false, error: 'tool arguments were not valid JSON' };
      }
      if (fnName === 'generate_image') return executeGenerateImage(args, toolCtx);
      if (fnName === 'generate_video') return executeGenerateVideo(args, toolCtx);
      return executeGenerateAudio(args, toolCtx);
    };

    // Mirror the BYOK key into media-config so the media tools (which route
    // through generateMedia and read media-config) and the CLI agent path
    // (`od media generate`) both pick it up. Only seeds vendors whose key
    // actually unlocks a media API (e.g. SenseAudio, OpenAI); seedProviderIfMissing
    // is idempotent and preserves env-var-resolved keys. Awaited so the
    // credential is on disk before the first tool fires.
    if (seed && mediaEnabled) {
      try {
        const seeded = await seedProviderIfMissing(ctx.paths.PROJECT_ROOT, seed.provider, {
          apiKey: seed.apiKey,
          ...(seed.baseUrl ? { baseUrl: seed.baseUrl } : {}),
        });
        if (seeded) {
          console.log(`[proxy:${providerTag}] seeded media-config.${seed.provider} from BYOK key`);
        }
      } catch (err: unknown) {
        console.warn(
          `[proxy:${providerTag}] seed media-config failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    runByokProxy(res, proxyBody, async ({ sse, signal, run }) => {
      sse.send('start', { model });
      try {
        for (let loop = 0; loop < MAX_BYOK_TOOL_LOOPS; loop++) {
          if (run.cancelRequested) return sse.end();
          const turn = await runTurn(sse, workingMessages, signal);
          if (turn.kind === 'error') return sse.end();
          if (turn.kind === 'text_end') {
            sse.send('end', {});
            return sse.end();
          }
          // turn.kind === 'tool_calls'
          workingMessages.push(turn.assistantMessage);
          for (const call of turn.toolCalls) {
            if (run.cancelRequested) return sse.end();
            const result = await executeOneTool(call);
            // The tool result is delivered to the model as a `tool` role
            // message — a structured payload it can interpret. We also log a
            // daemon-side line so a user reporting "no image showed up" can
            // grep for the call id. The kind field picks the embedding hint:
            // markdown image for PNG, markdown link for video / audio.
            const toolName = call?.function?.name ?? 'unknown';
            if (result.ok) {
              console.log(
                `[proxy:${providerTag}] ${toolName} OK: ${call.id} → ${result.url}`,
              );
            } else {
              console.warn(
                `[proxy:${providerTag}] ${toolName} FAILED: ${call.id} — ${result.error}`,
              );
            }
            const content = result.ok
              ? result.kind === 'video'
                ? `Video generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link, e.g. [▶ Play video](${result.url}). Do NOT use markdown image syntax — the chat renderer does not embed <video> tags.`
                : result.kind === 'audio'
                  ? `Audio generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link, e.g. [▶ Play audio](${result.url}). Do NOT use markdown image syntax — the chat renderer does not embed an <audio> player.`
                  : `Image generated successfully. URL: ${result.url}. Reply to the user with: ![generated image](${result.url})`
              : result.kind === 'video'
                ? `Video generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt or a shorter duration.`
                : result.kind === 'audio'
                  ? `Audio generation failed: ${result.error}. Apologize briefly and suggest a retry, or check that the audio provider is configured in Settings → Media.`
                  : `Image generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt.`;
            workingMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content,
            });
          }
        }
        // Tool loop exhausted — refuse a further round so a misbehaving model
        // can't pin the daemon. Close gracefully; any trailing text is already
        // on the wire.
        console.warn(
          `[proxy:${providerTag}] tool loop bounded at MAX_BYOK_TOOL_LOOPS=${MAX_BYOK_TOOL_LOOPS}`,
        );
        sse.send('end', {});
        return sse.end();
      } catch (err: any) {
        if (err?.name === 'AbortError') return sse.end();
        console.error(`[proxy:${providerTag}] internal error: ${err.message}`);
        sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
        sse.end();
      }
    });
  };

  // Anthropic media chat: same idea as runByokMediaChat but for Anthropic's
  // native Messages API, whose tool protocol differs from OpenAI's. Tools are
  // declared as { name, description, input_schema }; the model returns
  // `tool_use` content blocks (id/name + a streamed `input_json_delta`); and
  // tool results are fed back as `tool_result` content blocks in a user turn.
  // Anthropic (Claude) has no media generation API of its own, so this never
  // self-seeds media-config — generate_image/video/audio route through
  // generateMedia to whatever provider the user configured in Settings → Media.
  const runAnthropicMediaChat = async (opts: {
    res: any;
    proxyBody: any;
    url: string;
    apiKey: string;
    model: string;
    systemPrompt?: unknown;
    messages?: unknown;
    maxTokens?: unknown;
    projectId: string;
    byokImageModel?: unknown;
    byokVideoModel?: unknown;
    byokAudioModel?: unknown;
  }): Promise<void> => {
    const {
      res,
      proxyBody,
      url,
      apiKey,
      model,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      byokImageModel,
      byokVideoModel,
      byokAudioModel,
    } = opts;

    const workingMessages: any[] = Array.isArray(messages) ? [...messages] : [];
    const mediaEnabled =
      typeof projectId === 'string' && isSafeProjectId(projectId);

    const toolCtx: BYOKToolContext = {
      projectRoot: ctx.paths.PROJECT_ROOT,
      projectsRoot: ctx.paths.PROJECTS_DIR,
      projectId,
      ...(isImageModel(byokImageModel) ? { composerImageModel: byokImageModel } : {}),
      ...(isVideoModel(byokVideoModel) ? { composerVideoModel: byokVideoModel } : {}),
      ...(isAudioModel(byokAudioModel) ? { composerAudioModel: byokAudioModel } : {}),
    };

    // OpenAI-shaped tool defs → Anthropic shape. The parameters object is a
    // JSON Schema in both, so it maps straight onto input_schema.
    const anthropicTools = BYOK_MEDIA_TOOLS.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const dispatchTool = async (name: string, input: any) => {
      if (name === 'generate_image') return executeGenerateImage(input || {}, toolCtx);
      if (name === 'generate_video') return executeGenerateVideo(input || {}, toolCtx);
      if (name === 'generate_audio') return executeGenerateAudio(input || {}, toolCtx);
      return { ok: false as const, error: `unknown tool: ${name || 'unnamed'}` };
    };

    type Block = { type: string; text: string; id: string; name: string; inputJson: string };
    type AnthropicTurn =
      | { kind: 'text_end' }
      | { kind: 'error' }
      | {
          kind: 'tool_calls';
          assistantMessage: any;
          toolCalls: Array<{ id: string; name: string; input: any }>;
        };

    const runTurn = async (
      sse: any,
      messagesForTurn: any[],
      signal: AbortSignal,
    ): Promise<AnthropicTurn> => {
      const payload: any = {
        model,
        max_tokens:
          typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
        messages: messagesForTurn,
        stream: true,
        ...(typeof systemPrompt === 'string' && systemPrompt
          ? { system: systemPrompt }
          : {}),
        ...(mediaEnabled ? { tools: anthropicTools } : {}),
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal,
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
        return { kind: 'error' };
      }

      const blocks: Record<number, Block> = {};
      let stopReason = '';
      let providerError = '';

      await streamUpstreamSse(response, ({ event, data }: any) => {
        if (!data) return false;
        if (event === 'error' || data.type === 'error') {
          providerError = data.error?.message || data.message || 'Anthropic upstream error';
          return true;
        }
        if (event === 'content_block_start') {
          const idx = typeof data.index === 'number' ? data.index : 0;
          const cb = data.content_block || {};
          blocks[idx] = {
            type: cb.type || 'text',
            text: cb.type === 'text' && typeof cb.text === 'string' ? cb.text : '',
            id: typeof cb.id === 'string' ? cb.id : '',
            name: typeof cb.name === 'string' ? cb.name : '',
            inputJson: '',
          };
        } else if (event === 'content_block_delta') {
          const idx = typeof data.index === 'number' ? data.index : 0;
          const d = data.delta || {};
          if (d.type === 'text_delta' && typeof d.text === 'string') {
            if (blocks[idx]) blocks[idx].text += d.text;
            if (d.text) sse.send('delta', { delta: d.text });
          } else if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
            if (blocks[idx]) blocks[idx].inputJson += d.partial_json;
          }
        } else if (event === 'message_delta') {
          if (typeof data.delta?.stop_reason === 'string') stopReason = data.delta.stop_reason;
        } else if (event === 'message_stop') {
          return true;
        }
        return false;
      });

      if (providerError) {
        sendProxyError(sse, `Provider error: ${providerError}`, { details: providerError });
        return { kind: 'error' };
      }

      const indices = Object.keys(blocks).map(Number).sort((a, b) => a - b);
      const toolUseBlocks = indices.map((i) => blocks[i]!).filter((b) => b.type === 'tool_use');
      if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
        const parseInput = (raw: string) => {
          try {
            return JSON.parse(raw || '{}');
          } catch {
            return {};
          }
        };
        // Echo the assistant turn (text + tool_use blocks) before the
        // tool_result user turn — Anthropic requires the full prior content.
        const assistantContent = indices
          .map((i) => {
            const b = blocks[i]!;
            if (b.type === 'tool_use') {
              return { type: 'tool_use', id: b.id, name: b.name, input: parseInput(b.inputJson) };
            }
            return { type: 'text', text: b.text };
          })
          .filter((b) => b.type === 'tool_use' || (typeof (b as any).text === 'string' && (b as any).text.length > 0));
        return {
          kind: 'tool_calls',
          assistantMessage: { role: 'assistant', content: assistantContent },
          toolCalls: toolUseBlocks.map((b) => ({ id: b.id, name: b.name, input: parseInput(b.inputJson) })),
        };
      }

      return { kind: 'text_end' };
    };

    runByokProxy(res, proxyBody, async ({ sse, signal, run }) => {
      sse.send('start', { model });
      try {
        for (let loop = 0; loop < MAX_BYOK_TOOL_LOOPS; loop++) {
          if (run.cancelRequested) return sse.end();
          const turn = await runTurn(sse, workingMessages, signal);
          if (turn.kind === 'error') return sse.end();
          if (turn.kind === 'text_end') {
            sse.send('end', {});
            return sse.end();
          }
          workingMessages.push(turn.assistantMessage);
          const toolResults: any[] = [];
          for (const call of turn.toolCalls) {
            if (run.cancelRequested) return sse.end();
            const result = await dispatchTool(call.name, call.input);
            const toolName = call.name || 'unknown';
            if (result.ok) {
              console.log(`[proxy:anthropic] ${toolName} OK: ${call.id} → ${result.url}`);
            } else {
              console.warn(`[proxy:anthropic] ${toolName} FAILED: ${call.id} — ${result.error}`);
            }
            const content = result.ok
              ? result.kind === 'video'
                ? `Video generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link, e.g. [▶ Play video](${result.url}). Do NOT use markdown image syntax — the chat renderer does not embed <video> tags.`
                : result.kind === 'audio'
                  ? `Audio generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link, e.g. [▶ Play audio](${result.url}). Do NOT use markdown image syntax — the chat renderer does not embed an <audio> player.`
                  : `Image generated successfully. URL: ${result.url}. Reply to the user with: ![generated image](${result.url})`
              : result.kind === 'video'
                ? `Video generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt or a shorter duration.`
                : result.kind === 'audio'
                  ? `Audio generation failed: ${result.error}. Apologize briefly and suggest a retry, or check that the audio provider is configured in Settings → Media.`
                  : `Image generation failed: ${result.error}. Apologize briefly and suggest a retry, or check that an image provider is configured in Settings → Media.`;
            toolResults.push({ type: 'tool_result', tool_use_id: call.id, content });
          }
          workingMessages.push({ role: 'user', content: toolResults });
        }
        console.warn(
          `[proxy:anthropic] tool loop bounded at MAX_BYOK_TOOL_LOOPS=${MAX_BYOK_TOOL_LOOPS}`,
        );
        sse.send('end', {});
        return sse.end();
      } catch (err: any) {
        if (err?.name === 'AbortError') return sse.end();
        console.error(`[proxy:anthropic] internal error: ${err.message}`);
        sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
        sse.end();
      }
    });
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
      byokVideoModel,
      byokAudioModel,
    } = proxyBody;
    if (!apiKey || !model) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'apiKey and model are required');
    }
    // projectId is required because the media tools write into the active
    // project's folder; a missing value means the request didn't come through
    // the chat surface.
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
      `[proxy:senseaudio] ${req.method} ${validated.parsed?.hostname ?? '?'} model=${model} project=${projectId} pin[img=${byokImageModel ?? '-'} vid=${byokVideoModel ?? '-'} aud=${byokAudioModel ?? '-'}]`,
    );

    // SenseAudio's gateway issues one key that works for /v1/chat/completions
    // and every media surface, so seed it and default each surface to the
    // SenseAudio model (this chat only has the SenseAudio key configured).
    await runByokMediaChat({
      res,
      proxyBody,
      providerTag: 'senseaudio',
      url,
      authHeaders: { Authorization: `Bearer ${apiKey}` },
      model,
      systemPrompt,
      messages,
      maxTokens,
      projectId,
      seed: { provider: 'senseaudio', apiKey, baseUrl: effectiveBaseUrl },
      surfaceDefaults: {
        image: SENSEAUDIO_DEFAULT_IMAGE_MODEL,
        video: SENSEAUDIO_DEFAULT_VIDEO_MODEL,
        audio: SENSEAUDIO_DEFAULT_AUDIO_MODEL,
      },
      byokImageModel,
      byokVideoModel,
      byokAudioModel,
    });
  });

}
