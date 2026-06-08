/**
 * HTTP runtime invocation — the non-spawn sibling of
 * `apps/daemon/src/runtimes/invocation.ts`. Used when a runtime's
 * `bin` field is the sentinel `HTTP_RUNTIME_BIN`; the spawn layer
 * in `server.ts` branches on this and routes here instead of
 * `child_process.spawn`.
 *
 * Two HTTP runtimes ship today:
 *   - `anthropic` — Anthropic Messages API (also usable against
 *     third-party proxies that speak the same wire format, e.g.
 *     `https://api.deepseek.com/anthropic`).
 *   - `openai-compatible` — OpenAI Chat Completions API (usable
 *     against DeepSeek's main endpoint, OpenRouter, GLM, vLLM,
 *     Ollama, etc.).
 *
 * The two share the entire HTTP plumbing — baseUrl validation, SSRF
 * guard, proxy dispatcher, AbortController + total/first-byte
 * timeouts, fetch, stream reading, empty-stream guard, lifecycle
 * wiring. The only thing that varies is the request body shape and
 * the SSE parser, both of which a "provider" descriptor supplies.
 * `runHttpAgent` is the generic runner; `invokeAnthropicAgent` and
 * `invokeOpenaiAgent` are thin wrappers that pin a provider.
 *
 * Adding a third HTTP runtime (e.g. a Google Gemini adapter) means
 * writing the parser + def + provider, then exporting a new
 * `invokeXxxAgent` from this file. The dispatch in `server.ts`
 * keys on `def.streamFormat`; no other plumbing changes.
 */

import { Readable } from 'node:stream';
import { proxyDispatcherRequestInit, validateBaseUrlResolved } from '../connectionTest.js';
import { createAnthropicStreamHandler, type AnthropicEventSink } from '../anthropic-sse.js';
import { createOpenaiStreamHandler, type OpenaiEventSink } from '../openai-sse.js';
import {
  resolveAnthropicConfig,
  type AnthropicRuntimeConfig,
} from './defs/anthropic.js';
import {
  resolveOpenaiConfig,
  type OpenaiRuntimeConfig,
} from './defs/openai-compatible.js';
import type { RuntimeAgentDef } from './types.js';

export type HttpInvocationLifecycle = {
  /** Fires once per run after the request URL is resolved, before the body is sent. */
  onStart: (info: { runId: string; agentId: string; bin: string; streamFormat: string }) => void;
  /** Fires for every chunk read from the response body. */
  onActivity: () => void;
  /**
   * Fires for every parsed SSE event. The HTTP path has no separate
   * "first token" signal — the consumer's `onEvent` callback
   * (typically `sendAgentEvent` in server.ts) handles first-token
   * stamping via its own `noteFirstTokenFromAgentEvent` logic, keyed
   * on the event's `type` field.
   */
  onEvent: (event: Record<string, unknown>) => void;
  /** Fires when the request fails before `onDone` (network, abort, 4xx/5xx body, etc.). */
  onError: (err: Error) => void;
  /** Fires once the response body is fully drained, after `onEvent`/`onError`. */
  onDone: (info: {
    stopReason: string | null;
    httpStatus: number;
    usage: { input_tokens?: number; output_tokens?: number } | null;
  }) => void;
  /** Returns true if the caller wants the request aborted (inactivity, role marker, etc.). */
  shouldAbort: () => boolean;
};

export interface HttpInvocationInput {
  def: RuntimeAgentDef;
  prompt: string;
  model: string | null;
  /** Opaque id the consumer wants to see in `onStart`. */
  runId: string;
  env: NodeJS.ProcessEnv;
  lifecycle: HttpInvocationLifecycle;
  /** HTTP request body timeout in ms. Defaults to 10 minutes. */
  totalTimeoutMs?: number;
  /** First-byte timeout in ms. Defaults to 90s (longer than deepseek cold start). */
  firstByteTimeoutMs?: number;
}

const DEFAULT_TOTAL_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 90_000;

/** Provider-agnostic resolved HTTP config. The wire format (URL path,
 *  body shape, parser) is provider-specific; this struct carries
 *  everything `runHttpAgent` needs to assemble the request. */
