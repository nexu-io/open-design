/** @module langfuse-trace/core/constants
 * Tuning constants and hard limits for Langfuse payload assembly and HTTP delivery.
 * Part of the foundation kernel: imports no sibling subdirectory; all sibling
 * modules (types, redact, primitives) may import from here but not vice-versa.
 */

/**
 * Default Langfuse ingestion endpoint for the US region.
 * Authenticated project keys from this deployment resolve against
 * `us.cloud.langfuse.com`; EU keys would require `cloud.langfuse.com` instead
 * (which returns 401 for these credentials).
 */
// Langfuse US region: confirmed by an end-to-end smoke on 2026-05-07 — the
// project's keys authenticate against `us.cloud.langfuse.com` only. EU host
// (`cloud.langfuse.com`) returns 401 with the matching error message.
// See specs/change/20260507-langfuse-telemetry/spec.md Q3.
export const DEFAULT_BASE_URL = 'https://us.cloud.langfuse.com';

/**
 * Maximum UTF-8 byte length for the user-input (prompt) field of a generation span.
 * Prevents oversized prompt blobs from inflating batch payloads beyond the relay limit.
 * Uses byte-aware truncation (see redact.ts `truncate`) because JS string length
 * undercounts bytes for non-ASCII content.
 */
export const INPUT_MAX_BYTES = 64 * 1024;

/**
 * Maximum UTF-8 byte length for the model-output field of a generation span.
 * Mirrors INPUT_MAX_BYTES so prompt and output share the same per-field budget.
 */
export const OUTPUT_MAX_BYTES = 64 * 1024;

/**
 * Maximum UTF-8 byte length for a single tool call's input payload.
 * Tighter than INPUT_MAX_BYTES because many small tool calls can accumulate
 * within a single batch, each contributing to HARD_BATCH_MAX_BYTES.
 */
export const TOOL_INPUT_MAX_BYTES = 8 * 1024;

/**
 * Maximum UTF-8 byte length for a single tool call's output payload.
 * Mirrors TOOL_INPUT_MAX_BYTES; prevents large file-read results from
 * dominating the batch when a run issues many content-tool calls.
 */
export const TOOL_OUTPUT_MAX_BYTES = 8 * 1024;

/**
 * Maximum number of artifact and attachment manifest entries included per trace.
 * Caps the object manifest array so a single long-running run cannot cause the
 * serialised batch to exceed HARD_BATCH_MAX_BYTES purely from manifest growth.
 * `cappedManifestEntries` in primitives.ts enforces this at slice time.
 */
export const ARTIFACTS_MAX_ITEMS = 50;

/**
 * Maximum character length accepted by Langfuse for the `sessionId` field.
 * Langfuse silently drops trace payloads whose `sessionId` exceeds this length,
 * so the builder must truncate before constructing the ingestion batch.
 */
export const SESSION_ID_MAX = 200; // Langfuse drops sessionIds longer than this.

/**
 * Hard ceiling (bytes) for the serialised JSON body of a single HTTP request.
 * Both the relay and direct-Langfuse paths gate on this limit. Payloads that
 * exceed it are dropped with a `payload_too_large` drop reason rather than
 * retried, because splitting the batch is not supported at the call site.
 */
export const HARD_BATCH_MAX_BYTES = 1024 * 1024;

/**
 * Default HTTP timeout (milliseconds) for Langfuse delivery attempts.
 * Applied to both relay and direct-Langfuse fetch calls; individual configs
 * may override this via `LangfuseConfig.timeoutMs` or `TelemetrySinkConfig`.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

/**
 * Default retry count after a transient delivery failure (e.g. 5xx response).
 * Kept at 1 because Langfuse telemetry is best-effort — aggressive retries
 * risk blocking the daemon's run-completion flow for non-critical data.
 */
export const DEFAULT_FETCH_RETRIES = 1;

/**
 * Maximum number of prompt-stack blame sections forwarded in prompt telemetry.
 * Limits the diagnostic breakdown size when system prompts contain many
 * named sections, keeping per-trace payload size predictable.
 */
export const PROMPT_STACK_BLAME_MAX_SECTIONS = 8;
