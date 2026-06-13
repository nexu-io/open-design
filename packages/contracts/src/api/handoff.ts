// Shared DTOs for `POST /api/projects/:id/handoff`. The endpoint
// synthesizes a self-contained "first user message" prompt from a
// project's chat transcript so a fresh conversation can resume work
// without replaying the full chat. Unlike `/finalize/<provider>`,
// handoff is a single endpoint (not provider-namespaced) — the BYOK
// fields currently target Anthropic; future providers would be
// additive.

/**
 * Bumped when the handoff request/response shape changes incompatibly.
 * Also serves as a real runtime export so esbuild emits a `.mjs` for
 * this module (without it, the file is type-only and NodeNext-resolved
 * consumers cannot resolve the re-export from the package root).
 *
 * v2: `conversationId` became a required request field — handoff is
 * scoped to a single conversation, not the whole project.
 */
export const HANDOFF_SCHEMA_VERSION = 2;

/**
 * Request body for `POST /api/projects/:id/handoff`.
 *
 * Mirrors `FinalizeAnthropicRequest` (./finalize.ts) — `baseUrl` is
 * optional so standard Anthropic users do not need to set it; Bedrock
 * / self-hosted-proxy users still can.
 */
export interface HandoffRequest {
  /**
   * The conversation to resume. Required: handoff synthesizes from a
   * single conversation's transcript, not every conversation in the
   * project — a project-wide export would blend unrelated chats and
   * summarize the wrong context.
   */
  conversationId: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
}

/**
 * Response body for a successful handoff call. `prompt` is the
 * synthesized Markdown body the next conversation will send as its
 * first user message; the caller decides whether to auto-send or seed
 * the composer for review. Token counts are echoed straight from the
 * provider's `usage` block.
 */
export interface HandoffResponse {
  prompt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  transcriptMessageCount: number;
}
