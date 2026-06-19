import type { ConnectionTestProtocol } from './connectionTest';
import type { ReasoningExecutionRequestFields } from './reasoningExecution';

// Shared DTOs for the `/api/projects/:id/finalize/<provider>` family of
// synthesis endpoints. `/finalize/anthropic` was introduced first; the
// request body now also carries the BYOK protocol so callers can route the
// same finalized-design synthesis through the provider selected in Settings.

/**
 * Bumped when the finalize request/response shape changes incompatibly.
 * Also serves as a real runtime export so esbuild emits a `.mjs` for
 * this module (without it, the file is type-only and NodeNext-resolved
 * consumers cannot resolve the re-export from the package root).
 */
export const FINALIZE_SCHEMA_VERSION = 1;

/**
 * Provider ids supported by the finalized-design synthesis path.
 * Matches the BYOK protocols exposed by Settings and connection tests.
 */
export type FinalizeProviderProtocol = ConnectionTestProtocol;

/**
 * Request body for `POST /api/projects/:id/finalize/<provider>`.
 *
 * Field names mirror `ProxyStreamRequest` (./proxy.ts) so a caller that
 * already has provider credentials assembled for chat can reuse the
 * same shape. `baseUrl` is optional here (intentional divergence from
 * the proxy, which requires it for some providers) — standard provider
 * defaults are applied by the daemon when possible.
 */
export interface FinalizeProviderRequest extends ReasoningExecutionRequestFields {
  /**
   * BYOK protocol selected in Settings. Omitted means `anthropic` for
   * backward compatibility with the original `/finalize/anthropic` caller.
   */
  protocol?: FinalizeProviderProtocol;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  /** Azure OpenAI only. Defaults at the daemon when omitted. */
  apiVersion?: string;
}

export type FinalizeAnthropicRequest = FinalizeProviderRequest;

/**
 * Reference to the artifact that participated in the finalize call, if
 * any. Synthesis prompts pass the artifact body verbatim; this response
 * field lets the caller name which file was chosen and when it was
 * last touched.
 */
export interface FinalizeArtifactRef {
  name: string;
  /** ISO 8601 from the artifact's manifest, or `null` for legacy artifacts. */
  updatedAt: string | null;
}

/**
 * Response body for a successful finalize call. The synthesized
 * `DESIGN.md` was written atomically to `designMdPath`; `bytesWritten`
 * is the exact UTF-8 byte length on disk. Token counts are echoed
 * straight from the provider's `usage` block.
 */
export interface FinalizeProviderResponse {
  designMdPath: string;
  bytesWritten: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  artifact: FinalizeArtifactRef | null;
  transcriptMessageCount: number;
  designSystemId: string | null;
}

export type FinalizeAnthropicResponse = FinalizeProviderResponse;
