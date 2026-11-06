export const AGENT_SESSION_HANDLE_KINDS = [
  'opaque-id',
  'cli-thread-id',
  'acp-session-handle',
  'session-file-path',
  'continue-latest',
  'none',
  'unknown',
] as const;

export type AgentSessionHandleKind = (typeof AGENT_SESSION_HANDLE_KINDS)[number];

export const AGENT_SESSION_HANDLE_ACQUISITION_MODES = [
  'daemon-specified',
  'stream-captured',
  'acp-session-load',
  'session-file-discovered',
  'continue-latest',
  'none',
  'unknown',
] as const;

export type AgentSessionHandleAcquisitionMode =
  (typeof AGENT_SESSION_HANDLE_ACQUISITION_MODES)[number];

export const AGENT_SESSION_CONTINUATION_MODES = [
  'native-resume-by-id',
  'native-continue-latest',
  'acp-session-load',
  'session-file-resume',
  'none',
] as const;

export type AgentSessionContinuationMode =
  (typeof AGENT_SESSION_CONTINUATION_MODES)[number];

export const AGENT_SESSION_HANDLE_VISIBILITIES = [
  'persist-only',
  'diagnostics-redacted',
  'safe-display',
] as const;

export type AgentSessionHandleVisibility =
  (typeof AGENT_SESSION_HANDLE_VISIBILITIES)[number];

export const AGENT_SESSION_INVALIDATION_REASONS = [
  'model_changed',
  'cwd_changed',
  'conversation_advanced',
  'missing_cursor',
] as const;

export type AgentSessionInvalidationReason =
  (typeof AGENT_SESSION_INVALIDATION_REASONS)[number];

export interface AgentSessionMapKey {
  conversationId: string;
  agentId: string;
  /**
   * Logical project identity for the binding. The current daemon schema stores
   * this through conversations.project_id rather than duplicating it in
   * agent_sessions.
   */
  projectId: string | null;
}

export interface AgentSessionHandleRef {
  kind: AgentSessionHandleKind;
  acquisition: AgentSessionHandleAcquisitionMode;
  continuation: AgentSessionContinuationMode;
  /**
   * Raw upstream handle value. Daemon persistence may store this, but public
   * run details should expose only a sanitized display form unless the handle
   * kind is explicitly safe to show.
   */
  value: string | null;
  visibility: AgentSessionHandleVisibility;
}

export interface AgentSessionBindingRecord {
  key: AgentSessionMapKey;
  handle: AgentSessionHandleRef;
  model: string | null;
  cwd: string | null;
  lastMessageId: string | null;
  stablePromptHash: string | null;
  /**
   * Optional monotonic binding revision for future schemas. Current
   * agent_sessions rows use updatedAt plus lastMessageId as the active cursor.
   */
  revision?: number | null;
  updatedAt: number;
}

export interface AgentSessionCapabilityFlags {
  resumeById: boolean;
  continueLatest: boolean;
  acpSessionLoad: boolean;
  streamCapturedHandle: boolean;
  daemonSpecifiedHandle: boolean;
  sessionFileHandle: boolean;
  headlessPromptInjection: boolean;
  modelOverride: boolean;
  modeOverride: boolean;
}

export type AgentSessionImplementationStatus =
  | 'implemented'
  | 'in-flight'
  | 'candidate'
  | 'unsupported'
  | 'unknown';

export interface AgentSessionCapabilityMatrixRow {
  agentId: string;
  agentName: string;
  status: AgentSessionImplementationStatus;
  handleKind: AgentSessionHandleKind;
  acquisition: AgentSessionHandleAcquisitionMode;
  continuation: AgentSessionContinuationMode;
  capabilities: AgentSessionCapabilityFlags;
  related?: string[];
  notes?: string;
}
