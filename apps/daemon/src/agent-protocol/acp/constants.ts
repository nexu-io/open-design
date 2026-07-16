/** @module agent-protocol/acp/constants
 * Protocol version, timeout defaults, artifact-detection patterns, and
 * model-config identifier sets used across all acp/ files. No dependencies
 * on other agent-protocol modules — safe to import from anywhere in acp/.
 */

/** ACP JSON-RPC protocol version sent in every `initialize` handshake. */
export const ACP_PROTOCOL_VERSION = 1;
/** Default timeout in milliseconds for short-lived ACP operations such as model detection. */
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Absolute upper ceiling for any ACP-derived timeout value (24 hours). */
export const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
// Gap-between-chunks watchdog for an ACP session stage. The timer resets on
// every line received from the agent, so this bounds *silent* periods, not
// total runtime. Default kept in line with the outer chat-run inactivity
// watchdog (10 min) so agents that spend several minutes silently writing
// large artifacts do not get killed before the outer watchdog can apply.
// Callers can override via `stageTimeoutMs`; the chat server reads
// `OD_ACP_STAGE_TIMEOUT_MS` from the environment.
// A non-positive `stageTimeoutMs` (`<= 0`) disables the watchdog entirely,
// mirroring the outer chat watchdog's escape-hatch semantics — without this,
// `OD_ACP_STAGE_TIMEOUT_MS=0` would call `setTimeout(..., 0)` and fail every
// ACP session on the next tick instead of disabling the watchdog.
/** Default per-stage inactivity watchdog timeout (10 minutes) for an ACP session; resets on every received line from the agent subprocess. */
export const DEFAULT_STAGE_TIMEOUT_MS = 10 * 60 * 1000;
/** Regex source fragment matching an opening DSML artifact or plain `artifact` tag in an ACP agent's text output. */
export const ACP_ARTIFACT_OPEN_PATTERN = String.raw`<\s*(?:\|?\s*DSML[\s,]+artifact\b|artifact\b)`;
/** Regex source fragment matching agent preamble text like "here is the generated file:" that precedes an artifact open tag. */
export const ACP_GENERATED_FILE_PREFIX_PATTERN =
  String.raw`(?:here\s+is|here'?s)\s+the\s+generated\s+file\s*:?\s*(?:\r?\n|\s)*`;
/** Compiled regex that detects the start of an ACP artifact echo in an `agent_message_chunk` delta; used to arm the DSML text suppressor. */
export const ACP_ARTIFACT_ECHO_START_RE = new RegExp(
  String.raw`^\s*(?:${ACP_ARTIFACT_OPEN_PATTERN}|${ACP_GENERATED_FILE_PREFIX_PATTERN}${ACP_ARTIFACT_OPEN_PATTERN})`,
  'i',
);
/** Maximum number of `acp_raw_event_shape` and `acp_artifact_text_suppression` diagnostic events emitted per session to avoid flooding the event stream. */
export const ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT = 8;
/** Maximum number of bytes retained from stderr to detect AMR retry/failure signals; older bytes are discarded to bound memory use. */
export const AMR_STDERR_RETRY_TAIL_LIMIT = 16_000;
/** Normalised token IDs that identify a model-selection config option in an ACP `session/new` response's `configOptions` array. */
export const MODEL_CONFIG_OPTION_IDS = new Set(['model', 'models', 'modelid', 'modelids']);
