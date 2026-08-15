/** @module agent-protocol/dsh-profile/types
 * Generation-1 wire contract for the Open Design DeepSeek Harness profile.
 * The user's official `dsh` owns the runtime; this protocol is the thin stdio
 * seam exposed by the installed `open-design` profile bundle.
 */

export const DSH_PROFILE_PROTOCOL_VERSION = 1 as const;
export const DSH_PROFILE_RUNTIME = 'open-design' as const;
export const DSH_PROFILE_NAME = 'open-design' as const;

export type DshProfileCapabilities = {
  session_resume: true;
  session_cancel: true;
  structured_events: true;
};

export type DshProfileModelSelection = {
  provider: string;
  id: string;
};

export type DshProfileModelCatalogEntry = {
  provider: string;
  provider_name: string;
  id: string;
  name: string;
  reasoning_options?: Array<{ id: string; name: string; default?: boolean }>;
};

export type DshProfileModelsFrame = {
  v: 1;
  type: 'models';
  runtime: 'open-design';
  models: DshProfileModelCatalogEntry[];
};

export type DshProfileExecuteCommand = {
  v: 1;
  type: 'execute';
  request_id: string;
  cwd: string;
  prompt: string;
  resume_session_id?: string;
  model?: DshProfileModelSelection;
  reasoning_effort?: string;
  mcp_servers: unknown[];
};

export type DshProfileCancelCommand = {
  v: 1;
  type: 'cancel';
  request_id: string;
};

export type DshProfileHostCommand =
  | DshProfileExecuteCommand
  | DshProfileCancelCommand;

export type DshProfileProbeFrame = {
  v: 1;
  type: 'probe';
  runtime: 'open-design';
  protocol_version: 1;
  plugin_version: string;
  capabilities: DshProfileCapabilities;
};

export type DshProfileReadyFrame = {
  v: 1;
  type: 'ready';
  runtime: 'open-design';
  protocol_version: 1;
  plugin_version: string;
  capabilities: DshProfileCapabilities;
};

export type DshProfileSessionFrame = {
  v: 1;
  type: 'session';
  request_id: string;
  session_id: string;
  resumed: boolean;
};

export type DshProfileThinkingFrame = {
  v: 1;
  type: 'thinking';
  request_id: string;
  content: string;
};

export type DshProfileTextFrame = {
  v: 1;
  type: 'text';
  request_id: string;
  content: string;
};

export type DshProfileToolCallFrame = {
  v: 1;
  type: 'tool_call';
  request_id: string;
  call_id: string;
  name: string;
  arguments: string;
};

export type DshProfileToolResultFrame = {
  v: 1;
  type: 'tool_result';
  request_id: string;
  call_id: string;
  name: string;
  output: string;
  is_error: boolean;
};

export type DshProfileUsageFrame = {
  v: 1;
  type: 'usage';
  request_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

export type DshProfileWireError = {
  code: string;
  message: string;
};

export type DshProfileResultStatus = 'completed' | 'cancelled' | 'failed';

export type DshProfileResultFrame = {
  v: 1;
  type: 'result';
  request_id: string;
  status: DshProfileResultStatus;
  session_id: string;
  output?: string;
  stop_reason?: string;
  resume_rejected: boolean;
  error?: DshProfileWireError;
};

export type DshProfileProtocolErrorFrame = {
  v: 1;
  type: 'protocol_error';
  request_id?: string;
  code: string;
  message: string;
};

export type DshProfileRuntimeFrame =
  | DshProfileProbeFrame
  | DshProfileReadyFrame
  | DshProfileSessionFrame
  | DshProfileThinkingFrame
  | DshProfileTextFrame
  | DshProfileToolCallFrame
  | DshProfileToolResultFrame
  | DshProfileUsageFrame
  | DshProfileResultFrame
  | DshProfileProtocolErrorFrame;

export type DshProfileStreamErrorCode =
  | 'DSH_PROFILE_FRAME_TOO_LARGE'
  | 'DSH_PROFILE_MALFORMED_FRAME'
  | 'DSH_PROFILE_INVALID_FRAME'
  | 'DSH_PROFILE_TRUNCATED_FRAME';

export type DshProfileStreamError = {
  code: DshProfileStreamErrorCode;
  message: string;
  line: number;
};
