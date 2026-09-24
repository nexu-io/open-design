import { describe, expect, it } from 'vitest';
import {
  AgentCapabilitySnapshotV2Schema,
  AppliedStrategyBindingV2Schema,
  BundledStrategyDeclarationV2Schema,
  ChildAgentEvidenceV2Schema,
  OD_NEXT_APPLIED_STRATEGY_SCHEMA,
  PluginManifestSchema,
  StrategyTaskProjectionV2Schema,
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

describe('OD Next V2 capability, Child, and task projection contracts', () => {
  it('requires structured evidence before native Child support is verified', () => {
    expect(AgentCapabilitySnapshotV2Schema.parse({
      agentId: 'codex',
      agentVersion: '1.0.0',
      nativeSessionContinuation: 'verified',
      nativeSubagents: {
        support: 'verified',
        evidenceLevel: 'structured',
        source: 'fixture:codex-v1',
      },
      capturedAt: 1,
    }).nativeSubagents.support).toBe('verified');

    expect(() => AgentCapabilitySnapshotV2Schema.parse({
      agentId: 'codex',
      nativeSessionContinuation: 'verified',
      nativeSubagents: {
        support: 'verified',
        evidenceLevel: 'tool_only',
        source: 'self-report',
      },
      capturedAt: 1,
    })).toThrow(/structured/);
  });

  it('parses structured Child lifecycle facts without assigning result quality', () => {
    expect(ChildAgentEvidenceV2Schema.parse({
      childId: 'child-1',
      parentId: 'run-1',
      packageId: 'shell',
      state: 'completed',
      source: 'codex-jsonl',
      sourceEventType: 'task_complete',
      startedAt: 10,
      endedAt: 20,
    }).state).toBe('completed');
    expect(ChildAgentEvidenceV2Schema.parse({
      childId: 'child-without-clock',
      state: 'failed',
      source: 'opencode-event',
      sourceEventType: 'session.error',
    }).endedAt).toBeUndefined();
  });

  it('keeps the optional task projection internally consistent', () => {
    const projection = {
      taskExecutionId: 'task-1',
      strategy: {
        id: 'od-next-strategy',
        version: '2.0.0',
        packageHash: hash,
        snapshotId: 'snapshot-1',
      },
      inputStage: 'request',
      outcome: 'plan_ready',
      route: 'full_plan',
      executionMode: 'simple',
      activeRunId: 'run-plan',
      nextRunId: 'run-production',
      terminal: false,
    };
    expect(StrategyTaskProjectionV2Schema.parse(projection)).toEqual(projection);
    for (const [legacy, reason] of [['production_ready', 'continued'], ['run_failed', 'ended'], ['todo_unfinished', 'ended']]) {
      expect(StrategyTaskProjectionV2Schema.parse({ ...projection, settlementReason: legacy }).settlementReason).toBe(reason);
    }
    const mapped = { ...projection, runMappings: [
      { runId: 'run-plan', taskRunIndex: 0 },
      { runId: 'run-production', taskRunIndex: 1 },
    ] };
    expect(StrategyTaskProjectionV2Schema.parse(mapped)).toEqual(mapped);
    for (const taskRunIndex of [-1, 0.5]) {
      expect(() => StrategyTaskProjectionV2Schema.parse({
        ...projection, runMappings: [{ runId: 'run-plan', taskRunIndex }],
      })).toThrow();
    }

    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      outcome: 'completed',
      terminal: false,
    })).toThrow(/terminal/);
    expect(StrategyTaskProjectionV2Schema.parse({
      ...projection, inputStage: 'request', outcome: 'completed', route: null,
      executionMode: null, nextRunId: undefined, terminal: true, deliverableValid: false,
    })).toMatchObject({ outcome: 'completed', deliverableValid: false });

    // No task settles as blocked any more, and a projection carries no block context.
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection, outcome: 'blocked', nextRunId: undefined, terminal: true,
    })).toThrow();
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection, outcome: 'completed', nextRunId: undefined, terminal: true,
      blockedContext: { reasonCodes: ['od_next_protocol_runtime_state_missing'], visibleText: null },
    })).toThrow();
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