interface ResolvedHttpConfig {
  baseUrl: string;
  model: string;
  customHeaders: ReadonlyArray<readonly [string, string]>;
}

/** Provider descriptor: a tuple of "resolve config" + "build body" +
 *  "parse stream". Each adapter (anthropic, openai, future gemini…)
 *  supplies one of these. */
export interface HttpInvocationProvider {
  /** Resolve the runtime's HTTP config from env. Returns null when
   *  any required env var is missing — the caller surfaces a
   *  specific error using `missingEnvMessage`. */
  resolveConfig(env: NodeJS.ProcessEnv): ResolvedHttpConfig | null;
  /** Per-provider error message surfaced when env is incomplete.
   *  Lives on the provider (not the resolved config) so the message
   *  is available even when `resolveConfig` returns null. */
  missingEnvMessage: string;
  /** Build the JSON request body for the runtime's protocol. The
   *  Anthropic Messages API and OpenAI Chat Completions API both
   *  take `{ model, messages, stream, max_tokens, ... }` but the
   *  exact field names and required fields differ. */
  buildRequestBody(args: { model: string; prompt: string }): string;
  /** Build the path appended to the baseUrl — e.g. `/v1/messages`
   *  for Anthropic, `/v1/chat/completions` for OpenAI. */
  requestPath: string;
  /** Factory for the SSE/JSON parser. The returned handler exposes
   *  `feed(chunk)` for raw response bytes and `counters()` for
   *  diagnostics. The handler is responsible for emitting
   *  `status / text_delta / tool_use / usage / error` events through
   *  the supplied sink, in the same shape the streaming consumer in
   *  `server.ts` already understands. */
  createStreamHandler(sink: HttpStreamEventSink): {
    feed: (chunk: string) => void;
    counters: () => { sseEventCount: number };
  };
}

/** Sink the provider's parser writes into. Mirrors the
 *  AnthropicEventSink / OpenaiEventSink type alias so the parser
 *  implementations stay interchangeable. */
export type HttpStreamEventSink = (event: Record<string, unknown>) => void;

/**
 * POST the prompt to a provider-specific endpoint and stream the
 * SSE/JSON response back through the lifecycle callbacks. Returns
 * the HTTP status (or 0 on network failure) so the caller can decide
 * whether to mark the run as failed or as degraded.
 *
 * This is the shared core used by `invokeAnthropicAgent` and
 * `invokeOpenaiAgent`. Most runtimes should call one of those
 * wrappers, not this directly.
 */
