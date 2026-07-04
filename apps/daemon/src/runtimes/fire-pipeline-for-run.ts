// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// Strangler-fig MOVE of the firePipelineForRun closure; new code must NOT copy this.
/** @module fire-pipeline-for-run
 * Fires a run's plugin pipeline schedule onto its SSE stream: picks the stage
 * runner (registry atom-workers by default, `OD_PIPELINE_RUNNER=stub` for the
 * canned v1 stub), emits the first pipeline_stage_started synchronously, and
 * drives the async tail via runPipelineForRun. Errors are swallowed (logged as
 * pipeline_stage_failed) so a bad pipeline never blocks the agent run.
 *
 * Extracted verbatim from apps/daemon/src/server.ts's startServer closure. All
 * inputs arrive via `args` ({ run, snapshot, runs, db }); no server.ts-scope
 * captures, so this is a plain exported function (unlike createStartChatRun).
 */

import { readPluginEnvKnobs } from '../app-config.js';
import {
  registerBuiltInAtomWorkers,
  runPipelineForRun,
  runStageWithRegistry,
} from '../plugins/index.js';

  // Plan §3.I1 / §3.D / spec §10.1: fire the pipeline schedule on a
  // run's SSE stream. Synchronous first emit (the first
  // pipeline_stage_started event lands before the agent process
  // starts) + async tail. Stage D wires the atom-worker registry as
  // the default stage runner; set OD_PIPELINE_RUNNER=stub to fall
  // back to the canned v1 stub for diagnostic bisection or replay
  // of pre-Stage-D runs. Errors are swallowed (logged) so a bad
  // pipeline never blocks the agent run.
export const firePipelineForRun = (args) => {
    const { run, snapshot, runs, db: dbHandle } = args;
    if (!snapshot?.pipeline?.stages?.length) return;
    const env = { maxIterations: readPluginEnvKnobs().maxDevloopIterations };
    const emitPipeline = (evt) => {
      try { runs.emit(run, evt.kind, evt); } catch {/* ignore */}
    };
    const emitGenui = (evt) => {
      try { runs.emit(run, evt.kind, evt); } catch {/* ignore */}
    };
    const projectIdForRun = run.projectId
      ?? snapshot.resolvedContext?.items?.[0]?.id
      ?? 'project-unknown';
    const runnerMode = process.env.OD_PIPELINE_RUNNER === 'stub'
      ? 'stub'
      : 'registry';
    let runStage;
    if (runnerMode === 'stub') {
      runStage = ({ iteration }) => ({
        signals: {
          'critique.score':  iteration >= 0 ? 4 : 0,
          'preview.ok':      true,
          'user.confirmed':  true,
        },
      });
    } else {
      registerBuiltInAtomWorkers();
      runStage = async ({ stage, iteration, snapshot: stageSnapshot }) => {
        const outcome = await runStageWithRegistry({
          db:             dbHandle,
          runId:          run.id,
          projectId:      projectIdForRun,
          conversationId: run.conversationId ?? null,
          stage,
          iteration,
          snapshot:       stageSnapshot,
        });
        return {
          signals:         outcome.signals,
          critiqueSummary: outcome.critiqueSummary,
        };
      };
    }
    void runPipelineForRun({
      db: dbHandle,
      runId:           run.id,
      projectId:       projectIdForRun,
      conversationId:  run.conversationId ?? null,
      snapshot,
      pipeline:        snapshot.pipeline,
      env,
      runStage,
      emitPipeline,
      emitGenui,
    }).catch((err) => {
      try {
        runs.emit(run, 'pipeline_stage_failed', {
          runId:      run.id,
          snapshotId: snapshot.snapshotId,
          message:    String(err?.message ?? err),
        });
      } catch { /* ignore */ }
    });
  };
