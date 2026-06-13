// AG-UI canonical event types (subset).
//
// These mirror the wire shape that CopilotKit / agent-protocol clients
// expect (see https://github.com/CopilotKit/CopilotKit). We pin the
// minimum surface OD currently needs:
//
//   - agent.message            run-level streaming text
//   - tool_call                run-level tool invocation
//   - state_update             keyed state delta the front-end stores
//   - ui.surface_requested     a generative UI surface the agent raised
//   - ui.surface_responded     the user's answer (or a cache hit)
//   - run.lifecycle            run started / completed / cancelled
//
// Spec §10.3.5 / Phase 4 — OD's native PersistedAgentEvent / GenUIEvent
// /PluginPipelineStageEvent union maps onto this set bidirectionally.

export type AGUIEventKind =
  | 'agent.message'
  | 'tool_call'
  | 'state_update'
  | 'ui.surface_requested'
  | 'ui.surface_responded'
  | 'run.lifecycle';

export interface AGUIEventBase {
  // Event kind discriminator. Stable across protocol versions.
  kind: AGUIEventKind;
  // The OD run id this event belongs to.
  runId: string;
  // Monotonic per-run sequence number. Lets a reconnecting client
  // resume from a specific point.
  seq?: number;
  // Wall-clock timestamp (unix ms) when the event was emitted.
  ts: number;
}

export interface AGUIAgentMessageEvent extends AGUIEventBase {
  kind: 'agent.message';
  // Streaming chunk text. Concatenate across consecutive
  // agent.message events to reconstruct the assistant turn.
  text: string;
  // True for the final chunk (other consumers can flush their buffer).
  done?: boolean;
}

export interface AGUIToolCallEvent extends AGUIEventBase {
  kind: 'tool_call';
  toolName: string;
  // The arguments the agent passed; pre-validation per the upstream
  // tool's schema. JSON values only.
  args: unknown;
  // Optional id correlating multiple tool_call events that resolve
  // to the same single call (start + result).
  callId?: string;
  status?: 'started' | 'completed' | 'failed';
  result?: unknown;
}

export interface AGUIStateUpdateEvent extends AGUIEventBase {
  kind: 'state_update';
  // Path the front-end should merge into its run-state cache.
  // Dot-segmented keys; the agent-protocol convention is that empty
  // path = replace whole state.
  path: string;
  value: unknown;
}

export interface AGUISurfaceRequestedEvent extends AGUIEventBase {
  kind: 'ui.surface_requested';
  surfaceId: string;
  // OD's surface kinds map directly onto AG-UI's three tiers
  // (Static / Declarative / Open-Ended). v1 only emits the
  // Declarative tier (form / choice / confirmation / oauth-prompt).
  surfaceKind: 'form' | 'choice' | 'confirmation' | 'oauth-prompt';
  payload: unknown;
}

export interface AGUISurfaceRespondedEvent extends AGUIEventBase {
  kind: 'ui.surface_responded';
  surfaceId: string;
  value: unknown;
  respondedBy: 'user' | 'agent' | 'auto' | 'cache';
}

export interface AGUIRunLifecycleEvent extends AGUIEventBase {
  kind: 'run.lifecycle';
  status: 'started' | 'pipeline_stage_started' | 'pipeline_stage_completed' | 'completed' | 'cancelled' | 'failed';
  // Optional stage id when status starts with `pipeline_stage_`.
  stageId?: string;
  iteration?: number;
  message?: string;
}

export type AGUIEvent =
  | AGUIAgentMessageEvent
  | AGUIToolCallEvent
  | AGUIStateUpdateEvent
  | AGUISurfaceRequestedEvent
  | AGUISurfaceRespondedEvent
  | AGUIRunLifecycleEvent;
