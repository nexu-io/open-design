// OpenCode Go (https://opencode.ai/zen/go) requires a stable per-conversation
// session identifier on every request, sent as `x-opencode-session`. Without
// it the gateway cannot route or cache prompts efficiently and (from
// 2026-09-06) rejects the request with `MissingSessionID`.
//
// OpenCode Go also fronts several wire protocols on one origin, chosen per
// model id — see the endpoint table at https://opencode.ai/docs/go. Keep the
// header rule and the model→wire classification in one place so the BYOK
// provider config, the model-list fetch, and the connection smoke test cannot
// drift apart.

import { randomUUID } from 'node:crypto';

export const OPENCODE_GO_SESSION_HEADER = 'x-opencode-session';

/** OpenCode Go's OpenAI-compatible base URL. */
export const OPENCODE_GO_DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1';

/** AI SDK package OpenCode Go expects for a given model id. */
export type OpenCodeGoWire =
  | '@ai-sdk/openai' // /v1/responses
  | '@ai-sdk/anthropic' // /v1/messages
  | '@ai-sdk/openai-compatible'; // /v1/chat/completions

// OpenAI Responses API family (`/v1/responses`).
const OPENCODE_GO_RESPONSES_MODELS = /^(grok-4\.6|gpt-5\.6-luna|muse-spark-)/;

// Anthropic Messages family (`/v1/messages`).
const OPENCODE_GO_MESSAGES_MODELS = /^(minimax-m|qwen3\.[678]-)/;

/**
 * True when `baseUrl` points at the OpenCode Go gateway. Host-based so a
 * trailing path or a regional mirror under the same origin still matches.
 */
export function isOpenCodeGoBaseUrl(baseUrl: string | null | undefined): boolean {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return false;
  try {
    return new URL(baseUrl.trim()).hostname.toLowerCase() === 'opencode.ai';
  } catch {
    return false;
  }
}

/**
 * Resolves the AI SDK package OpenCode Go serves `modelId` on. Unknown ids
 * fall back to the OpenAI chat-completions wire, which covers the majority of
 * the catalogue.
 */
export function openCodeGoWireForModel(modelId: string | null | undefined): OpenCodeGoWire {
  const id = typeof modelId === 'string' ? modelId.trim().toLowerCase() : '';
  // Tolerate a `provider/model` form (e.g. `opencode-go/kimi-k3`).
  const bare = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  if (OPENCODE_GO_RESPONSES_MODELS.test(bare)) return '@ai-sdk/openai';
  if (OPENCODE_GO_MESSAGES_MODELS.test(bare)) return '@ai-sdk/anthropic';
  return '@ai-sdk/openai-compatible';
}

/**
 * Builds the routing header for a single request/conversation. Pass a stable
 * id (conversation, run, or session handle) when one exists; otherwise a
 * fresh UUID is minted so the request is still routable.
 */
export function openCodeSessionHeaders(
  sessionId?: string | null,
): Record<string, string> {
  const stable =
    typeof sessionId === 'string' && sessionId.trim()
      ? sessionId.trim()
      : randomUUID();
  return { [OPENCODE_GO_SESSION_HEADER]: stable };
}
