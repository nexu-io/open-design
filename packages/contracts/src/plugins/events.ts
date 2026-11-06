import { z } from 'zod';

// PersistedAgentEvent plugin variants. Phase 1 ships the wire-format only
// (plan F2): web/CLI clients add case branches up front so Phase 2A landing
// of pipeline/genui events does not force a churn PR on every consumer.
//
// These events are NOT yet emitted by the daemon — Phase 2A wires the
// pipeline executor and the genui surface broadcast.

export const PluginPipelineStageEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind:      z.literal('pipeline_stage_started'),
    runId:     z.string(),
    snapshotId: z.string(),
    stageId:   z.string(),
    iteration: z.number().int().min(0),
    startedAt: z.number(),
  }),
  z.object({
    kind:        z.literal('pipeline_stage_completed'),
    runId:       z.string(),
    snapshotId:  z.string(),
    stageId:     z.string(),
    iteration:   z.number().int().min(0),
    completedAt: z.number(),
    converged:   z.boolean().optional(),
    diffSummary: z.string().optional(),
  }),
]);

export type PluginPipelineStageEvent = z.infer<typeof PluginPipelineStageEventSchema>;

export const GenUISurfaceEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind:        z.literal('genui_surface_request'),
    surfaceId:   z.string(),
    runId:       z.string(),
    payload:     z.unknown(),
    requestedAt: z.number(),
  }),
  z.object({
    kind:        z.literal('genui_surface_response'),
    surfaceId:   z.string(),
    runId:       z.string(),
    value:       z.unknown(),
    respondedAt: z.number(),
    respondedBy: z.enum(['user', 'agent', 'auto', 'cache']),
  }),
  z.object({
    kind:       z.literal('genui_surface_timeout'),
    surfaceId:  z.string(),
    runId:      z.string(),
    resolution: z.enum(['abort', 'default', 'skip']),
  }),
  z.object({
    kind:        z.literal('genui_state_synced'),
    surfaceId:   z.string(),
    runId:       z.string(),
    persistTier: z.enum(['run', 'conversation', 'project']),
  }),
]);

export type GenUISurfaceEvent = z.infer<typeof GenUISurfaceEventSchema>;

// Joined union of all plugin-system event variants the daemon will append
// to the existing `PersistedAgentEvent` channel. Web/CLI clients should
// switch on the `kind` field first, then the discriminated union narrows.
export const PluginAgentEventSchema = z.union([
  PluginPipelineStageEventSchema,
  GenUISurfaceEventSchema,
]);

export type PluginAgentEvent = z.infer<typeof PluginAgentEventSchema>;

export const PLUGIN_AGENT_EVENT_KINDS = [
  'pipeline_stage_started',
  'pipeline_stage_completed',
  'genui_surface_request',
  'genui_surface_response',
  'genui_surface_timeout',
  'genui_state_synced',
] as const;

export type PluginAgentEventKind = typeof PLUGIN_AGENT_EVENT_KINDS[number];
