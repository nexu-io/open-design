import { describe, expect, it } from 'vitest';
import {
  AppliedStrategyBindingV2Schema,
  BundledStrategyDeclarationV2Schema,
  OD_NEXT_APPLIED_STRATEGY_SCHEMA,
  OD_NEXT_NO_DECLARATIONS_V2,
  PluginManifestSchema,
  StrategyTaskProjectionV2Schema,
  StrategyTaskSettlementReasonV2Schema,
  readStrategyTaskDeclarationsV2,
} from '../src/index.js';

const hash = 'a'.repeat(64);

describe('OD Next V2 bundled declaration and applied identity', () => {
  it('parses the versioned asset declaration without changing legacy manifests', () => {
    const legacy = PluginManifestSchema.parse({
      name: 'legacy-scenario',
      version: '1.0.0',
      od: {
        kind: 'scenario',
        strategy: {
          schema: 'community.example/v9',
          authorExtension: true,
        },
      },
    });
    expect((legacy.od as Record<string, unknown>)['strategy']).toEqual({
      schema: 'community.example/v9',
      authorExtension: true,
    });

    const manifest = PluginManifestSchema.parse({
      name: 'od-next-strategy',
      version: '2.0.0',
      od: {
        kind: 'scenario',
        strategy: {
          schema: 'open-design.bundled-strategy/v2',
          id: 'od-next-strategy',
          promptRecipe: 'od-next-plan-build-v2',
          assets: {
            core: { path: './assets/core.md', version: '2.0.0' },
            orchestration: { path: './assets/orchestration.md', version: '2.0.0' },
            taskProfiles: [
              { taskType: 'prototype', path: './profiles/prototype.md', version: '2', rollout: 'active', projectKinds: ['prototype'] },
              { taskType: 'ppt', path: './profiles/ppt.md', version: '2', rollout: 'reserved', projectKinds: ['deck'] },
              { taskType: 'marketing', path: './profiles/marketing.md', version: '2', rollout: 'reserved', projectKinds: ['image'] },
              { taskType: 'hyperframes', path: './profiles/hyperframes.md', version: '2', rollout: 'active', projectKinds: ['video'] },
            ],
            taskProfileMapping: { path: './references/mapping.md', version: '2' },
          },
        },
      },
    });
    const declaration = BundledStrategyDeclarationV2Schema.parse(
      (manifest.od as Record<string, unknown>)['strategy'],
    );
    expect(declaration.promptRecipe).toBe('od-next-plan-build-v2');
  });

  it('accepts a complete applied content binding and rejects ambiguous profile identity', () => {
    const binding = {
      schema: OD_NEXT_APPLIED_STRATEGY_SCHEMA,
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: hash,
      assetDigests: [
        { path: './assets/core.md', sha256: hash },
        { path: './assets/orchestration.md', sha256: 'b'.repeat(64) },
        { path: './assets/prototype.md', sha256: 'c'.repeat(64) },
      ],
      selectedTaskProfile: {
        taskType: 'prototype',
        version: 'prototype@2.0.0',
        path: './assets/prototype.md',
        sha256: 'c'.repeat(64),
      },
      taskProfileVersions: ['prototype@2.0.0'],
      promptRecipe: 'od-next-plan-build-v2',
    };
    expect(AppliedStrategyBindingV2Schema.parse(binding)).toEqual(binding);
    expect(() => AppliedStrategyBindingV2Schema.parse({
      ...binding,
      assetDigests: [binding.assetDigests[0], binding.assetDigests[0]],
    })).toThrow(/unique/);
    expect(() => AppliedStrategyBindingV2Schema.parse({
      ...binding,
      assetDigests: [...binding.assetDigests].reverse(),
    })).toThrow(/stable path order/);
    expect(() => AppliedStrategyBindingV2Schema.parse({
      ...binding,
      selectedTaskProfile: {
        ...binding.selectedTaskProfile,
        sha256: 'd'.repeat(64),
      },
    })).toThrow(/digest must match/);
  });
});