export async function runHttpAgent(
  input: HttpInvocationInput,
  provider: HttpInvocationProvider,
): Promise<{ httpStatus: number; error: Error | null }> {
  // All error paths funnel through `reportError` so a multi-failure
  // run (e.g. baseUrl rejected AND fetch rejected) only fires
  // `lifecycle.onError` once. `onDone` always fires exactly once at
  // the end, regardless of which error path was taken.
  let onErrorFired = false;
  const reportError = (err: Error) => {
    if (onErrorFired) return;
    onErrorFired = true;
    input.lifecycle.onError(err);
  };

  const cfg = provider.resolveConfig(input.env);
  if (!cfg) {
    const err = new Error(provider.missingEnvMessage);
    reportError(err);
    input.lifecycle.onDone({ stopReason: null, httpStatus: 0, usage: null });
    return { httpStatus: 0, error: err };
  }

  // Resolve the baseUrl to a single concrete address so a public
  // DNS name pointing at an internal address (e.g. an attacker-
  // controlled domain) can't smuggle a request to a private IP.
  // Loopback and literal-IP hosts short-circuit; for everything
  // else we accept the resolved address as long as DNS succeeded.
  const baseUrlCheck = await validateBaseUrlResolved(cfg.baseUrl);
  if (baseUrlCheck.error) {
    const err = new Error(`baseUrl rejected: ${baseUrlCheck.error}`);
    reportError(err);
    input.lifecycle.onDone({ stopReason: null, httpStatus: 0, usage: null });
    return { httpStatus: 0, error: err };
  }

  // Honor the corporate-proxy dispatcher the same way every other
  // daemon HTTP call site does. Bypassing it would silently break
  // installs behind HTTPS_PROXY/HTTP_PROXY.
  const proxy = proxyDispatcherRequestInit(input.env);

  const url = `${cfg.baseUrl}${provider.requestPath}`;
  const body = provider.buildRequestBody({ model: input.model ?? cfg.model, prompt: input.prompt });

  const totalTimeoutMs = input.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const firstByteTimeoutMs = input.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS;
  const ac = new AbortController();
  const totalTimer = setTimeout(
    () => ac.abort(new Error('total timeout exceeded')),
    totalTimeoutMs,
  );

  input.lifecycle.onStart({
    runId: input.runId,
    agentId: input.def.id,
    bin: input.def.bin,
    streamFormat: input.def.streamFormat,
  });

  let httpStatus = 0;
  let stopReason: string | null = null;
  let usage: { input_tokens?: number; output_tokens?: number } | null = null;
  const streamHandler = provider.createStreamHandler(((ev: Record<string, unknown>) => {
    if (input.lifecycle.shouldAbort()) {
      ac.abort(new Error('aborted by caller'));
      return;
    }
    if (ev.type === 'usage' && typeof ev === 'object') {
      // Build the usage object conditionally so absent token counts
      // stay absent (exactOptionalPropertyTypes forbids `key: undefined`).
      const next: { input_tokens?: number; output_tokens?: number } = {};
      if (typeof ev.input_tokens === 'number') next.input_tokens = ev.input_tokens;
      if (typeof ev.output_tokens === 'number') next.output_tokens = ev.output_tokens;
      usage = next;
    } else if (ev.type === 'status' && typeof ev === 'object') {
      const sr = (ev as Record<string, unknown>).stop_reason;
      if (typeof sr === 'string') stopReason = sr;
    }
    input.lifecycle.onEvent(ev);
  }));

  let error: Error | null = null;
  try {
    const headersObj: Record<string, string> = {};
    for (const [name, value] of cfg.customHeaders) {
      headersObj[name] = value;
    }
    const res = await fetch(url, {
      method: 'POST',
      ...proxy.requestInit,
      headers: headersObj,
      body,
      signal: ac.signal,
    });
    httpStatus = res.status;
    if (!res.ok) {
      const text = await res.text();
      error = new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
      reportError(error);
    } else if (!res.body) {
      error = new Error('HTTP response had no body');
      reportError(error);
    } else {
      // First-byte timer: if the first chunk doesn't arrive within
      // firstByteTimeoutMs, abort. Mirrors what the spawn-pipe path
      // does for "child started but never wrote stdout".
      let firstByteSeen = false;
      const firstByteTimer = setTimeout(() => {
        if (!firstByteSeen) ac.abort(new Error(`first-byte timeout (${firstByteTimeoutMs}ms)`));
      }, firstByteTimeoutMs);

      const readable = Readable.fromWeb(res.body as never);
      let streamError: Error | null = null;

      readable.on('data', (chunk: Buffer | string) => {
        if (!firstByteSeen) {
          firstByteSeen = true;
          clearTimeout(firstByteTimer);
        }
        if (input.lifecycle.shouldAbort()) {
          ac.abort(new Error('aborted by caller'));
          readable.destroy();
          return;
        }
        input.lifecycle.onActivity();
        // Feed the chunk raw; the parser owns its own buffer. Feeding
        // the accumulated outer buffer would be O(n²) over the
        // response body.
        streamHandler.feed(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      });
      // Resolve on the first of {end, error, close} so the function
      // returns deterministically — earlier versions hung forever on
      // socket error or proxy reset because they only listened for
      // `end`. The readable's actual error is captured into
      // `streamError` and surfaced after the await.
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(firstByteTimer);
          resolve();
        };
        if (readable.readableEnded) return done();
        readable.once('end', done);
        readable.once('close', done);
        readable.once('error', (err) => {
          streamError = err;
          done();
        });
      });
      if (streamError) {
        error = streamError;
        reportError(streamError);
      } else if (!streamHandler.counters().sseEventCount) {
        // 200 OK with a body that contained no SSE frames. The
        // provider is non-conforming or the response was truncated
        // before the first event — surface a concrete reason so the
        // caller can distinguish this from a hard transport error.
        const empty = new Error('stream ended before any SSE event arrived');
        error = empty;
        reportError(empty);
      }
    }
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    reportError(error);
  } finally {
    clearTimeout(totalTimer);
    await proxy.close();
  }

  input.lifecycle.onDone({ stopReason, httpStatus, usage });
  return { httpStatus, error };
}

