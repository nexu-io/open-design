/**
 * Anthropic Messages API runtime adapter.
 *
 * `anthropic` is a non-binary runtime: it talks to an Anthropic-
 * compatible HTTP endpoint directly using `fetch` + SSE, bypassing
 * any local CLI / TUI. The upstream CLI-shaped adapters (claude,
 * codex, deepseek, …) all need a binary on PATH; the deepseek
 * adapter in particular tops out at 30KB of argv, which the daemon
 * hits the moment a project has a default design system bound AND
 * Critique Theater enabled. `anthropic` skips the binary entirely
 * so the prompt travels in an HTTP body, not argv.
 *
 * The runtime is config-driven via env vars. All of them are read
 * at invocation time (not at module load) so a project-scoped
 * override can land later without a daemon restart. Today only the
 * global env is honored; per-project config is a P0 follow-up.
 *
 * Required env:
 *   ANTHROPIC_BASE_URL  — e.g. https://api.minimaxi.com/anthropic
 *   ANTHROPIC_AUTH_TOKEN — Bearer-equivalent (mapped to `x-api-key`)
 *                        or ANTHROPIC_API_KEY as a fallback alias
 *   ANTHROPIC_MODEL      — e.g. deepseek-v4-pro[1m]
 *                        or ANTHROPIC_DEFAULT_SONNET_MODEL as fallback
 * Optional env:
 *   ANTHROPIC_VERSION    — defaults to 2023-06-01
 *   ANTHROPIC_CUSTOM_HEADERS — semicolon-`Name: Value` pairs merged
 *                              into every outbound request.
 *
 * Why a generic `anthropic`-named runtime, not `deepseek-api`:
 *   The Messages API is the de-facto wire format used by
 *   Anthropic, Minimax, GLM, and various third-party proxies.
 *   The user can point this runtime at any of them by overriding
 *   ANTHROPIC_BASE_URL. The model id is free-form (validation
 *   happens server-side at the upstream provider), so
 *   "deepseek-v4-pro[1m]" is just as valid here as "claude-sonnet-4-5".
 *
 * Settings exposure: the picker is intentionally NOT surfaced in
 * Settings → Agents as the only adapter — that picker is for
 * installed binaries. Instead it shows up labeled "Anthropic-
 * compatible API (HTTP)" with a hint that baseUrl / apiKey are
 * read from env.
 */

import { envValue } from '../../claude-diagnostics.js';
import { ANTHROPIC_SSE_FORMAT, HTTP_RUNTIME_BIN } from '../sentinels.js';
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

export const anthropicAgentDef: RuntimeAgentDef = {
  id: 'anthropic',
  name: 'Anthropic-compatible API (HTTP)',
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
    { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
    { id: 'claude-opus-4-5', label: 'claude-opus-4-5' },
  ] satisfies RuntimeModelOption[],
  // No argv: the prompt travels in the HTTP body.
  buildArgs: () => [],
  // The streaming consumer in server.ts routes this to the
  // Anthropic SSE parser (apps/daemon/src/anthropic-sse.ts).
  streamFormat: ANTHROPIC_SSE_FORMAT,
  // No env defaults — the user configures these per env.
  env: {},
};

export interface AnthropicRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  anthropicVersion: string;
  customHeaders: ReadonlyArray<readonly [string, string]>;
}

/**
 * Resolve the runtime's HTTP config from the daemon's process env.
 * Returns null when any required env var is missing so the caller
 * can surface an actionable error before burning a run. Env lookup
 * is case-insensitive (Windows env keys preserve the case the user
 * exported; Linux normalises to UPPER, so a hard-coded `ANTHROPIC_*`
 * would miss `Anthropic_Base_Url` on Windows).
 */
export function resolveAnthropicConfig(env: NodeJS.ProcessEnv = process.env): AnthropicRuntimeConfig | null {
  const baseUrl = envValue(env as Record<string, unknown>, 'ANTHROPIC_BASE_URL');
  // ANTHROPIC_AUTH_TOKEN wins; ANTHROPIC_API_KEY is the legacy alias.
  const apiKey =
    envValue(env as Record<string, unknown>, 'ANTHROPIC_AUTH_TOKEN') ??
    envValue(env as Record<string, unknown>, 'ANTHROPIC_API_KEY');
  const model =
    envValue(env as Record<string, unknown>, 'ANTHROPIC_MODEL') ??
    envValue(env as Record<string, unknown>, 'ANTHROPIC_DEFAULT_SONNET_MODEL') ??
    'claude-sonnet-4-5';
  const anthropicVersion =
    envValue(env as Record<string, unknown>, 'ANTHROPIC_VERSION') ?? '2023-06-01';
  const customHeadersRaw = envValue(env as Record<string, unknown>, 'ANTHROPIC_CUSTOM_HEADERS');

  if (!baseUrl) return null;
  if (!apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    anthropicVersion,
    customHeaders: [
      ...FALLBACK_HEADERS,
      ['x-api-key', apiKey],
      ['anthropic-version', anthropicVersion],
      ...parseCustomHeaders(customHeadersRaw),
    ],
  };
}
