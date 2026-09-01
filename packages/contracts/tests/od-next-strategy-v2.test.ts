import { describe, expect, it } from 'vitest';
import {
  AgentCapabilitySnapshotV2Schema,
  AppliedStrategyBindingV2Schema,
  BundledStrategyDeclarationV2Schema,
  ChildAgentEvidenceV2Schema,
  FullPlanV2Schema,
  OD_NEXT_APPLIED_STRATEGY_SCHEMA,
  OD_NEXT_PLAN_CONTRACT_SCHEMA,
  OD_NEXT_RUNTIME_STATE_SCHEMA,
  OpenDesignPlanContractV2Schema,
  PluginManifestSchema,
  ResolvedTaskProfileV2Schema,
  StrategyRuntimeStateV2Schema,
  StrategyRuntimeTransitionV2Schema,
  StrategyTaskProjectionV2Schema,
} from '../src/index.js';

const hash = 'a'.repeat(64);

function taskProfile(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '2',
    taskType: 'prototype',
    taskProfileVersion: '2.0.0',
    goal: 'Build a focused product prototype.',
    contextAndAudience: 'Product operators using a desktop browser.',
    inputsAndReferences: ['brief:request'],
    constraints: ['Keep the supplied brand copy unchanged.'],
    canonicalDeliverable: {
      id: 'prototype-source',
      kind: 'prototype',
      format: 'html',
    },
    requiredDeliverables: [
      { id: 'prototype-source', kind: 'html' },
    ],
    designSpec: {
      source: 'resolved-baseline',
      version: 'design-spec-v1',
      decisions: { typeScale: 'compact-product' },
    },
    buildRequirements: [
      { id: 'responsive-flow', text: 'Implement the primary flow at both target widths.' },
    ],
    assumptions: [],
    risks: [],
    taskSpecific: { primaryFlow: 'create-project' },
    ...overrides,
  };
}

function simplePlan() {
  return {
    executionMode: 'simple',
    steps: [
      { id: 'build', objective: 'Build the prototype.', outputs: ['prototype-source'] },
    ],
    readinessArtifacts: [
      { id: 'design-spec', version: '1', digest: hash },
    ],
    buildPackages: [],
  };
}

function complexPlan() {
  return {
    executionMode: 'complex',
    steps: [
      { id: 'shell', objective: 'Build the shared shell.', outputs: ['shell'] },
      {
        id: 'flow',
        objective: 'Build the primary flow.',
        outputs: ['flow'],
        dependsOn: ['shell'],
      },
    ],
    readinessArtifacts: [
      { id: 'design-spec', version: '1', digest: hash },
    ],
    buildPackages: [
      {
        id: 'shell',
        objective: 'Build the shared shell.',
        inputs: ['design-spec'],
        outputs: ['shell'],
        sharedConstraints: ['Use the frozen type and spacing tokens.'],
        dependsOn: [],
        allowedResources: ['project-source'],
      },
      {
        id: 'flow',
        objective: 'Build the primary flow.',
        inputs: ['shell'],
        outputs: ['flow'],
        sharedConstraints: ['Use the frozen type and spacing tokens.'],
        dependsOn: ['shell'],
        allowedResources: ['project-source'],
      },
    ],
  };
}