/* ------------------------------------------------------------------ *
 * Anthropic provider
 * ------------------------------------------------------------------ */

const ANTHROPIC_MISSING_ENV =
  'anthropic runtime requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN (or ANTHROPIC_API_KEY) in env';

function anthropicProviderConfigToResolved(cfg: AnthropicRuntimeConfig): ResolvedHttpConfig {
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    customHeaders: cfg.customHeaders,
  };
}

export const anthropicHttpProvider: HttpInvocationProvider = {
  resolveConfig: (env) => {
    const cfg = resolveAnthropicConfig(env);
    return cfg ? anthropicProviderConfigToResolved(cfg) : null;
  },
  missingEnvMessage: ANTHROPIC_MISSING_ENV,
  requestPath: '/v1/messages',
  buildRequestBody: ({ model, prompt }) =>
    JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  createStreamHandler: (sink: HttpStreamEventSink) => {
    const handler = createAnthropicStreamHandler(sink as AnthropicEventSink);
    return { feed: handler.feed, counters: handler.counters };
  },
};

/**
 * POST the prompt to an Anthropic-compatible endpoint and stream
 * the SSE response back through the lifecycle callbacks. Returns
 * the HTTP status (or 0 on network failure) so the caller can
 * decide whether to mark the run as failed or as degraded.
 */
export function invokeAnthropicAgent(
  input: HttpInvocationInput,
): Promise<{ httpStatus: number; error: Error | null }> {
  return runHttpAgent(input, anthropicHttpProvider);
}

/* ------------------------------------------------------------------ *
 * OpenAI-compatible provider
 * ------------------------------------------------------------------ */

const OPENAI_MISSING_ENV =
  'openai-compatible runtime requires OPENAI_BASE_URL and OPENAI_API_KEY (or DEEPSEEK_API_KEY) in env';

function openaiProviderConfigToResolved(cfg: OpenaiRuntimeConfig): ResolvedHttpConfig {
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    customHeaders: cfg.customHeaders,
  };
}

export const openaiHttpProvider: HttpInvocationProvider = {
  resolveConfig: (env) => {
    const cfg = resolveOpenaiConfig(env);
    return cfg ? openaiProviderConfigToResolved(cfg) : null;
  },
  missingEnvMessage: OPENAI_MISSING_ENV,
  requestPath: '/v1/chat/completions',
  buildRequestBody: ({ model, prompt }) =>
    JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  createStreamHandler: (sink: HttpStreamEventSink) => {
    const handler = createOpenaiStreamHandler(sink as OpenaiEventSink);
    return { feed: handler.feed, counters: handler.counters };
  },
};

/**
 * POST the prompt to an OpenAI-compatible endpoint and stream the
 * SSE response back through the lifecycle callbacks. Returns the
 * HTTP status (or 0 on network failure) so the caller can decide
 * whether to mark the run as failed or as degraded.
 *
 * Today the only wired consumer is `openai-compatible`, but any
 * OpenAI-protocol upstream works (DeepSeek, OpenRouter, GLM, vLLM,
 * Ollama, etc.). Point `OPENAI_BASE_URL` at the provider root
 * (no trailing `/v1` — the runner appends `/v1/chat/completions`).
 */
export function invokeOpenaiAgent(
  input: HttpInvocationInput,
): Promise<{ httpStatus: number; error: Error | null }> {
  return runHttpAgent(input, openaiHttpProvider);
}

/**
 * Backwards-compatible alias for the previous Anthropic-only name.
 * Older call sites that import `invokeHttpAgent` keep working; new
 * code should prefer the explicit `invokeAnthropicAgent` /
 * `invokeOpenaiAgent` names to make the wire format unambiguous.
 */
export const invokeHttpAgent = invokeAnthropicAgent;
