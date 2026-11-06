// Wire shape for the cross-process safety-event bridge.
//
// Used by `POST /api/observability/event` so non-renderer surfaces
// (Electron main process, packaged-app helper processes, daemon
// itself in cases where it can't talk to itself in-process) can
// hand a safety event off to the daemon's posthog-node client.
//
// The endpoint intentionally does NOT gate on the user's analytics
// consent — the safety-bypass contract is the same one the web
// error-tracking module relies on for `$exception` events. The diagnostic
// event defined below is an explicit exception: it always requires consent.

export interface ObservabilityEventRequest {
  event: string;
  properties?: Record<string, unknown>;
}

export interface ObservabilityEventResponse {
  ok: true;
}

/** Consent-gated identity returned only to the local stdio MCP process. */
export interface McpAnalyticsContextResponse {
  enabled: boolean;
  deviceId: string | null;
  locale: string;
}

export interface McpAnalyticsEventRequest {
  event:
    | 'mcp_session_initialized'
    | 'mcp_tool_started'
    | 'mcp_tool_finished';
  eventId: string;
  occurredAt: string;
  properties?: Record<string, unknown>;
}

/** Local diagnostic bridge only. Unlike safety events, requires metrics AND content consent. */
export const CLIENT_EXPERIENCE_DIAGNOSTIC_EVENT = 'client_experience_diagnostic';
export interface ClientExperienceDiagnostic {
  occurrenceId: string;
  category: 'visible_error' | 'operation_failure' | 'project_failure' | 'runtime_failure';
  surface: string;
  errorCode: string;
  observedAt: number;
  runId?: string;
  projectId?: string;
  conversationId?: string;
  status?: string;
}

/** Reject free text and path-shaped IDs; return only the declared metadata fields. */
export function parseClientExperienceDiagnostic(value: unknown): ClientExperienceDiagnostic | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const token = (x: unknown, max = 128): x is string => typeof x === 'string'
    && x.length > 0 && x.length <= max && /^[a-zA-Z0-9_.:-]+$/.test(x);
  if (!token(v.occurrenceId, 512) || !token(v.surface) || !token(v.errorCode)
    || !['visible_error', 'operation_failure', 'project_failure', 'runtime_failure'].includes(String(v.category))
    || typeof v.observedAt !== 'number' || !Number.isSafeInteger(v.observedAt) || v.observedAt <= 0) return null;
  for (const name of ['runId', 'projectId', 'conversationId', 'status']) {
    if (v[name] !== undefined && !token(v[name])) return null;
  }
  return {
    occurrenceId: v.occurrenceId, category: v.category as ClientExperienceDiagnostic['category'],
    surface: v.surface, errorCode: v.errorCode, observedAt: v.observedAt,
    ...(v.runId !== undefined ? { runId: v.runId as string } : {}),
    ...(v.projectId !== undefined ? { projectId: v.projectId as string } : {}),
    ...(v.conversationId !== undefined ? { conversationId: v.conversationId as string } : {}),
    ...(v.status !== undefined ? { status: v.status as string } : {}),
  };
}
