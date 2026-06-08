import type {
  AppliedPluginSnapshot,
  GenUISurfaceSpec,
  PipelineStage,
  PluginPipeline,
} from '@open-design/contracts';

const POST_RUN_ATOMS = new Set([
  'visual-validation',
]);

export interface PipelineScheduleSplit {
  preRun: PluginPipeline | null;
  postRun: PluginPipeline | null;
}

export interface PipelineSnapshotScheduleSplit {
  preRun: AppliedPluginSnapshot | null;
  postRun: AppliedPluginSnapshot | null;
}

export function splitPipelineByExecutionBoundary(
  pipeline: PluginPipeline | null | undefined,
): PipelineScheduleSplit {
  if (!pipeline?.stages?.length) {
    return { preRun: null, postRun: null };
  }

  const postRunStart = pipeline.stages.findIndex((stage) =>
    stage.atoms.some((atomId) => POST_RUN_ATOMS.has(atomId)));
  if (postRunStart < 0) {
    return { preRun: pipeline, postRun: null };
  }

  const preRunStages: PipelineStage[] = pipeline.stages.slice(0, postRunStart);
  const postRunStages: PipelineStage[] = pipeline.stages.slice(postRunStart);

  return {
    preRun: preRunStages.length > 0 ? { ...pipeline, stages: preRunStages } : null,
    postRun: postRunStages.length > 0 ? { ...pipeline, stages: postRunStages } : null,
  };
}

export function splitPipelineSnapshotByExecutionBoundary(
  snapshot: AppliedPluginSnapshot | null | undefined,
): PipelineSnapshotScheduleSplit {
  if (!snapshot) {
    return { preRun: null, postRun: null };
  }

  const pipelineSplit = splitPipelineByExecutionBoundary(snapshot.pipeline);
  const preRunSurfaceOnlySnapshot = buildPreRunSurfaceOnlySnapshot(snapshot, pipelineSplit.preRun);
  return {
    preRun: pipelineSplit.preRun
      ? {
          ...snapshot,
          pipeline: pipelineSplit.preRun,
          genuiSurfaces: filterSurfacesForPipelineStages(
            snapshot.genuiSurfaces,
            pipelineSplit.preRun,
            { includeTriggerless: true },
          ),
        }
      : preRunSurfaceOnlySnapshot,
    postRun: pipelineSplit.postRun
      ? {
          ...snapshot,
          pipeline: pipelineSplit.postRun,
          genuiSurfaces: filterSurfacesForPipelineStages(
            snapshot.genuiSurfaces,
            pipelineSplit.postRun,
            { includeTriggerless: false },
          ),
        }
      : null,
  };
}

function buildPreRunSurfaceOnlySnapshot(
  snapshot: AppliedPluginSnapshot,
  preRunPipeline: PluginPipeline | null,
): AppliedPluginSnapshot | null {
  if (preRunPipeline) return null;
  const triggerlessSurfaces = snapshot.genuiSurfaces?.filter((surface) => !surface.trigger?.stageId);
  if (!triggerlessSurfaces?.length) return null;
  return {
    ...snapshot,
    pipeline: { stages: [] },
    genuiSurfaces: triggerlessSurfaces,
  };
}

function filterSurfacesForPipelineStages(
  surfaces: GenUISurfaceSpec[] | undefined,
  pipeline: PluginPipeline,
  options: { includeTriggerless: boolean },
): GenUISurfaceSpec[] | undefined {
  if (!surfaces?.length) return surfaces;

  const stageIds = new Set(pipeline.stages.map((stage) => stage.id));
  return surfaces.filter((surface) => {
    const stageId = surface.trigger?.stageId;
    if (!stageId) return options.includeTriggerless;
    return stageIds.has(stageId);
  });
}
