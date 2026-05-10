// Smoke tests for the Settings dialog. Two entry points:
//
//   - testProviderConnection: posts a tiny "Reply with only: ok" request to
//     a BYOK API endpoint and reports a categorized result.
//   - testAgentConnection: spawns a Local CLI adapter with the same prompt,
//     drives the existing stream parser through a collector sink, and treats
//     assistant text as proof that the CLI can run unless the text is an
//     explicit model-selection error.
//
// Both functions persist nothing — no project, no chat record, no
// media-config write. The intent is to give Settings a definite "your
// configuration works" answer without users having to send a real chat to
// discover that the API key, model, base URL, or CLI is broken.
//
// The streaming counterpart for chat lives in `server.ts` under the
// `/api/proxy/*/stream` routes; both paths share the base URL policy from
// contracts so Settings and daemon-side checks reject the same hosts.

import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getAgentDef,
  resolveAgentBin,
  spawnEnvForAgent,
} from './agents.js';
import { createCommandInvocation } from '@open-design/platform';
import { attachAcpSession } from './acp.js';
import { attachPiRpcSession } from './pi-rpc.js';
import { createClaudeStreamHandler } from './claude-stream.js';
import { createCopilotStreamHandler } from './copilot-stream.js';
import { createJsonEventStreamHandler } from './json-event-stream.js';
import { agentCliEnvForAgent, validateAgentCliEnv } from './app-config.js';
import {
  isLoopbackApiHost,
  validateBaseUrl,
  type AgentTestRequest,
  type ConnectionTestKind,
  type ConnectionTestProtocol,
  type ConnectionTestResponse,
  type ParsedBaseUrl,
  type ProviderTestRequest,
} from '@open-design/contracts/api/connectionTest';

export { validateBaseUrl } from '@open-design/contracts/api/connectionTest';

// Aggressive but not punitive — happy paths usually return in under 2 s.
const PROVIDER_TIMEOUT_MS = 12_000;
// CLI boot time is dominated by adapter auth/session restore; the heavy
// adapters (Codex, Cursor Agent) regularly take 5–10 s on a cold first
// run, so 45 s leaves headroom without making a hung child invisible.
const AGENT_TIMEOUT_MS = 45_000;
const AGENT_COMPLETION_DEBOUNCE_MS = 500;
const AGENT_KILL_GRACE_MS = 2_000;
// Truncates the assistant reply we surface in the success copy so a
// chatty model can't dump kilobytes into the inline status node.
const SAMPLE_MAX_CHARS = 120;
// Generation budget for the smoke prompt. Keep this small, but not tiny:
// reasoning models can spend the first few dozen tokens in hidden reasoning
// before producing a visible `ok`.
const PROVIDER_MAX_TOKENS = 100;
const SMOKE_PROMPT = 'Reply with only: ok';

