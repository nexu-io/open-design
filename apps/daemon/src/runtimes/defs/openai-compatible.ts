/**
 * OpenAI Chat Completions API runtime adapter.
 *
 * `openai-compatible` is a non-binary runtime: it talks to an
 * OpenAI-protocol HTTP endpoint directly using `fetch` + SSE,
 * bypassing any local CLI / TUI. The wire format is the de-facto
 * standard for OpenAI, DeepSeek, OpenRouter, GLM, vLLM, Ollama,
 * and a long tail of self-hosted gateways — so the user points this
 * runtime at any of them by overriding `OPENAI_BASE_URL`.
 *
 * The runtime is config-driven via env vars. All of them are read
 * at invocation time (not at module load) so a project-scoped
 * override can land later without a daemon restart. Today only the
 * global env is honored; per-project config is a P0 follow-up.
 *
 * Required env:
 *   OPENAI_BASE_URL  — provider root, e.g. https://api.deepseek.com
 *                      (no trailing `/v1`; the runner appends
 *                      `/v1/chat/completions`)
 *   OPENAI_API_KEY   — Bearer token. Aliases: DEEPSEEK_API_KEY,
 *                      OPENAI_AUTH_TOKEN
 *   OPENAI_MODEL     — model id, e.g. `deepseek-chat` or
 *                      `deepseek-v4-pro[1m]`. Aliases: DEEPSEEK_MODEL
 *
 * Optional env:
 *   OPENAI_CUSTOM_HEADERS — semicolon-`Name: Value` pairs merged into
 *                           every outbound request (mirrors the
 *                           Anthropic adapter's `ANTHROPIC_CUSTOM_HEADERS`).
 *
 * The sibling `anthropic` runtime can point at the same provider
 * through `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` —
 * DeepSeek happens to expose both protocols, but most OpenAI-only
 * providers do not. Pick the adapter that matches your upstream.
 *
 * Settings exposure: the picker is intentionally NOT surfaced in
 * Settings → Agents as the only adapter — that picker is for
 * installed binaries. Instead it shows up labeled
 * "OpenAI-compatible API (HTTP)" with a hint that baseUrl / apiKey
 * are read from env.
 */

import { envValue } from '../../claude-diagnostics.js';
import { HTTP_RUNTIME_BIN, OPENAI_SSE_FORMAT } from '../sentinels.js';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

const FALLBACK_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['content-type', 'application/json'],
  ['accept', 'text/event-stream'],
];

function parseCustomHeaders(raw: string | null): ReadonlyArray<readonly [string, string]> {
  if (!raw) return [];
  return raw
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const colon = pair.indexOf(':');
      if (colon < 0) return [pair.trim(), ''] as const;
      return [pair.slice(0, colon).trim(), pair.slice(colon + 1).trim()] as const;
    })
    .filter(([name]) => name.length > 0);
}

export const openaiCompatibleAgentDef: RuntimeAgentDef = {
  id: 'openai-compatible',
  name: 'OpenAI-compatible API (HTTP)',
  // Sentinel: signals to the launch layer this is a non-binary
  // runtime. The streaming consumer in server.ts dispatches to the
  // HTTP invocation path when it sees this value.
  bin: HTTP_RUNTIME_BIN,
  versionArgs: [],
  // No models subcommand for the HTTP path. The picker uses these
  // as fallback labels only; the user types whatever model id
  // their upstream provider accepts.
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'deepseek-chat', label: 'deepseek-chat' },
    { id: 'deepseek-reasoner', label: 'deepseek-reasoner' },
  ] satisfies RuntimeModelOption[],
  // No argv: the prompt travels in the HTTP body.
  buildArgs: () => [],
  // The streaming consumer in server.ts routes this to the
  // OpenAI Chat Completions SSE parser (apps/daemon/src/openai-sse.ts).
  streamFormat: OPENAI_SSE_FORMAT,
  // No env defaults — the user configures these per env.
  env: {},
};

export interface OpenaiRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  customHeaders: ReadonlyArray<readonly [string, string]>;
}

/**
 * Resolve the runtime's HTTP config from the daemon's process env.
 * Returns null when any required env var is missing so the caller
 * can surface an actionable error before burning a run. Env lookup
 * is case-insensitive (Windows env keys preserve the case the user
 * exported; Linux normalises to UPPER, so a hard-coded `OPENAI_*`
 * would miss `Openai_Base_Url` on Windows).
 *
 * Aliases: `DEEPSEEK_API_KEY` is accepted alongside `OPENAI_API_KEY`
 * because DeepSeek users overwhelmingly export their key under the
 * provider-specific name. Same for `DEEPSEEK_MODEL`. These aliases
 * are not advertised in the UI; they're a power-user convenience.
 */
export function resolveOpenaiConfig(env: NodeJS.ProcessEnv = process.env): OpenaiRuntimeConfig | null {
  const baseUrl = envValue(env as Record<string, unknown>, 'OPENAI_BASE_URL');
  // OPENAI_API_KEY wins; DEEPSEEK_API_KEY / OPENAI_AUTH_TOKEN are aliases.
  const apiKey =
    envValue(env as Record<string, unknown>, 'OPENAI_API_KEY') ??
    envValue(env as Record<string, unknown>, 'DEEPSEEK_API_KEY') ??
    envValue(env as Record<string, unknown>, 'OPENAI_AUTH_TOKEN');
  const model =
    envValue(env as Record<string, unknown>, 'OPENAI_MODEL') ??
    envValue(env as Record<string, unknown>, 'DEEPSEEK_MODEL') ??
    'deepseek-chat';
  const customHeadersRaw = envValue(env as Record<string, unknown>, 'OPENAI_CUSTOM_HEADERS');

  if (!baseUrl) return null;
  if (!apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    customHeaders: [
      ...FALLBACK_HEADERS,
      ['authorization', `Bearer ${apiKey}`],
      ...parseCustomHeaders(customHeadersRaw),
    ],
  };
}