describe('OD Next V2 task projection and settlement contracts', () => {
  it('keeps the task projection internally consistent', () => {
    const running = {
      taskExecutionId: 'task-1',
      strategy: {
        id: 'od-next-strategy',
        version: '2.0.0',
        packageHash: hash,
        snapshotId: 'snapshot-1',
      },
      inputStage: 'request',
      outcome: 'running',
      route: 'full_plan',
      executionMode: 'simple',
      activeRunId: 'run-plan',
      nextRunId: 'run-build',
      terminal: false,
      deliverableWritten: false,
      autoRoundCount: 1,
    };
    expect(StrategyTaskProjectionV2Schema.parse(running)).toEqual(running);
    const mapped = { ...running, runMappings: [
      { runId: 'run-plan', taskRunIndex: 0 },
      { runId: 'run-build', taskRunIndex: 1 },
    ] };
    expect(StrategyTaskProjectionV2Schema.parse(mapped)).toEqual(mapped);
    for (const taskRunIndex of [-1, 0.5]) {
      expect(() => StrategyTaskProjectionV2Schema.parse({
        ...running, runMappings: [{ runId: 'run-plan', taskRunIndex }],
      })).toThrow();
    }
    const settled = {
      ...running,
      inputStage: 'production',
      outcome: 'completed',
      activeRunId: 'run-build',
      nextRunId: undefined,
      terminal: true,
      deliverableWritten: true,
      settlementReason: 'deliverable_changed',
    };
    expect(StrategyTaskProjectionV2Schema.parse(settled)).toEqual({
      ...settled,
      nextRunId: undefined,
    });
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...running,
      outcome: 'completed',
      terminal: false,
    })).toThrow(/terminal/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...settled,
      nextRunId: 'run-extra',
    })).toThrow(/next Run/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...running,
      settlementReason: 'question',
    })).toThrow(/completed task/);
    // Rows written by earlier daemons keep their stage and outcome vocabulary.
    const legacy = {
      ...running,
      inputStage: 'clarification',
      outcome: 'clarification_required',
      route: null,
      executionMode: null,
      nextRunId: undefined,
    };
    expect(StrategyTaskProjectionV2Schema.parse(legacy)).toEqual({ ...legacy, nextRunId: undefined });
  });

  it('names every settlement bucket once and reads declarations leniently', () => {
    expect(StrategyTaskSettlementReasonV2Schema.options).toEqual([
      'question',
      'deliverable_changed',
      'non_design',
      'no_file_writes',
      'note_only',
      'text_only',
      'todo_unfinished',
      'truncated',
      'write_evidence_unknown',
    ]);
    expect(readStrategyTaskDeclarationsV2(null)).toEqual(OD_NEXT_NO_DECLARATIONS_V2);
    expect(readStrategyTaskDeclarationsV2('not an object')).toEqual(OD_NEXT_NO_DECLARATIONS_V2);
    expect(readStrategyTaskDeclarationsV2({ nonDesignRequest: true, extra: 1 })).toEqual({
      nonDesignRequest: true,
      noFileWrites: false,
    });
    expect(readStrategyTaskDeclarationsV2({ noFileWrites: 'yes' })).toEqual(OD_NEXT_NO_DECLARATIONS_V2);
    // Blocks written by older strategy packages map onto the two signals.
    expect(readStrategyTaskDeclarationsV2({ outcome: 'blocked', route: 'full_plan' })).toEqual({
      nonDesignRequest: true,
      noFileWrites: false,
    });
    expect(readStrategyTaskDeclarationsV2({ executionIntent: 'plan_only', outcome: 'completed' })).toEqual({
      nonDesignRequest: false,
      noFileWrites: true,
    });
  });
});

describe('task profile resources', () => {
  const profile = (resources: unknown) => ({
    schema: 'open-design.bundled-strategy/v2',
    id: 'od-next-strategy',
    promptRecipe: 'od-next-plan-build-v2',
    assets: {
      core: { path: './assets/core.md', version: '2.0.0' },
      orchestration: { path: './assets/orchestration.md', version: '2.0.0' },
      taskProfiles: [
        { taskType: 'prototype', path: './profiles/prototype.md', version: '2.1.0', rollout: 'active', projectKinds: ['prototype'], resources },
        { taskType: 'ppt', path: './profiles/ppt.md', version: '2', rollout: 'reserved', projectKinds: ['deck'] },
        { taskType: 'marketing', path: './profiles/marketing.md', version: '2', rollout: 'reserved', projectKinds: ['image'] },
        { taskType: 'hyperframes', path: './profiles/hyperframes.md', version: '2', rollout: 'active', projectKinds: ['video'] },
      ],
      taskProfileMapping: { path: './references/mapping.md', version: '2' },
    },
  });

  it('accepts declared shell resources on one profile and leaves the others bare', () => {
    const declaration = BundledStrategyDeclarationV2Schema.parse(profile([
      { path: './profiles/prototype/device-frames/iphone.html', version: '1.0.0' },
      { path: './profiles/prototype/device-frames/android.html', version: '1.0.0' },
    ]));
    expect(declaration.assets.taskProfiles[0]?.resources).toHaveLength(2);
    expect(declaration.assets.taskProfiles[1]?.resources).toBeUndefined();
  });

  it('rejects duplicate resource paths and a resource that re-declares the profile itself', () => {
    expect(() => BundledStrategyDeclarationV2Schema.parse(profile([
      { path: './profiles/prototype/device-frames/iphone.html', version: '1.0.0' },
      { path: './profiles/prototype/device-frames/iphone.html', version: '1.0.1' },
    ]))).toThrow(/unique/i);
    expect(() => BundledStrategyDeclarationV2Schema.parse(profile([
      { path: './profiles/prototype.md', version: '1.0.0' },
    ]))).toThrow(/unique/i);
    expect(() => BundledStrategyDeclarationV2Schema.parse(profile([
      { path: '../escape.html', version: '1.0.0' },
    ]))).toThrow();
  });
});
