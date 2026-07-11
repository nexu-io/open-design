import { describe, expect, it } from 'vitest';

import {
  attachProduction3DPlan,
  blender3DAdapter,
  buildProduction3DPlan,
  createProduction3DMediaJob,
  plugin3DAdapter,
} from '../../src/production-generation/three-d';
import { createFalMediaJob } from '../../src/production-generation/fal';

describe('production 3D plan', () => {
  it('builds an explicit plan-only 3D schema from a segment', () => {
    const plan = buildProduction3DPlan({
      segment: {
        id: 'hook',
        label: 'Hook',
        paragraph: 'Open with the product hero shot.',
        narration: '專業講解者 (professional) 旁白：Open with the product hero shot.',
        shot: '鏡頭：Open with the product hero shot.',
        assets: '素材：Use a clean hero render.',
        output: '成片：Open with the product hero shot.',
        voiceProfileId: 'guide-host',
      },
      styleHint: 'Keep the scene glossy but editable.',
      referenceAssetIds: ['asset-1', 'asset-2'],
    });

    expect(plan.planOnly).toBe(true);
    expect(plan.engine).toBe('blender');
    expect(plan.purpose).toBe('product');
    expect(plan.outputIntent).toBe('turntable');
    expect(plan.camera.angle).toBe('three-quarter');
    expect(plan.scene.focus).toContain('product hero shot');
    expect(plan.scene.animationNotes).toHaveLength(2);
    expect(plan.assets.generatedAssetKinds).toContain('camera-path');
    expect(plan.transition.kind).toBe('match-cut');
    expect(plan.referenceAssetIds).toEqual(['asset-1', 'asset-2']);
    expect(plan.styleNotes[0]).toContain('glossy');
  });

  it('attaches the plan to a media job and keeps it marked as plan-only', () => {
    const job = createFalMediaJob({
      id: 'job-1',
      segmentId: 'hook',
      kind: '3d',
      model: 'blender/plan-only',
      prompt: '3D prompt for Hook: Open with the product hero shot.',
    });
    const plan = buildProduction3DPlan({
      segment: {
        id: 'hook',
        label: 'Hook',
        paragraph: 'Open with the product hero shot.',
        narration: '專業講解者 (professional) 旁白：Open with the product hero shot.',
        shot: '鏡頭：Open with the product hero shot.',
        assets: '素材：Use a clean hero render.',
        output: '成片：Open with the product hero shot.',
        voiceProfileId: 'guide-host',
      },
    });

    const planned = attachProduction3DPlan(job, plan);
    expect(planned.planOnly).toBe(true);
    expect(planned.plan?.engine).toBe('blender');
  });

  it('builds adapter jobs for blender and plugin engines', () => {
    const plan = buildProduction3DPlan({
      segment: {
        id: 'body',
        label: 'Body',
        paragraph: 'Show the working environment.',
        narration: '專業講解者 (professional) 旁白：Show the working environment.',
        shot: '鏡頭：Show the working environment.',
        assets: '素材：Use a scene reference.',
        output: '成片：Show the working environment.',
        voiceProfileId: 'guide-host',
      },
    });

    const blenderJob = blender3DAdapter.buildJob({
      jobId: 'job-blender',
      segment: {
        id: 'body',
        label: 'Body',
        paragraph: 'Show the working environment.',
        narration: '專業講解者 (professional) 旁白：Show the working environment.',
        shot: '鏡頭：Show the working environment.',
        assets: '素材：Use a scene reference.',
        output: '成片：Show the working environment.',
        voiceProfileId: 'guide-host',
      },
      plan,
    });

    const pluginJob = plugin3DAdapter.buildJob({
      jobId: 'job-plugin',
      segment: {
        id: 'body',
        label: 'Body',
        paragraph: 'Show the working environment.',
        narration: '專業講解者 (professional) 旁白：Show the working environment.',
        shot: '鏡頭：Show the working environment.',
        assets: '素材：Use a scene reference.',
        output: '成片：Show the working environment.',
        voiceProfileId: 'guide-host',
      },
      plan: {
        ...plan,
        engine: 'plugin',
      },
    });

    expect(blenderJob.provider).toBe('blender');
    expect(blenderJob.plan?.sceneSummary).toContain('Show the working environment.');
    expect(pluginJob.provider).toBe('plugin');
    expect(pluginJob.plan?.engine).toBe('plugin');
    expect(createProduction3DMediaJob).toBeDefined();
  });
});
