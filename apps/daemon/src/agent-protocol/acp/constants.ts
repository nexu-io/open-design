

export const ACP_PROTOCOL_VERSION = 1;
export const DEFAULT_TIMEOUT_MS = 15_000;
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
export const DEFAULT_STAGE_TIMEOUT_MS = 10 * 60 * 1000;
export const ACP_ARTIFACT_OPEN_PATTERN = String.raw`<\s*(?:\|?\s*DSML[\s,]+artifact\b|artifact\b)`;
export const ACP_GENERATED_FILE_PREFIX_PATTERN =
  String.raw`(?:here\s+is|here'?s)\s+the\s+generated\s+file\s*:?\s*(?:\r?\n|\s)*`;
export const ACP_ARTIFACT_ECHO_START_RE = new RegExp(
  String.raw`^\s*(?:${ACP_ARTIFACT_OPEN_PATTERN}|${ACP_GENERATED_FILE_PREFIX_PATTERN}${ACP_ARTIFACT_OPEN_PATTERN})`,
  'i',
);
export const ACP_RAW_EVENT_SHAPE_DIAGNOSTIC_LIMIT = 8;
export const AMR_STDERR_RETRY_TAIL_LIMIT = 16_000;
export const MODEL_CONFIG_OPTION_IDS = new Set(['model', 'models', 'modelid', 'modelids']);
