// GenUI event types + payload helpers (spec §10.3.2). Joins the existing
// `PersistedAgentEvent` SSE / ND-JSON channel under the `genui_*` and
// `pipeline_stage_*` discriminator tags.
//
// This module only assembles the wire payloads. The actual broadcast to a
// run's SSE stream goes through `apps/daemon/src/runs.ts`'s `emit(run,
// event, data)` helper, kept decoupled from this file so tests can swap
// the sink for an in-memory recorder.

import type {
  GenUISurfaceEvent,
  PluginPipelineStageEvent,
} from '@open-design/contracts';
import type { SurfaceRow } from './store.js';

export type GenUIEventSink = (event: GenUISurfaceEvent | PluginPipelineStageEvent) => void;

export function buildSurfaceRequestEvent(args: {
  surfaceRow: SurfaceRow;
  runId:      string;
  payload?:   unknown;
}): GenUISurfaceEvent {
  return {
    kind:        'genui_surface_request',
    surfaceId:   args.surfaceRow.surfaceId,
    runId:       args.runId,
    payload:     args.payload ?? null,
    requestedAt: args.surfaceRow.requestedAt,
  };
}

export function buildSurfaceResponseEvent(args: {
  surfaceRow:  SurfaceRow;
  runId:       string;
  respondedBy: SurfaceRow['respondedBy'];
}): GenUISurfaceEvent {
  return {
    kind:        'genui_surface_response',
    surfaceId:   args.surfaceRow.surfaceId,
    runId:       args.runId,
    value:       args.surfaceRow.value,
    respondedAt: args.surfaceRow.respondedAt ?? Date.now(),
    // Default to 'agent' so the discriminated union remains exhaustive
    // even if a synthetic event is built before the response writer set
    // `respondedBy`. Real responses always carry an explicit value.
    respondedBy: args.respondedBy ?? 'agent',
  };
}

export function buildSurfaceTimeoutEvent(args: {
  surfaceRow: SurfaceRow;
  runId:      string;
  resolution: 'abort' | 'default' | 'skip';
}): GenUISurfaceEvent {
  return {
    kind:       'genui_surface_timeout',
    surfaceId:  args.surfaceRow.surfaceId,
    runId:      args.runId,
    resolution: args.resolution,
  };
}

export function buildStateSyncedEvent(args: {
  surfaceRow: SurfaceRow;
  runId:      string;
}): GenUISurfaceEvent {
  return {
    kind:        'genui_state_synced',
    surfaceId:   args.surfaceRow.surfaceId,
    runId:       args.runId,
    persistTier: args.surfaceRow.persist,
  };
}

export function buildPipelineStageStartedEvent(args: {
  runId:      string;
  snapshotId: string;
  stageId:    string;
  iteration:  number;
}): PluginPipelineStageEvent {
  return {
    kind:       'pipeline_stage_started',
    runId:      args.runId,
    snapshotId: args.snapshotId,
    stageId:    args.stageId,
    iteration:  args.iteration,
    startedAt:  Date.now(),
  };
}

export function buildPipelineStageCompletedEvent(args: {
  runId:        string;
  snapshotId:   string;
  stageId:      string;
  iteration:    number;
  converged?:   boolean | undefined;
  diffSummary?: string | undefined;
}): PluginPipelineStageEvent {
  const evt: PluginPipelineStageEvent = {
    kind:        'pipeline_stage_completed',
    runId:       args.runId,
    snapshotId:  args.snapshotId,
    stageId:     args.stageId,
    iteration:   args.iteration,
    completedAt: Date.now(),
  };
  if (args.converged !== undefined) evt.converged = args.converged;
  if (args.diffSummary !== undefined) evt.diffSummary = args.diffSummary;
  return evt;
}
