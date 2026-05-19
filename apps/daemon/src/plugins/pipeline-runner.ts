// Pipeline runner — bridges the pure pipeline scheduler in `pipeline.ts`
// onto a live run's SSE event stream and the `genui_surfaces` cache.
//
// Plan §3.A7 / spec §10.1 / §10.2. Today the agent loop owns the actual
// stage execution; this runner is the thin wrapper that:
//
//   - emits `pipeline_stage_started` / `pipeline_stage_completed`
//     events through the run service so SSE / ND-JSON consumers see the
//     stage timeline,
//   - persists each iteration into `run_devloop_iterations`,
//   - asks `requestOrReuseSurface()` for the matching GenUI surface
//     before the stage runner fires (auto-derived `__auto_connector_*`
//     prompts always go through the cross-conversation cache so a
//     repeat-OAuth never re-broadcasts).
//
// The stage runner itself is supplied by the caller. In v1 the daemon
// passes a stub that only records iteration counts; later phases can
// plug in critique-theater scoring, build-test signals, etc. without
// changing the public contract.

import type Database from 'better-sqlite3';
import type {
  AppliedPluginSnapshot,
  GenUISurfaceSpec,
  PluginPipeline,
} from '@open-design/contracts';
import { runPipeline, type PipelineEnv, type PipelineEventSink, type StageOutcomeRecord, type StageRunner } from './pipeline.js';
import { requestOrReuseSurface } from '../genui/registry.js';
import type { GenUIEventSink } from '../genui/events.js';

type SqliteDb = Database.Database;

export interface PipelineRunnerInput {
  db:        SqliteDb;
  runId:     string;
  projectId: string;
  conversationId?: string | null | undefined;
  snapshot:  AppliedPluginSnapshot;
  pipeline:  PluginPipeline;
  env:       PipelineEnv;
  // The actual stage worker. Returns signals (`critique.score`,
  // `iterations`, …) that drive `until` evaluation. Apps inject the
  // real LLM-driven worker; tests pass a deterministic stub.
  runStage:  StageRunner;
  // Pluggable event sinks. The runs service injects the SSE forwarder
  // for both pipeline + genui events; tests pass an array.push closure.
  emitPipeline?: PipelineEventSink | undefined;
  emitGenui?:    GenUIEventSink | undefined;
}

// Walk the pipeline + GenUI surfaces. Returns the per-stage outcomes
// (iteration count + convergence) so the run service can decide whether
// the run finished cleanly. The caller already started the run; we just
// drive its event stream.
export async function runPipelineForRun(
  input: PipelineRunnerInput,
): Promise<StageOutcomeRecord[]> {
  // Pre-stage GenUI: surfaces with no `trigger.stageId` get raised once
  // up-front (typical example: the auto-derived `__auto_connector_*`
  // oauth-prompts that the apply path created when a required connector
  // was not yet connected). The cache short-circuit here is what makes
  // e2e-5 pass: a second conversation in the same project skips the
  // broadcast.
  const surfaces = input.snapshot.genuiSurfaces ?? [];
  for (const surface of surfaces) {
    if (surface.trigger?.stageId) continue;
    raiseSurface(input, surface);
  }

  // Wrap the user-supplied stage runner so we can intercept stage entry
  // for stage-bound surface raising before delegating to the real
  // worker.
  const wrapped: StageRunner = async ({ stage, iteration, snapshot }) => {
    if (iteration === 0) {
      for (const surface of surfaces) {
        if (surface.trigger?.stageId === stage.id) raiseSurface(input, surface);
      }
    }
    return input.runStage({ stage, iteration, snapshot });
  };

  return runPipeline({
    db:       input.db,
    runId:    input.runId,
    snapshot: input.snapshot,
    pipeline: input.pipeline,
    env:      input.env,
    runStage: wrapped,
    ...(input.emitPipeline ? { emit: input.emitPipeline } : {}),
  });
}

function raiseSurface(input: PipelineRunnerInput, surface: GenUISurfaceSpec): void {
  try {
    requestOrReuseSurface(input.db, {
      projectId:        input.projectId,
      conversationId:   input.conversationId ?? null,
      runId:            input.runId,
      pluginSnapshotId: input.snapshot.snapshotId,
      surface,
      ...(input.emitGenui ? { emit: input.emitGenui } : {}),
    });
  } catch (err) {
    // Surface lookups should never crash the pipeline. The error path is
    // surfaced to the run as a normal SSE 'error' event by the caller.
    // eslint-disable-next-line no-console
    console.warn(`[plugins] failed to raise surface ${surface.id}: ${(err as Error).message}`);
  }
}