function planContract(fullPlan = simplePlan()) {
  return {
    schema: OD_NEXT_PLAN_CONTRACT_SCHEMA,
    strategy: {
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: hash,
      snapshotId: 'snapshot-1',
    },
    taskProfile: taskProfile(),
    fullPlan,
    runManifest: {
      selectedAgentId: 'codex',
      capabilitySnapshotHash: hash,
      inputRefs: ['brief:request'],
      productionRoutes: ['prototype-html'],
      preflight: { intake: 'passed', execution: 'passed' },
    },
    decisionSummary: {
      goal: 'Build a focused product prototype.',
      deliverables: ['Editable HTML prototype'],
      keyConstraints: ['Keep the supplied brand copy unchanged.'],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

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

describe('OD Next V2 planning contracts', () => {
  it('parses profile, simple plan, complex packages, and a complete Plan Contract', () => {
    expect(ResolvedTaskProfileV2Schema.parse(taskProfile()).taskType).toBe('prototype');
    expect(FullPlanV2Schema.parse(simplePlan()).buildPackages).toEqual([]);
    expect(FullPlanV2Schema.parse(complexPlan()).buildPackages).toHaveLength(2);
    expect(OpenDesignPlanContractV2Schema.parse(planContract()).schema).toBe(
      OD_NEXT_PLAN_CONTRACT_SCHEMA,
    );
  });

  it('rejects complex plans without two packages and rejects invalid dependency graphs', () => {
    expect(() => FullPlanV2Schema.parse({
      ...complexPlan(),
      buildPackages: complexPlan().buildPackages.slice(0, 1),
    })).toThrow(/at least two/);

    const cyclic = complexPlan();
    cyclic.buildPackages[0]!.dependsOn = ['flow'];
    expect(() => FullPlanV2Schema.parse(cyclic)).toThrow(/acyclic/);

    const missingSharedConstraints = complexPlan();
    missingSharedConstraints.buildPackages[0]!.sharedConstraints = [];
    expect(() => FullPlanV2Schema.parse(missingSharedConstraints)).toThrow();

    const duplicateOutput = complexPlan();
    duplicateOutput.buildPackages[1]!.outputs = ['shell'];
    expect(() => FullPlanV2Schema.parse(duplicateOutput)).toThrow(/already owned/);
  });

  it.each([
    ['acceptanceChecklist', []],
    ['candidateEvidenceBundle', { files: [] }],
    ['completionGate', { state: 'pending' }],
    ['critique', { score: 4 }],
    ['evidencePlan', { source: 'render' }],
    ['finalEvidenceBundle', { files: [] }],
    ['qualityScore', 5],
    ['judge', { state: 'pending' }],
    ['acceptance', 'passed'],
    ['repairAttempts', 1],
    ['repairRequired', true],
    ['repeat', true],
    ['revalidation', { state: 'pending' }],
  ])('rejects forbidden field %s even inside extensible task data', (key, value) => {
    expect(() => ResolvedTaskProfileV2Schema.parse(taskProfile({
      taskSpecific: { nested: { [key]: value } },
    }))).toThrow(/does not allow post-Build field/);
    expect(() => ResolvedTaskProfileV2Schema.parse(taskProfile({
      designSpec: {
        source: 'resolved-baseline',
        version: 'design-spec-v1',
        decisions: { nested: { [key]: value } },
      },
    }))).toThrow(/does not allow post-Build field/);
    expect(() => OpenDesignPlanContractV2Schema.parse({
      ...planContract(),
      [key]: value,
    })).toThrow();
  });
});

describe('OD Next V2 runtime state and transitions', () => {
  it.each([
    { route: 'direct_edit', inputStage: 'request', outcome: 'completed', executionMode: 'simple' },
    { route: 'direct_edit', inputStage: 'request', outcome: 'blocked', executionMode: 'simple' },
    { route: 'full_plan', inputStage: 'request', outcome: 'clarification_required', executionMode: null },
    { route: 'full_plan', inputStage: 'clarification', outcome: 'plan_ready', executionMode: 'simple' },
    { route: 'full_plan', inputStage: 'contract_repair', outcome: 'plan_ready', executionMode: 'complex' },
    { route: 'full_plan', inputStage: 'production', outcome: 'completed', executionMode: 'simple' },
    { route: 'full_plan', inputStage: 'production', outcome: 'canceled', executionMode: 'complex' },
  ])('accepts $route/$inputStage/$outcome', (state) => {
    expect(StrategyRuntimeStateV2Schema.parse({
      schema: OD_NEXT_RUNTIME_STATE_SCHEMA,
      reasonCodes: [],
      ...state,
    })).toMatchObject(state);
  });

  it('rejects Direct Edit continuation, route switching, mode switching, and reverse stages', () => {
    expect(() => StrategyRuntimeStateV2Schema.parse({
      schema: OD_NEXT_RUNTIME_STATE_SCHEMA,
      route: 'full_plan',
      inputStage: 'request',
      outcome: 'completed',
      executionMode: 'simple',
      reasonCodes: [],
    })).toThrow(/cannot complete before Production/);

    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'direct_edit', inputStage: 'request', executionMode: 'simple' },
      to: { route: 'direct_edit', inputStage: 'production', executionMode: 'simple' },
    })).toThrow(/Direct Edit/);

    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'request', executionMode: 'simple' },
      to: { route: 'direct_edit', inputStage: 'production', executionMode: 'simple' },
    })).toThrow(/route is locked/);

    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'contract_repair', executionMode: 'simple' },
      to: { route: 'full_plan', inputStage: 'production', executionMode: 'complex' },
    })).toThrow(/Execution mode is locked/);

    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'production', executionMode: 'simple' },
      to: { route: 'full_plan', inputStage: 'request', executionMode: 'simple' },
    })).toThrow(/Illegal/);
  });

  it('locks repair mode and enters clarification before mode selection', () => {
    expect(() => StrategyRuntimeStateV2Schema.parse({
      schema: OD_NEXT_RUNTIME_STATE_SCHEMA,
      route: 'full_plan',
      inputStage: 'contract_repair',
      outcome: 'blocked',
      executionMode: null,
      reasonCodes: ['invalid_contract'],
    })).toThrow(/already-locked/);

    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'request', executionMode: null },
      to: { route: 'full_plan', inputStage: 'contract_repair', executionMode: null },
    })).toThrow(/previously locked/);
    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'contract_repair', executionMode: null },
      to: { route: 'full_plan', inputStage: 'production', executionMode: 'simple' },
    })).toThrow(/cannot continue/);
    expect(() => StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'request', executionMode: 'simple' },
      to: { route: 'full_plan', inputStage: 'clarification', executionMode: 'simple' },
    })).toThrow(/entering clarification/);

    expect(StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'request', executionMode: null },
      to: { route: 'full_plan', inputStage: 'clarification', executionMode: null },
    }).to.inputStage).toBe('clarification');
    expect(StrategyRuntimeTransitionV2Schema.parse({
      from: { route: 'full_plan', inputStage: 'request', executionMode: 'complex' },
      to: { route: 'full_plan', inputStage: 'contract_repair', executionMode: 'complex' },
    }).to.executionMode).toBe('complex');
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
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      outcome: 'completed',
      terminal: false,
    })).toThrow(/terminal/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      inputStage: 'request',
      outcome: 'completed',
      nextRunId: undefined,
      terminal: true,
    })).toThrow(/only after Production/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      route: 'direct_edit',
      inputStage: 'request',
      outcome: 'plan_ready',
      nextRunId: 'run-production',
      terminal: false,
    })).toThrow(/transition table/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      inputStage: 'production',
      outcome: 'plan_ready',
      nextRunId: 'run-production',
      terminal: false,
    })).toThrow(/transition table/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      inputStage: 'contract_repair',
      outcome: 'running',
      executionMode: null,
      nextRunId: undefined,
      terminal: false,
    })).toThrow(/locked execution mode/);
    expect(() => StrategyTaskProjectionV2Schema.parse({
      ...projection,
      inputStage: 'contract_repair',
      outcome: 'blocked',
      executionMode: null,
      nextRunId: undefined,
      terminal: true,
    })).toThrow(/locked execution mode/);
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
