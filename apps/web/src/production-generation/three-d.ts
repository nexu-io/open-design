import type {
  Production3DPlan,
  Production3DEngine,
  ProductionMediaJob,
  ProductionSegment,
} from './types';

export interface BuildProduction3DPlanInput {
  segment: ProductionSegment;
  styleHint?: string;
  engine?: Production3DPlan['engine'];
  outputIntent?: Production3DPlan['outputIntent'];
  referenceAssetIds?: readonly string[];
  transitionKind?: Production3DPlan['transition']['kind'];
  targetBeat?: string;
}

export function buildProduction3DPlan(input: BuildProduction3DPlanInput): Production3DPlan {
  const paragraph = input.segment.paragraph.trim();
  const shot = input.segment.shot.trim();
  const assets = input.segment.assets.trim();
  const sceneSummary = shot || paragraph || input.segment.label;
  const focus = shot || paragraph || input.segment.label;
  const transitionBeat = input.targetBeat?.trim() || input.segment.output.trim() || sceneSummary;

  return {
    engine: input.engine ?? 'blender',
    purpose: 'product',
    sceneSummary,
    camera: {
      angle: 'three-quarter',
      framing: paragraph ? 'medium' : 'wide',
      movement: 'orbit',
    },
    scene: {
      environment: paragraph ? 'Production-ready explainer stage' : 'Modular studio stage',
      focus,
      lighting: input.styleHint?.trim() || 'Balanced key/fill lighting with clear depth separation.',
      composition: paragraph ? 'Center the hero subject and leave room for labels.' : 'Keep the scene flexible and readable.',
      animationNotes: [
        'Keep transforms editable for later shot revisions.',
        'Separate foreground, subject, and background layers.',
      ],
    },
    assets: {
      sourceAssetIds: input.referenceAssetIds ?? [],
      generatedAssetKinds: ['model', 'lighting', 'camera-path', 'render'],
      notes: [
        shot ? `Camera should support: ${shot}` : 'Camera should be derived from the current beat.',
        assets ? `Source material: ${assets}` : 'Source material can be added later.',
      ],
    },
    transition: {
      kind: input.transitionKind ?? 'match-cut',
      fromBeat: input.segment.label,
      toBeat: transitionBeat,
      notes: ['Design the transition so it can be retimed inside the editor.'],
    },
    styleNotes: [
      input.styleHint?.trim() || 'Keep the scene readable and production-friendly.',
      'Use clean lighting, clear depth separation, and editable scene layers.',
    ],
    objectNotes: [
      `Segment: ${input.segment.label}`,
      shot ? `Shot: ${shot}` : 'Shot: derive from the current script beat.',
      assets ? `Assets: ${assets}` : 'Assets: none yet; keep the scene modular.',
    ],
    outputIntent: input.outputIntent ?? 'turntable',
    referenceAssetIds: input.referenceAssetIds ?? [],
    planOnly: true,
  };
}

export interface Production3DAdapterBuildInput {
  segment: ProductionSegment;
  plan: Production3DPlan;
  jobId: string;
  model?: string;
}

export interface Production3DAdapter {
  readonly name: Production3DEngine;
  buildPlan(input: BuildProduction3DPlanInput): Production3DPlan;
  buildJob(input: Production3DAdapterBuildInput): ProductionMediaJob;
}

export function createProduction3DMediaJob(input: Production3DAdapterBuildInput): ProductionMediaJob {
  const provider = input.plan.engine === 'plugin' ? 'plugin' : 'blender';
  return attachProduction3DPlan(
    {
      id: input.jobId,
      segmentId: input.segment.id,
      kind: '3d',
      status: 'queued',
      provider,
      model: input.model ?? `${input.plan.engine}/plan-only`,
      prompt: `3D plan for ${input.segment.label}: ${input.plan.sceneSummary}`,
      referenceAssetIds: input.plan.referenceAssetIds,
      resultAssetIds: [],
      progress: ['3D plan prepared locally.'],
      file: null,
    },
    input.plan,
  );
}

export const blender3DAdapter: Production3DAdapter = {
  name: 'blender',
  buildPlan: buildProduction3DPlan,
  buildJob: createProduction3DMediaJob,
};

export const plugin3DAdapter: Production3DAdapter = {
  name: 'plugin',
  buildPlan: buildProduction3DPlan,
  buildJob: createProduction3DMediaJob,
};

export function attachProduction3DPlan(
  job: ProductionMediaJob,
  plan: Production3DPlan,
): ProductionMediaJob {
  return {
    ...job,
    plan,
    planOnly: true,
  };
}