// Catches `Bearer …`, `x-api-key`/`api-key`/`x-goog-api-key` headers, and
// `?key=…` query strings. The provider helpers all funnel error text
// through this before logging; if a vendor surfaces the key in body text
// (some do for 401s), it stays out of the daemon log too.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactSecrets(
  text: string,
  exactSecrets: Array<string | undefined | null> = [],
): string {
  if (typeof text !== 'string' || text.length === 0) return '';
  let redacted = text
    .replace(/Bearer\s+[A-Za-z0-9_\-.+/=]+/gi, 'Bearer [REDACTED]')
    .replace(/(x-api-key|api-key|x-goog-api-key)\s*[:=]\s*[^\s,;"']+/gi, '$1: [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  for (const secret of exactSecrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]');
  }
  return redacted;
}

type ProviderConnectionInput = ProviderTestRequest & { signal?: AbortSignal };
type AgentConnectionInput = AgentTestRequest & { signal?: AbortSignal };

function appendVersionedApiPath(baseUrl: string, suffix: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(pathname)
    ? `${pathname}${suffix}`
    : `${pathname}/v1${suffix}`;
  return url.toString();
}

function truncateSample(text: unknown): string {
  if (typeof text !== 'string') return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= SAMPLE_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, SAMPLE_MAX_CHARS - 1)}…`;
}

export function isSmokeOkReply(text: unknown): boolean {
  return typeof text === 'string' && text.trim().toLowerCase() === 'ok';
}

function isLikelyModelErrorText(text: string): boolean {
  return (
    /model/i.test(text) &&
    /(not found|not exist|does not exist|unknown|invalid|unsupported|not supported|not have access|no access|issue with the selected model)/i.test(
      text,
    )
  );
}

function smokeFailureDetail(sample: string): string {
  return sample
    ? `Expected smoke test reply "ok"; got "${sample}"`
    : 'Provider returned a 2xx response without assistant text';
}

function inspectProviderCompletion(
  protocol: ConnectionTestProtocol,
  data: unknown,
  requestedModel: string,
  enforceResponseModel: boolean,
): { valid: boolean; sample?: string; kind?: ConnectionTestKind; detail?: string } {
  const obj = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  if (!obj) return { valid: false };

  if (protocol === 'openai' || protocol === 'azure') {
    const responseModel = typeof obj.model === 'string' ? obj.model : '';
    if (
      protocol === 'openai' &&
      enforceResponseModel &&
      responseModel &&
      requestedModel &&
      responseModel !== requestedModel
    ) {
      return {
        valid: false,
        kind: 'not_found_model',
        detail: `Provider responded with model "${responseModel}" instead of requested "${requestedModel}".`,
      };
    }
    const choices = obj.choices;
    if (!Array.isArray(choices) || choices.length === 0) return { valid: false };
    const first = choices[0] as { finish_reason?: unknown } | undefined;
    const finishReason =
      typeof first?.finish_reason === 'string' ? first.finish_reason : '';
    return {
      valid: true,
      sample: finishReason
        ? `valid completion (${finishReason})`
        : 'valid completion',
    };
  }

  if (protocol === 'anthropic') {
    return {
      valid:
        Array.isArray((obj as { content?: unknown }).content) ||
        typeof (obj as { stop_reason?: unknown }).stop_reason === 'string',
      sample: 'valid completion',
    };
  }

  if (protocol === 'google') {
    return {
      valid: Array.isArray((obj as { candidates?: unknown }).candidates),
      sample: 'valid completion',
    };
  }

  if (protocol === 'ollama') {
    const msg = (obj as { message?: { content?: unknown } }).message;
    const hasContent = typeof msg?.content === 'string';
    return {
      valid: Array.isArray((obj as { messages?: unknown }).messages) || hasContent,
      ...(hasContent ? { sample: truncateSample(msg?.content) } : {}),
    };
  }

  return { valid: false };
}

function statusToKind(status: number, detailText = ''): ConnectionTestKind {
  if (status === 401) return 'auth_failed';
  if (status === 403) return 'forbidden';
  if (status === 404) {
    return isLikelyModelErrorText(detailText)
      ? 'not_found_model'
      : 'invalid_base_url';
  }
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_unavailable';
  return 'unknown';
}

function extractOpenAiModelIds(data: unknown): string[] {
  const items = (data as { data?: unknown }).data;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (item as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function extractProviderErrorDetail(data: unknown, rawText: string): string {
  const obj = data && typeof data === 'object' ? data : null;
  const error = obj ? (obj as { error?: unknown }).error : null;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  const message = obj ? (obj as { message?: unknown }).message : null;
  if (typeof message === 'string' && message.trim()) return message;
  return rawText.trim().slice(0, 240);
}

function networkErrorToKind(err: unknown): ConnectionTestKind {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'timeout';
    // fetch's TypeError surface for DNS/TLS/connect failures is
    // `TypeError` with a `cause` whose `code` is one of these.
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'EHOSTUNREACH' ||
      code === 'ENETUNREACH' ||
      code === 'CERT_HAS_EXPIRED' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    ) {
      return 'invalid_base_url';
    }
  }
  return 'unknown';
}

async function validateLocalOpenAiModel(
  input: ProviderTestRequest,
  parsed: ParsedBaseUrl,
  signal: AbortSignal,
  start: number,
): Promise<ConnectionTestResponse | null> {
  if (input.protocol !== 'openai' || !isLoopbackApiHost(parsed.hostname)) {
    return null;
  }

  const url = appendVersionedApiPath(String(input.baseUrl), '/models');
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${String(input.apiKey)}` },
      signal,
      redirect: 'error',
    });
  } catch {
    // Local OpenAI-compatible servers vary; if model listing is unavailable,
    // fall back to the smoke completion path instead of blocking the test.
    return null;
  }
  if (!response.ok) return null;

  let data: unknown;
  try {
    const rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    return null;
  }

  const modelIds = extractOpenAiModelIds(data);
  if (modelIds.length === 0 || modelIds.includes(input.model)) return null;
  return {
    ok: false,
    kind: 'not_found_model',
    latencyMs: Date.now() - start,
    model: input.model,
    status: response.status,
    detail: `Model "${input.model}" is not reported by the local provider.`,
  };
}

