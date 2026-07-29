// BYOK run lifecycle analytics.
//
// BYOK runs (config.mode === 'api') stream directly from the browser to the
// user's own model provider and never reach the daemon, so the daemon's
// authoritative run_created / run_finished are never emitted for them. Without
// a client-side emit, BYOK runs are invisible to the run funnel — they cannot
// be split out as runtime_type='byok' because no run event carries that value.
//
// These pure builders construct the run_created / run_finished prop payloads
// for the client emit. `runtime_type` itself is NOT set here — it rides on
// every event from the registered super-property (analytics/client.ts), which
// for a mode==='api' session resolves to 'byok'.

import {
  byokProtocolToTracking,
  modelIdForTracking,
  sessionModeToTracking,
  type RunCreatedProps,
  type RunFinishedProps,
  type TrackingByokProviderId,
  type TrackingCliProviderId,
  type TrackingProjectKind,
  type TrackingRunResult,
  type TrackingSessionMode,
} from '@open-design/contracts/analytics';
import type { ChatSessionMode } from '@open-design/contracts';
import type { ApiProtocol } from '../types';

// Map the BYOK transport protocol to the tracking provider id.
export function byokAgentProviderId(
  protocol: ApiProtocol | undefined,
): TrackingByokProviderId | TrackingCliProviderId {
  return byokProtocolToTracking(protocol) ?? 'other';
}

export interface ByokRunBaseInput {
  projectId: string;
  conversationId: string | null;
  runId: string;
  projectKind: TrackingProjectKind | null;
  hasAttachment: boolean;
  userQueryTokens: number;
  model: string | null | undefined;
  apiProtocol: ApiProtocol | undefined;
  skillId: string | null;
  sessionMode?: TrackingSessionMode;
}

export function byokSessionModeForTracking(
  mode: ChatSessionMode | null | undefined,
): TrackingSessionMode {
  return sessionModeToTracking(mode);
}

function baseRunProps(input: ByokRunBaseInput) {
  return {
    project_id: input.projectId,
    conversation_id: input.conversationId,
    run_id: input.runId,
    // Stamp the launched runtime onto the event itself. These builders only
    // run on the BYOK (mode === 'api') path, so the run launched as 'byok'.
    // Pinning it here keeps run_created and run_finished in the same bucket
    // even if the user flips the execution mode mid-stream — the registered
    // super-property would otherwise drift and split the run.
    runtime_type: 'byok' as const,
    project_kind: input.projectKind,
    // BYOK composer runs are not design-system generation runs (those go
    // through the daemon path), so no design system is in play.
    design_system_source: 'not_applicable' as const,
    has_attachment: input.hasAttachment,
    user_query_tokens: input.userQueryTokens,
    model_id: modelIdForTracking(input.model),
    agent_provider_id: byokAgentProviderId(input.apiProtocol),
    // BYOK streams client-side with no skills/MCP execution layer.
    skill_id: input.skillId,
    mcp_id: null,
    // No provider usage is parsed from the client stream yet — durations and
    // token usage are a follow-up. Honest 'unknown' rather than a fake count.
    token_count_source: 'unknown' as const,
    ...(input.sessionMode ? { session_mode: input.sessionMode } : {}),
  };
}

export function buildByokRunCreatedProps(input: ByokRunBaseInput): RunCreatedProps {
  return {
    page_name: 'chat_panel',
    area: 'chat_composer',
    ...baseRunProps(input),
  };
}

export interface ByokRunFinishedInput extends ByokRunBaseInput {
  result: TrackingRunResult;
  artifactCount: number;
  askedUserQuestion: boolean;
  totalDurationMs: number;
}

export function buildByokRunFinishedProps(
  input: ByokRunFinishedInput,
): RunFinishedProps {
  return {
    page_name: 'chat_panel',
    area: 'chat_panel',
    ...baseRunProps(input),
    result: input.result,
    artifact_count: input.artifactCount,
    asked_user_question: input.askedUserQuestion,
    total_duration_ms: input.totalDurationMs,
  };
}
