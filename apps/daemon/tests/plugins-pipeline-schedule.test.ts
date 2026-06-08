import { describe, expect, it } from 'vitest';
import type { AppliedPluginSnapshot, GenUISurfaceSpec, PluginPipeline } from '@open-design/contracts';
import {
  splitPipelineByExecutionBoundary,
  splitPipelineSnapshotByExecutionBoundary,
} from '../src/plugins/pipeline-schedule.js';

describe('splitPipelineByExecutionBoundary', () => {
  it('keeps pre-run-only pipelines intact', () => {
    const pipeline: PluginPipeline = {
      stages: [
        { id: 'discovery', atoms: ['discovery-question-form'] },
        { id: 'plan', atoms: ['todo-write'] },
      ],
    };

    const schedule = splitPipelineByExecutionBoundary(pipeline);

    expect(schedule.preRun).toEqual(pipeline);
    expect(schedule.postRun).toBeNull();
  });

  it('defers visual-validation stages until after the run succeeds', () => {
    const pipeline: PluginPipeline = {
      stages: [
        { id: 'discovery', atoms: ['discovery-question-form'] },
        { id: 'generate', atoms: ['file-write', 'live-artifact'] },
        {
          id: 'critique',
          atoms: ['critique-theater', 'visual-validation'],
          repeat: true,
          until: 'critique.score>=4 || iterations>=3',
        },
      ],
    };

    const schedule = splitPipelineByExecutionBoundary(pipeline);

    expect(schedule.preRun?.stages.map((stage) => stage.id)).toEqual([
      'discovery',
      'generate',
    ]);
    expect(schedule.postRun?.stages.map((stage) => stage.id)).toEqual([
      'critique',
    ]);
  });

  it('keeps the full suffix in post-run order once a post-run atom appears', () => {
    const pipeline: PluginPipeline = {
      stages: [
        { id: 'direction', atoms: ['discovery-question-form'] },
        { id: 'patch', atoms: ['file-write'] },
        { id: 'critique', atoms: ['critique-theater', 'visual-validation'] },
        { id: 'handoff', atoms: ['handoff'] },
      ],
    };

    const schedule = splitPipelineByExecutionBoundary(pipeline);

    expect(schedule.preRun?.stages.map((stage) => stage.id)).toEqual([
      'direction',
      'patch',
    ]);
    expect(schedule.postRun?.stages.map((stage) => stage.id)).toEqual([
      'critique',
      'handoff',
    ]);
  });
});

describe('splitPipelineSnapshotByExecutionBoundary', () => {
  it('keeps triggerless surfaces in pre-run only and stage-scopes the deferred suffix', () => {
    const surfaces: GenUISurfaceSpec[] = [
      { id: 'confirm', kind: 'confirmation', persist: 'run' },
      { id: 'direction-form', kind: 'form', persist: 'run', trigger: { stageId: 'direction' } },
      { id: 'critique-form', kind: 'form', persist: 'run', trigger: { stageId: 'critique' } },
      { id: 'handoff-form', kind: 'form', persist: 'run', trigger: { stageId: 'handoff' } },
    ];
    const snapshot = {
      snapshotId: 'snap-1',
      pluginId: 'sample-plugin',
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'digest-1',
      inputs: {},
      resolvedContext: { items: [] },
      capabilitiesGranted: [],
      capabilitiesRequired: [],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 0,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      pipeline: {
        stages: [
          { id: 'direction', atoms: ['discovery-question-form'] },
          { id: 'critique', atoms: ['visual-validation'] },
          { id: 'handoff', atoms: ['handoff'] },
        ],
      },
      genuiSurfaces: surfaces,
      status: 'fresh',
    } as AppliedPluginSnapshot;

    const split = splitPipelineSnapshotByExecutionBoundary(snapshot);

    expect(split.preRun?.pipeline?.stages.map((stage) => stage.id)).toEqual(['direction']);
    expect(split.preRun?.genuiSurfaces?.map((surface) => surface.id)).toEqual([
      'confirm',
      'direction-form',
    ]);
    expect(split.postRun?.pipeline?.stages.map((stage) => stage.id)).toEqual([
      'critique',
      'handoff',
    ]);
    expect(split.postRun?.genuiSurfaces?.map((surface) => surface.id)).toEqual([
      'critique-form',
      'handoff-form',
    ]);
  });

  it('raises triggerless surfaces before an all-deferred pipeline starts', () => {
    const snapshot = {
      snapshotId: 'snap-2',
      pluginId: 'sample-plugin',
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'digest-2',
      inputs: {},
      resolvedContext: { items: [] },
      capabilitiesGranted: [],
      capabilitiesRequired: [],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 0,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      pipeline: {
        stages: [
          { id: 'critique', atoms: ['visual-validation'] },
          { id: 'handoff', atoms: ['handoff'] },
        ],
      },
      genuiSurfaces: [
        { id: 'confirm', kind: 'confirmation', persist: 'run' },
        { id: 'critique-form', kind: 'form', persist: 'run', trigger: { stageId: 'critique' } },
        { id: 'handoff-form', kind: 'form', persist: 'run', trigger: { stageId: 'handoff' } },
      ],
      status: 'fresh',
    } as AppliedPluginSnapshot;

    const split = splitPipelineSnapshotByExecutionBoundary(snapshot);

    expect(split.preRun?.pipeline?.stages).toEqual([]);
    expect(split.preRun?.genuiSurfaces?.map((surface) => surface.id)).toEqual([
      'confirm',
    ]);
    expect(split.postRun?.genuiSurfaces?.map((surface) => surface.id)).toEqual([
      'critique-form',
      'handoff-form',
    ]);
  });
});