interface ProviderCallShape {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  extractText: (data: unknown) => string;
}

function buildProviderCall(input: ProviderTestRequest): ProviderCallShape {
  const baseUrl = String(input.baseUrl);
  const apiKey = String(input.apiKey);
  const model = String(input.model);
  switch (input.protocol) {
    case 'anthropic':
      return {
        url: appendVersionedApiPath(baseUrl, '/messages'),
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: {
          model,
          max_tokens: PROVIDER_MAX_TOKENS,
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: (data) => {
          const blocks = (data as { content?: unknown }).content;
          if (!Array.isArray(blocks)) return '';
          for (const block of blocks) {
            if (
              block &&
              typeof block === 'object' &&
              (block as { type?: string }).type === 'text' &&
              typeof (block as { text?: unknown }).text === 'string'
            ) {
              return (block as { text: string }).text;
            }
          }
          return '';
        },
      };
    case 'openai':
      return {
        url: appendVersionedApiPath(baseUrl, '/chat/completions'),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          max_tokens: PROVIDER_MAX_TOKENS,
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: extractOpenAIMessageText,
      };
    case 'azure': {
      const url = new URL(baseUrl);
      const basePath = url.pathname.replace(/\/+$/, '');
      const usesVersionedOpenAIPath = /\/openai\/v\d+(?:$|\/)/.test(basePath);
      const apiVersion =
        typeof input.apiVersion === 'string' && input.apiVersion.trim()
          ? input.apiVersion.trim()
          : usesVersionedOpenAIPath
            ? ''
            : '2024-10-21';
      url.pathname = usesVersionedOpenAIPath
        ? `${basePath}/chat/completions`
        : `${basePath}/openai/deployments/${encodeURIComponent(model)}/chat/completions`;
      if (usesVersionedOpenAIPath && !apiVersion) {
        url.searchParams.delete('api-version');
      }
      if (apiVersion) {
        url.searchParams.set('api-version', apiVersion);
      }
      return {
        url: url.toString(),
        headers: {
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: {
          ...(usesVersionedOpenAIPath ? { model } : {}),
          max_tokens: PROVIDER_MAX_TOKENS,
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: extractOpenAIMessageText,
      };
    }
    case 'google': {
      const trimmedBase = baseUrl.replace(/\/+$/, '');
      return {
        url: `${trimmedBase}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: {
          contents: [
            { role: 'user', parts: [{ text: SMOKE_PROMPT }] },
          ],
          generationConfig: { maxOutputTokens: PROVIDER_MAX_TOKENS },
        },
        extractText: (data) => {
          const candidates = (data as { candidates?: unknown }).candidates;
          if (!Array.isArray(candidates) || candidates.length === 0) return '';
          const parts = (candidates[0] as { content?: { parts?: unknown } })
            .content?.parts;
          if (!Array.isArray(parts)) return '';
          return parts
            .map((p: { text?: unknown }) =>
              typeof p?.text === 'string' ? p.text : '',
            )
            .join('');
        },
      };
    }
    case 'ollama': {
      const trimmedBase = baseUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
      return {
        url: `${trimmedBase}/api/chat`,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          messages: [{ role: 'user', content: SMOKE_PROMPT }],
          stream: false,
        },
        extractText: (data) => {
          const message = (data as { message?: { content?: unknown } }).message;
          if (message && typeof (message as { content?: unknown }).content === 'string') {
            return (message as { content: string }).content;
          }
          return '';
        },
      };
    }
    default:
      throw new Error(`Unknown protocol: ${(input as { protocol?: string }).protocol}`);
  }
}

// Sibling of the proxy's `extractOpenAIText` (which reads streaming
// `delta.content`). We need the non-streaming `message.content` shape
// here. Kept module-local so the chat path doesn't change.
function extractOpenAIMessageText(data: unknown): string {
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0] as
    | { message?: { content?: unknown }; text?: unknown }
    | undefined;
  if (typeof first?.message?.content === 'string') return first.message.content;
  if (typeof first?.text === 'string') return first.text;
  return '';
}

export async function testProviderConnection(
  input: ProviderConnectionInput,
): Promise<ConnectionTestResponse> {
  const start = Date.now();
  const model = String(input.model ?? '');
  const validated = validateBaseUrl(input.baseUrl);
  if (validated.error || !validated.parsed) {
    const kind: ConnectionTestKind = validated.forbidden ? 'forbidden' : 'invalid_base_url';
    return {
      ok: false,
      kind,
      latencyMs: Date.now() - start,
      model,
      detail: validated.error ?? '',
    };
  }

  let call: ProviderCallShape;
  try {
    call = buildProviderCall(input);
  } catch (err) {
    return {
      ok: false,
      kind: 'unknown',
      latencyMs: Date.now() - start,
      model,
      detail: redactSecrets(err instanceof Error ? err.message : String(err), [
        input.apiKey,
      ]),
    };
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (input.signal?.aborted) {
    controller.abort();
  } else {
    input.signal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const modelError = await validateLocalOpenAiModel(
      input,
      validated.parsed,
      controller.signal,
      start,
    );
    if (modelError) return modelError;

    const response = await fetch(call.url, {
      method: 'POST',
      headers: call.headers,
      body: JSON.stringify(call.body),
      signal: controller.signal,
      redirect: 'error',
    });
    const latencyMs = Date.now() - start;
    if (response.ok) {
      let data: unknown;
      let rawText = '';
      try {
        rawText = await response.text();
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → parse failed: ${redactSecrets(rawText.slice(0, 200), [input.apiKey])}`,
        );
        return {
          ok: false,
          kind: 'unknown',
          latencyMs,
          model,
          status: response.status,
          detail: redactSecrets(
            parseErr instanceof Error ? parseErr.message : String(parseErr),
            [input.apiKey],
          ),
        };
      }
      const completion = inspectProviderCompletion(
        input.protocol,
        data,
        model,
        isLoopbackApiHost(validated.parsed.hostname),
      );
      if (completion.kind) {
        const detail = redactSecrets(completion.detail ?? '', [input.apiKey]);
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (${completion.kind})${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind: completion.kind,
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
      const replyText = call.extractText(data);
      let rawSample = truncateSample(replyText);
      if (rawSample && isLikelyModelErrorText(rawSample)) {
        const detail = redactSecrets(
          smokeFailureDetail(rawSample),
          [input.apiKey],
        );
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (not_found_model)${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind: 'not_found_model',
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
      if (!rawSample && !completion.valid) {
        const detail = redactSecrets(
          extractProviderErrorDetail(data, rawText) ||
            smokeFailureDetail(rawSample),
          [input.apiKey],
        );
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (unexpected_sample)${detail ? ` ${detail}` : ''}`,
        );
        return {
          ok: false,
          kind: 'unknown',
          latencyMs,
          model,
          status: response.status,
          detail,
        };
      }
      if (!rawSample && completion.valid) {
        rawSample = truncateSample(completion.sample ?? 'valid completion');
      }
      const sample = redactSecrets(rawSample, [input.apiKey]);
      if (rawSample && !isSmokeOkReply(replyText)) {
        console.warn(
          `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (connected_unexpected_sample) ${sample}`,
        );
      }
      console.log(
        `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms`,
      );
      return {
        ok: true,
        kind: 'success',
        latencyMs,
        model,
        status: response.status,
        sample,
      };
    }
    // Non-2xx: read body for redacted detail, then map status → kind.
    let detailText = '';
    try {
      detailText = await response.text();
    } catch {
      // Ignore — we still report the status code.
    }
    const redactedDetail = redactSecrets(detailText.slice(0, 240), [
      input.apiKey,
    ]);
    const kind = statusToKind(response.status, redactedDetail);
    const detail =
      redactedDetail ||
      (response.status === 404
        ? 'HTTP 404 from provider; check the Base URL path.'
        : '');
    console.warn(
      `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${response.status} in ${latencyMs}ms (${kind})${detail ? ` ${detail}` : ''}`,
    );
    return {
      ok: false,
      kind,
      latencyMs,
      model,
      status: response.status,
      detail,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const kind = networkErrorToKind(err);
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[test:provider] ${input.protocol} ${validated.parsed.hostname} model=${input.model} → ${kind} in ${latencyMs}ms ${redactSecrets(message, [input.apiKey])}`,
    );
    return {
      ok: false,
      kind,
      latencyMs,
      model,
      detail: redactSecrets(message, [input.apiKey]),
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abortFromParent);
  }
}

// Build a `send(event, payload)` collector that buffers assistant text until
// the stream goes quiet. Mirrors the shape startChatRun hands to the stream
// parsers, so the parsers don't notice they're talking to a test rather than
// the real SSE writer.
type AgentSinkResult =
  | { kind: 'text'; text: string }
  | { kind: 'streamError'; error: Error };

interface AgentSink {
  send: (event: string, payload: unknown) => void;
  result: Promise<AgentSinkResult>;
  streamError: Promise<Error>;
  getText: () => string;
  getStderrTail: () => string;
  dispose: () => void;
}

export function createAgentSink(): AgentSink {
  let buffer = '';
  let stderrTail = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveResult!: (value: AgentSinkResult) => void;
  let resolveStreamError!: (value: Error) => void;
  let settled = false;
  let streamErrorSettled = false;
  const result = new Promise<AgentSinkResult>((resolve) => {
    resolveResult = (value) => {
      if (settled) return;
      settled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      resolve(value);
    };
  });
  const streamError = new Promise<Error>((resolve) => {
    resolveStreamError = (error) => {
      if (streamErrorSettled) return;
      streamErrorSettled = true;
      resolve(error);
    };
  });

  const publishStreamError = (error: Error) => {
    resolveStreamError(error);
    resolveResult({ kind: 'streamError', error });
  };

  const scheduleTextResolution = () => {
    if (settled || buffer.trim().length === 0) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      resolveResult({ kind: 'text', text: buffer });
    }, AGENT_COMPLETION_DEBOUNCE_MS);
    debounceTimer.unref?.();
  };

  const consumeText = (text: string) => {
    if (typeof text !== 'string' || text.length === 0) return;
    buffer += text;
    scheduleTextResolution();
  };

  const send = (event: string, payload: unknown) => {
    const data = (payload ?? {}) as Record<string, unknown>;
    if (event === 'error') {
      const message =
        typeof data.message === 'string'
          ? data.message
          : typeof (data as { error?: { message?: string } }).error?.message === 'string'
            ? (data as { error: { message: string } }).error.message
            : 'agent stream error';
      publishStreamError(new Error(message));
      return;
    }
    if (event === 'agent') {
      const type = data.type;
      if (type === 'error') {
        const message =
          typeof data.message === 'string' ? data.message : 'agent stream error';
        publishStreamError(new Error(message));
        return;
      }
      const delta = data.delta;
      const text = data.text;
      if (type === 'text_delta' && typeof delta === 'string') {
        consumeText(delta);
      } else if (type === 'text' && typeof text === 'string') {
        consumeText(text);
      }
      return;
    }
    if (event === 'stdout') {
      const chunk = data.chunk;
      if (typeof chunk === 'string') consumeText(chunk);
      return;
    }
    if (event === 'stderr') {
      const chunk = data.chunk;
      if (typeof chunk === 'string') {
        stderrTail = (stderrTail + chunk).slice(-400);
      }
      return;
    }
    // Ignore 'start', 'status', 'end', 'tool_use', 'thinking', etc. —
    // they don't carry assistant prose.
  };

  return {
    send,
    result,
    streamError,
    getText: () => buffer,
    getStderrTail: () => stderrTail,
    dispose: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}

interface AgentSpawnHandle {
  child: ReturnType<typeof spawn>;
  acpSession?: { hasFatalError?: () => boolean } | null;
}

function attachAgentStreamHandlers(
  def: { streamFormat?: string; eventParser?: string; id: string; promptViaStdin?: boolean },
  child: ReturnType<typeof spawn>,
  prompt: string,
  cwd: string,
  model: string | undefined,
  send: (event: string, payload: unknown) => void,
): AgentSpawnHandle {
  let acpSession: { hasFatalError?: () => boolean } | null = null;
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  if (def.streamFormat === 'claude-stream-json') {
    const claude = createClaudeStreamHandler((ev: unknown) => send('agent', ev));
    child.stdout?.on('data', (chunk: string) => claude.feed(chunk));
    child.on('close', () => claude.flush());
  } else if (def.streamFormat === 'copilot-stream-json') {
    const copilot = createCopilotStreamHandler((ev: unknown) => send('agent', ev));
    child.stdout?.on('data', (chunk: string) => copilot.feed(chunk));
    child.on('close', () => copilot.flush());
  } else if (def.streamFormat === 'pi-rpc') {
    acpSession = attachPiRpcSession({
      child,
      prompt,
      cwd,
      model: model ?? null,
      send,
      imagePaths: [],
    });
  } else if (def.streamFormat === 'acp-json-rpc') {
    acpSession = attachAcpSession({
      child,
      prompt,
      cwd,
      model: model ?? null,
      mcpServers: [],
      send,
    });
  } else if (def.streamFormat === 'json-event-stream') {
    const handler = createJsonEventStreamHandler(
      def.eventParser || def.id,
      (ev: unknown) => {
        const data = (ev ?? {}) as { type?: unknown; message?: unknown };
        if (data.type === 'error') {
          send('error', {
            message:
              typeof data.message === 'string'
                ? data.message
                : 'agent stream error',
          });
          return;
        }
        send('agent', ev);
      },
    );
    child.stdout?.on('data', (chunk: string) => handler.feed(chunk));
    child.on('close', () => handler.flush());
  } else {
    child.stdout?.on('data', (chunk: string) => send('stdout', { chunk }));
  }
  child.stderr?.on('data', (chunk: string) => send('stderr', { chunk }));
  return { child, acpSession };
}

type AgentChild = ReturnType<typeof spawn>;
type AgentChildExit =
  | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
  | { kind: 'spawnError'; error: Error };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

export async function testAgentConnection(
  input: AgentConnectionInput,
): Promise<ConnectionTestResponse> {
  const start = Date.now();
  const model =
    typeof input.model === 'string' && input.model.trim()
      ? input.model.trim()
      : 'default';
  const def = getAgentDef(input.agentId);
  if (!def) {
    return {
      ok: false,
      kind: 'agent_not_installed',
      latencyMs: Date.now() - start,
      model,
      agentName: input.agentId,
      detail: `Unknown agent id: ${input.agentId}`,
    };
  }
  const configuredAgentEnv = agentCliEnvForAgent(
    validateAgentCliEnv(input.agentCliEnv),
    input.agentId,
  );
  const resolvedBin = resolveAgentBin(input.agentId, configuredAgentEnv);
  if (!resolvedBin) {
    return {
      ok: false,
      kind: 'agent_not_installed',
      latencyMs: Date.now() - start,
      model,
      agentName: def.name,
    };
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-'));
  let child: AgentChild | null = null;
  let childExit: Promise<AgentChildExit> | null = null;
  let childClosed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortHandler: (() => void) | null = null;
  const sink = createAgentSink();

  const resultFromAgentText = (text: string): ConnectionTestResponse => {
    const latencyMs = Date.now() - start;
    const rawSample = truncateSample(text);
    const sample = redactSecrets(rawSample);
    if (rawSample && isLikelyModelErrorText(rawSample)) {
      const detail = redactSecrets(smokeFailureDetail(rawSample));
      console.warn(
        `[test:agent] ${def.name} → not_found_model: ${detail}`,
      );
      return {
        ok: false,
        kind: 'not_found_model',
        latencyMs,
        model,
        agentName: def.name,
        detail,
      };
    }
    if (!isSmokeOkReply(text)) {
      console.warn(
        `[test:agent] ${def.name} → connected_unexpected_sample: ${sample}`,
      );
    }
    console.log(`[test:agent] ${def.name} → ok in ${(latencyMs / 1000).toFixed(1)}s`);
    return {
      ok: true,
      kind: 'success',
      latencyMs,
      model,
      agentName: def.name,
      sample,
    };
  };

  const resultFromStreamError = (error: unknown): ConnectionTestResponse => {
    const latencyMs = Date.now() - start;
    const detail = redactSecrets(
      error instanceof Error ? error.message : String(error),
    );
    if (detail && isLikelyModelErrorText(detail)) {
      console.warn(
        `[test:agent] ${def.name} → not_found_model: ${detail}`,
      );
      return {
        ok: false,
        kind: 'not_found_model',
        latencyMs,
        model,
        agentName: def.name,
        detail,
      };
    }
    console.warn(
      `[test:agent] ${def.name} → stream_error: ${detail}`,
    );
    return {
      ok: false,
      kind: 'agent_spawn_failed',
      latencyMs,
      model,
      agentName: def.name,
      detail,
    };
  };

  const resultFromCancellation = (
    kind: 'timeout' | 'aborted',
  ): ConnectionTestResponse => {
    const latencyMs = Date.now() - start;
    console.warn(`[test:agent] ${def.name} → ${kind} in ${(latencyMs / 1000).toFixed(1)}s`);
    return {
      ok: false,
      kind: 'timeout',
      latencyMs,
      model,
      agentName: def.name,
    };
  };

  try {
    let args: string[];
    try {
      args = def.buildArgs(
        SMOKE_PROMPT,
        [],
        [],
        { model: input.model ?? null, reasoning: input.reasoning ?? null },
        { cwd: tempDir },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        kind: 'agent_spawn_failed',
        latencyMs: Date.now() - start,
        model,
        agentName: def.name,
        detail: redactSecrets(detail),
      };
    }
    const stdinMode =
      def.promptViaStdin || def.streamFormat === 'acp-json-rpc' ? 'pipe' : 'ignore';
    const env = spawnEnvForAgent(
      input.agentId,
      {
        ...process.env,
        ...(def.env || {}),
      },
      configuredAgentEnv,
    );
    const invocation = createCommandInvocation({
      command: resolvedBin,
      args,
      env,
    });
    child = spawn(invocation.command, invocation.args, {
      env,
      stdio: [stdinMode, 'pipe', 'pipe'],
      cwd: tempDir,
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    childExit = new Promise<AgentChildExit>((resolve) => {
      child!.once('error', (err) => {
        childClosed = true;
        resolve({ kind: 'spawnError', error: err });
      });
      child!.once('close', (code, signal) => {
        childClosed = true;
        resolve({ kind: 'exit', code, signal });
      });
    });

    const { acpSession } = attachAgentStreamHandlers(
      def,
      child,
      SMOKE_PROMPT,
      tempDir,
      input.model,
      sink.send,
    );

    const resultFromChildExit = (
      winner: AgentChildExit,
    ): ConnectionTestResponse => {
      if (winner.kind === 'spawnError') {
        const latencyMs = Date.now() - start;
        const detail = redactSecrets(winner.error.message);
        const errnoCode = (winner.error as NodeJS.ErrnoException).code;
        const isMissing = errnoCode === 'ENOENT';
        console.warn(
          `[test:agent] ${def.name} → spawn_failed: ${detail}`,
        );
        return {
          ok: false,
          kind: isMissing ? 'agent_not_installed' : 'agent_spawn_failed',
          latencyMs,
          model,
          agentName: def.name,
          detail,
        };
      }

      const latencyMs = Date.now() - start;
      const buffered = sink.getText().trim();
      const exitedCleanly = winner.code === 0 && !winner.signal;
      if (buffered) {
        const rawSample = truncateSample(buffered);
        if (rawSample && isLikelyModelErrorText(rawSample)) {
          return resultFromAgentText(buffered);
        }
        if (exitedCleanly) return resultFromAgentText(buffered);
      }
      const stderrTail = sink.getStderrTail().trim();
      const acpFatal = Boolean(acpSession?.hasFatalError?.());
      const detail = redactSecrets(
        [
          winner.code != null ? `exit ${winner.code}` : null,
          winner.signal ? `signal ${winner.signal}` : null,
          stderrTail ? `stderr: ${stderrTail.slice(-200)}` : null,
          buffered ? `stdout: ${buffered.slice(-200)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      const label = buffered ? 'exit_failed' : 'no_text';
      console.warn(
        `[test:agent] ${def.name} → ${label} (${detail || 'no detail'})`,
      );
      return {
        ok: false,
        kind: acpFatal || !exitedCleanly ? 'agent_spawn_failed' : 'unknown',
        latencyMs,
        model,
        agentName: def.name,
        detail: detail || 'Agent exited without producing assistant text',
      };
    };

    if (def.promptViaStdin && child.stdin && def.streamFormat !== 'pi-rpc') {
      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EPIPE') {
          sink.send('error', {
            message: `stdin: ${err.message}`,
          });
        }
      });
      child.stdin.end(SMOKE_PROMPT, 'utf8');
    }
    const cancellationPromise = new Promise<{ kind: 'timeout' } | { kind: 'aborted' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), AGENT_TIMEOUT_MS);
      abortHandler = () => resolve({ kind: 'aborted' });
      if (input.signal?.aborted) {
        abortHandler();
      } else {
        input.signal?.addEventListener('abort', abortHandler, { once: true });
      }
    });
    const streamError = sink.streamError.then((error) => ({
      kind: 'streamError' as const,
      error,
    }));

    const winner = await Promise.race([
      sink.result,
      childExit,
      cancellationPromise,
    ]);

    if (winner.kind === 'text') {
      const completion = await Promise.race([
        streamError,
        childExit,
        cancellationPromise,
      ]);
      if (completion.kind === 'streamError') {
        return resultFromStreamError(completion.error);
      }
      if (completion.kind === 'timeout' || completion.kind === 'aborted') {
        return resultFromCancellation(completion.kind);
      }
      return resultFromChildExit(completion);
    }
    if (winner.kind === 'streamError') {
      return resultFromStreamError(winner.error);
    }
    if (winner.kind === 'timeout' || winner.kind === 'aborted') {
      return resultFromCancellation(winner.kind);
    }
    return resultFromChildExit(winner);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      kind: 'agent_spawn_failed',
      latencyMs: Date.now() - start,
      model,
      agentName: def.name,
      detail: redactSecrets(detail),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (abortHandler) {
      input.signal?.removeEventListener('abort', abortHandler);
    }
    sink.dispose();
    if (child && !childClosed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already gone — nothing to do.
      }
      const closedAfterTerm = childExit
        ? await Promise.race([
            childExit.then(() => true),
            delay(AGENT_KILL_GRACE_MS).then(() => false),
          ])
        : false;
      if (!closedAfterTerm && !childClosed) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone — nothing to do.
        }
        if (childExit) {
          await Promise.race([
            childExit.catch(() => null),
            delay(AGENT_KILL_GRACE_MS),
          ]);
        }
      }
    }
    await fsp
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => {
        // Best-effort cleanup; the OS reaps /tmp eventually.
      });
  }
}
