// Map an Open Design native event onto the AG-UI canonical wire shape.
//
// The OD native union covers more than AG-UI cares about (e.g. internal
// daemon-control events). We project only what an external AG-UI client
// would meaningfully consume; unrecognised events return null and the
// daemon SSE relay drops them.

import type {
  GenUISurfaceEvent,
  PluginPipelineStageEvent,
} from '@open-design/contracts';
import type {
  AGUIAgentMessageEvent,
  AGUIEvent,
  AGUIRunLifecycleEvent,
  AGUIStateUpdateEvent,
  AGUISurfaceRequestedEvent,
  AGUISurfaceRespondedEvent,
  AGUIToolCallEvent,
} from './types.js';

// The PersistedAgentEvent variants OD emits on a run's SSE stream.
// We model the subset we map; the daemon may emit other shapes (errors,
// system messages, …) which the encoder drops.
export interface OdMessageChunkEvent {
  kind: 'message_chunk';
  runId?: string;
  text?: string;
  done?: boolean;
  ts?: number;
}

export interface OdToolCallEvent {
  kind: 'tool_call';
  runId?: string;
  toolName?: string;
  args?: unknown;
  callId?: string;
  status?: 'started' | 'completed' | 'failed';
  result?: unknown;
  ts?: number;
}

export interface OdStateUpdateEvent {
  kind: 'state_update';
  runId?: string;
  path?: string;
  value?: unknown;
  ts?: number;
}

export interface OdRunEndEvent {
  kind: 'end';
  runId?: string;
  status?: 'succeeded' | 'failed' | 'canceled' | 'completed';
  ts?: number;
}

export interface OdRunStartedEvent {
  kind: 'run_started';
  runId?: string;
  ts?: number;
}

export type OdNativeEvent =
  | GenUISurfaceEvent
  | PluginPipelineStageEvent
  | OdMessageChunkEvent
  | OdToolCallEvent
  | OdStateUpdateEvent
  | OdRunEndEvent
  | OdRunStartedEvent;

export interface EncodeContext {
  // The run's id; OD may have it on the event already, but the daemon
  // SSE relay always knows it from the route, so we pass it in to keep
  // the encoder pure.
  runId: string;
  // Optional monotonic sequence the daemon assigns per-run. Phase 4's
  // SSE relay can pass design.runs.events[i].id directly.
  seq?: number;
  // Wall-clock fallback. The encoder uses this when the OD event
  // lacks `requestedAt` / `startedAt` / etc.
  now?: number;
}

export function encodeOdEventForAgui(
  event: OdNativeEvent,
  ctx: EncodeContext,
): AGUIEvent | null {
  const ts = ctx.now ?? Date.now();
  const base = { runId: ctx.runId, ts, ...(ctx.seq !== undefined ? { seq: ctx.seq } : {}) };
  switch (event.kind) {
    case 'message_chunk': {
      const out: AGUIAgentMessageEvent = {
        ...base,
        kind: 'agent.message',
        text: event.text ?? '',
      };
      if (event.done) out.done = true;
      return out;
    }
    case 'tool_call': {
      const out: AGUIToolCallEvent = {
        ...base,
        kind: 'tool_call',
        toolName: event.toolName ?? 'unknown',
        args: event.args ?? null,
      };
      if (event.callId) out.callId = event.callId;
      if (event.status) out.status = event.status;
      if (event.result !== undefined) out.result = event.result;
      return out;
    }
    case 'state_update': {
      const out: AGUIStateUpdateEvent = {
        ...base,
        kind: 'state_update',
        path: event.path ?? '',
        value: event.value ?? null,
      };
      return out;
    }
    case 'run_started': {
      const out: AGUIRunLifecycleEvent = { ...base, kind: 'run.lifecycle', status: 'started' };
      return out;
    }
    case 'end': {
      const status = event.status === 'failed' ? 'failed'
        : event.status === 'canceled' ? 'cancelled'
        : 'completed';
      const out: AGUIRunLifecycleEvent = { ...base, kind: 'run.lifecycle', status };
      return out;
    }
    case 'pipeline_stage_started': {
      const out: AGUIRunLifecycleEvent = {
        ...base,
        kind: 'run.lifecycle',
        status: 'pipeline_stage_started',
        stageId: event.stageId,
        iteration: event.iteration,
      };
      return out;
    }
    case 'pipeline_stage_completed': {
      const out: AGUIRunLifecycleEvent = {
        ...base,
        kind: 'run.lifecycle',
        status: 'pipeline_stage_completed',
        stageId: event.stageId,
        iteration: event.iteration,
      };
      return out;
    }
    case 'genui_surface_request': {
      const out: AGUISurfaceRequestedEvent = {
        ...base,
        kind: 'ui.surface_requested',
        surfaceId: event.surfaceId,
        surfaceKind: surfaceKindFromPayload(event.payload) ?? 'confirmation',
        payload: event.payload,
      };
      return out;
    }
    case 'genui_surface_response': {
      const out: AGUISurfaceRespondedEvent = {
        ...base,
        kind: 'ui.surface_responded',
        surfaceId: event.surfaceId,
        value: event.value,
        respondedBy: event.respondedBy,
      };
      return out;
    }
    case 'genui_surface_timeout': {
      const out: AGUISurfaceRespondedEvent = {
        ...base,
        kind: 'ui.surface_responded',
        surfaceId: event.surfaceId,
        value: { resolution: event.resolution },
        respondedBy: 'auto',
      };
      return out;
    }
    case 'genui_state_synced': {
      const out: AGUIStateUpdateEvent = {
        ...base,
        kind: 'state_update',
        path: `genui.${event.surfaceId}`,
        value: { persistTier: event.persistTier },
      };
      return out;
    }
    default:
      return null;
  }
}

function surfaceKindFromPayload(payload: unknown):
  | 'form' | 'choice' | 'confirmation' | 'oauth-prompt' | null {
  if (!payload || typeof payload !== 'object') return null;
  const k = (payload as { kind?: string }).kind;
  if (k === 'form' || k === 'choice' || k === 'confirmation' || k === 'oauth-prompt') {
    return k;
  }
  return null;
}
