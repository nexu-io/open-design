import { describe, expect, it } from 'vitest';

import {
  OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
  OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
  RuntimeCapabilityEvidenceV1Schema,
  RuntimeCapabilityFixtureManifestV1Schema,
  OdNextRuntimeCapabilitySnapshotV1Schema,
  NormalizedAgentObservationV1Schema,
  evaluateRuntimeEvidenceGraphV1,
  evaluateRuntimeFixtureCaseV1,
  type NormalizedAgentObservationV1,
  type NormalizedAgentObservationStatusV1,
} from '../src/index.js';

const unavailablePrompt = {
  hostComposed: {
    availability: 'unavailable' as const,
    source: 'unknown' as const,
    limitations: ['not_observed'],
  },
  childInjected: {
    availability: 'unavailable' as const,
    source: 'runtime' as const,
    limitations: ['not_observed'],
  },
  agentEffectiveContext: {
    availability: 'unobservable' as const,
    limitations: ['not_observable'],
  },
};

function observation(input: {
  id: string;
  kind?: NormalizedAgentObservationV1['kind'];
  status?: NormalizedAgentObservationStatusV1;
  parentId?: string;
  taskExecutionId?: string;
  runId?: string;
  taskRunIndex?: number;
  runtimeSessionId?: string;
  turnAccounting?: NormalizedAgentObservationV1['turnAccounting'];
  prompt?: NormalizedAgentObservationV1['prompt'];
  usage?: NormalizedAgentObservationV1['usage'];
  timing?: NormalizedAgentObservationV1['timing'];
  attributes?: Record<string, unknown>;
}): NormalizedAgentObservationV1 {
  return {
    schema: 'open-design.normalized-agent-observation/v1',
    identity: {
      observationId: input.id,
      taskExecutionId: input.taskExecutionId ?? 'task-1',
      runId: input.runId ?? 'run-1',
      taskRunIndex: input.taskRunIndex ?? 0,
      ...(input.parentId ? { parentObservationId: input.parentId } : {}),
      ...(input.runtimeSessionId ? { runtimeSessionId: input.runtimeSessionId } : {}),
    },
    kind: input.kind ?? 'task_run',
    stage: 'production',
    status: input.status ?? 'completed',
    prompt: input.prompt ?? unavailablePrompt,
    usage: input.usage ?? {
      availability: 'unavailable',
      source: 'unknown',
      accountingMode: 'unknown',
      limitations: ['not_observed'],
    },
    timing: input.timing ?? {
      availability: 'unavailable',
      limitations: ['not_observed'],
    },
    ...(input.turnAccounting ? { turnAccounting: input.turnAccounting } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
    limitations: [],
  };
}

const allCases = [
  { id: 'main_run', expectedMinimumEvidence: 'L0' },
  { id: 'tool', expectedMinimumEvidence: 'L1' },
  { id: 'child_success', expectedMinimumEvidence: 'L2' },
  { id: 'child_failure_parent_recovers', expectedMinimumEvidence: 'L2' },
  { id: 'cancel', expectedMinimumEvidence: 'L0' },
  { id: 'timeout', expectedMinimumEvidence: 'L0' },
  { id: 'resume', expectedMinimumEvidence: 'L0' },
] as const;

describe('OD Next runtime capability contracts', () => {
  it('keeps contract-only and test-synthetic fixtures distinct from sanitized real recordings', () => {
    const contract = RuntimeCapabilityFixtureManifestV1Schema.parse({
      schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
      fixtureVersion: 'contract/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      runtimeAdapterVersion: 'adapter/v1',
      provenance: {
        kind: 'contract_only',
        reason: 'x1_runtime_fixture_missing',
      },
      containsSensitiveContent: false,
      cases: allCases,
    });
    expect(contract.provenance.kind).toBe('contract_only');

    const synthetic = RuntimeCapabilityFixtureManifestV1Schema.parse({
      ...contract,
      agentCliVersion: 'synthetic-cli/1',
      provenance: { kind: 'test_synthetic', reason: 'deterministic gate test' },
    });
    expect(synthetic.provenance.kind).toBe('test_synthetic');

    expect(() => RuntimeCapabilityFixtureManifestV1Schema.parse({
      ...contract,
      provenance: {
        kind: 'sanitized_real',
        recordingDigest: `sha256:${'a'.repeat(64)}`,
        anonymizationVersion: 'redaction/v1',
        evidenceReview: 'open_design_best_effort',
      },
    })).toThrow(/exact recorded Agent CLI version/i);
  });

  it('requires every minimum replay case exactly once', () => {
    expect(() => RuntimeCapabilityFixtureManifestV1Schema.parse({
      schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
      fixtureVersion: 'contract/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      runtimeAdapterVersion: 'adapter/v1',
      provenance: {
        kind: 'contract_only',
        reason: 'x1_runtime_fixture_missing',
      },
      containsSensitiveContent: false,
      cases: allCases.filter((fixtureCase) => fixtureCase.id !== 'timeout'),
    })).toThrow(/missing required case timeout/i);

    expect(() => RuntimeCapabilityFixtureManifestV1Schema.parse({
      schema: OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA,
      fixtureVersion: 'contract/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      runtimeAdapterVersion: 'adapter/v1',
      provenance: {
        kind: 'contract_only',
        reason: 'x1_runtime_fixture_missing',
      },
      containsSensitiveContent: false,
      cases: [...allCases, allCases[0]],
    })).toThrow(/case ids must be unique/i);
  });

  it('does not let advertisements or synthetic evidence claim verified support', () => {
    const caseResults = allCases.map(({ id }) => ({ id, outcome: 'passed' as const }));
    for (const source of ['runtime_advertisement', 'test_synthetic'] as const) {
      expect(() => RuntimeCapabilityEvidenceV1Schema.parse({
        schema: OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
        source,
        nativeSessionContinuation: { support: 'verified', evidenceLevel: 'L0' },
        nativeSubagents: { support: 'verified', evidenceLevel: 'L2' },
        caseResults,
      })).toThrow(/fixture replay evidence/i);
    }
  });

  it('requires verified subagents to carry structured lifecycle cases and L2 or L3', () => {
    const caseResults = allCases.map(({ id }) => ({
      id,
      outcome: id === 'child_success' ? 'unavailable' as const : 'passed' as const,
    }));
    expect(() => RuntimeCapabilityEvidenceV1Schema.parse({
      schema: OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
      source: 'fixture_replay',
      nativeSessionContinuation: { support: 'verified', evidenceLevel: 'L0' },
      nativeSubagents: { support: 'verified', evidenceLevel: 'L1' },
      caseResults,
    })).toThrow(/L2 or L3|child_success/i);
  });

  it('does not replace unknown with unsupported without a failed fixture replay', () => {
    expect(() => RuntimeCapabilityEvidenceV1Schema.parse({
      schema: OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
      source: 'runtime_advertisement',
      nativeSessionContinuation: { support: 'unsupported', evidenceLevel: 'L0' },
      nativeSubagents: { support: 'unsupported', evidenceLevel: 'L0' },
      caseResults: allCases.map(({ id }) => ({ id, outcome: 'unavailable' })),
    })).toThrow(/failed resume fixture replay|failed child fixture replay/i);
  });

  it('requires a fixture replay to report the complete minimum case set', () => {
    expect(() => RuntimeCapabilityEvidenceV1Schema.parse({
      schema: OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA,
      source: 'fixture_replay',
      nativeSessionContinuation: { support: 'unknown', evidenceLevel: 'L0' },
      nativeSubagents: { support: 'unknown', evidenceLevel: 'L0' },
      caseResults: allCases
        .filter(({ id }) => id !== 'tool')
        .map(({ id }) => ({ id, outcome: 'unavailable' })),
    })).toThrow(/missing required case tool/i);
  });

  it('keeps recorded fixture versions as provenance while current versions stay optional diagnostics', () => {
    expect(() => OdNextRuntimeCapabilitySnapshotV1Schema.parse({
      schema: 'open-design.od-next-runtime-capability-snapshot/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      agentCliVersion: 'synthetic-cli/1',
      recordedAgentCliVersion: 'recorded-cli/1',
      runtimeAdapterVersion: 'adapter/v1',
      fixtureVersion: 'contract/v1',
      fixtureHash: `sha256:${'a'.repeat(64)}`,
      nativeSessionContinuation: {
        support: 'verified',
        evidenceLevel: 'L0',
        source: 'test_synthetic',
      },
      nativeSubagents: {
        support: 'unknown',
        evidenceLevel: 'L0',
        source: 'test_synthetic',
      },
      capturedAt: 1,
      snapshotHash: `sha256:${'b'.repeat(64)}`,
    })).toThrow(/sanitized real fixture replay/i);

    const versionlessSnapshot = OdNextRuntimeCapabilitySnapshotV1Schema.parse({
      schema: 'open-design.od-next-runtime-capability-snapshot/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      recordedAgentCliVersion: 'recorded-cli/1',
      runtimeAdapterVersion: 'adapter/v1',
      fixtureVersion: 'contract/v1',
      fixtureHash: `sha256:${'b'.repeat(64)}`,
      nativeSessionContinuation: {
        support: 'verified',
        evidenceLevel: 'L0',
        source: 'sanitized_fixture_replay',
      },
      nativeSubagents: {
        support: 'unknown',
        evidenceLevel: 'L0',
        source: 'unverified',
      },
      capturedAt: 1,
      snapshotHash: `sha256:${'c'.repeat(64)}`,
    });
    expect(versionlessSnapshot).toMatchObject({
      recordedAgentCliVersion: 'recorded-cli/1',
    });
    expect(versionlessSnapshot).not.toHaveProperty('agentCliVersion');

    expect(() => OdNextRuntimeCapabilitySnapshotV1Schema.parse({
      schema: 'open-design.od-next-runtime-capability-snapshot/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      runtimeAdapterVersion: 'adapter/v1',
      fixtureVersion: 'contract/v1',
      fixtureHash: `sha256:${'b'.repeat(64)}`,
      nativeSessionContinuation: {
        support: 'verified',
        evidenceLevel: 'L0',
        source: 'sanitized_fixture_replay',
      },
      nativeSubagents: {
        support: 'unknown',
        evidenceLevel: 'L0',
        source: 'unverified',
      },
      capturedAt: 1,
      snapshotHash: `sha256:${'c'.repeat(64)}`,
    })).toThrow(/exact recorded Agent CLI version/i);
  });

  it('does not let runtime advertising downgrade unknown support to unsupported', () => {
    expect(() => OdNextRuntimeCapabilitySnapshotV1Schema.parse({
      schema: 'open-design.od-next-runtime-capability-snapshot/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      recordedAgentCliVersion: 'recorded-cli/1',
      runtimeAdapterVersion: 'adapter/v1',
      fixtureVersion: 'contract/v1',
      fixtureHash: `sha256:${'d'.repeat(64)}`,
      nativeSessionContinuation: {
        support: 'unsupported',
        evidenceLevel: 'L0',
        source: 'runtime_advertisement',
      },
      nativeSubagents: {
        support: 'unknown',
        evidenceLevel: 'L0',
        source: 'runtime_advertisement',
      },
      capturedAt: 1,
      snapshotHash: `sha256:${'e'.repeat(64)}`,
    })).toThrow(/verified or unsupported.*sanitized real fixture replay/i);

    expect(() => OdNextRuntimeCapabilitySnapshotV1Schema.parse({
      schema: 'open-design.od-next-runtime-capability-snapshot/v1',
      runtimePath: 'codex',
      agentId: 'codex',
      recordedAgentCliVersion: 'recorded-cli/1',
      runtimeAdapterVersion: 'adapter/v1',
      fixtureVersion: 'contract/v1',
      nativeSessionContinuation: {
        support: 'unsupported',
        evidenceLevel: 'L0',
        source: 'sanitized_fixture_replay',
      },
      nativeSubagents: {
        support: 'unknown',
        evidenceLevel: 'L0',
        source: 'unverified',
      },
      capturedAt: 1,
      snapshotHash: `sha256:${'f'.repeat(64)}`,
    })).toThrow(/exact Fixture hash/i);
  });
});

describe('runtime evidence graph evaluation', () => {
  it('replays every minimum fixture case deterministically without a provider', () => {
    const cases = {
      main_run: [
        observation({ id: 'root', status: 'running' }),
        observation({ id: 'root', status: 'completed' }),
      ],
      tool: [
        observation({ id: 'root' }),
        observation({ id: 'tool', kind: 'tool', parentId: 'root' }),
      ],
      child_success: [
        observation({ id: 'root' }),
        observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'running' }),
        observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'completed' }),
      ],
      child_failure_parent_recovers: [
        observation({ id: 'root', status: 'running' }),
        observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'running' }),
        observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'failed' }),
        observation({ id: 'root', status: 'completed' }),
      ],
      cancel: [
        observation({ id: 'root', status: 'running' }),
        observation({ id: 'root', status: 'canceled' }),
      ],
      timeout: [
        observation({ id: 'root', status: 'running' }),
        observation({
          id: 'root',
          status: 'failed',
          attributes: { terminationReason: 'timeout' },
        }),
      ],
      resume: [
        observation({
          id: 'request-run',
          runId: 'run-1',
          runtimeSessionId: 'session-1',
        }),
        observation({
          id: 'production-run',
          runId: 'run-2',
          taskRunIndex: 1,
          runtimeSessionId: 'session-1',
          attributes: { nativeSessionResume: true },
        }),
      ],
    } as const;
    for (const fixtureCase of allCases) {
      expect(evaluateRuntimeFixtureCaseV1(
        fixtureCase.id,
        cases[fixtureCase.id],
      )).toMatchObject({ id: fixtureCase.id, outcome: 'passed' });
    }

    expect(evaluateRuntimeFixtureCaseV1('resume', [
      cases.resume[0],
      observation({
        id: 'production-run',
        runId: 'run-2',
        taskRunIndex: 1,
        runtimeSessionId: 'cold-session-2',
        attributes: { nativeSessionResume: true },
      }),
    ]).outcome).toBe('failed');
    expect(evaluateRuntimeFixtureCaseV1('resume', [
      cases.resume[1],
      cases.resume[0],
    ]).outcome).toBe('failed');
    expect(evaluateRuntimeFixtureCaseV1('resume', [
      cases.resume[0],
      observation({
        id: 'production-run',
        runId: 'run-2',
        taskRunIndex: 0,
        runtimeSessionId: 'session-1',
        attributes: { nativeSessionResume: true },
      }),
    ]).outcome).toBe('failed');
    expect(evaluateRuntimeFixtureCaseV1('child_failure_parent_recovers', [
      cases.child_failure_parent_recovers[0],
      cases.child_failure_parent_recovers[3],
      cases.child_failure_parent_recovers[1],
      cases.child_failure_parent_recovers[2],
    ]).outcome).toBe('failed');
    expect(evaluateRuntimeFixtureCaseV1('child_failure_parent_recovers', [
      cases.child_failure_parent_recovers[0],
      cases.child_failure_parent_recovers[3],
      cases.child_failure_parent_recovers[1],
      cases.child_failure_parent_recovers[2],
      cases.child_failure_parent_recovers[3],
    ]).outcome).toBe('failed');
    expect(evaluateRuntimeFixtureCaseV1('timeout', [
      observation({ id: 'root', status: 'running' }),
      observation({ id: 'root', status: 'failed' }),
    ]).outcome).toBe('failed');
  });

  it('classifies host, structured-main, child lifecycle, and child accounting as L0-L3', () => {
    const root = observation({ id: 'root' });
    expect(evaluateRuntimeEvidenceGraphV1([root])).toMatchObject({
      valid: true,
      evidenceLevel: 'L0',
    });

    const tool = observation({ id: 'tool', kind: 'tool', parentId: 'root' });
    expect(evaluateRuntimeEvidenceGraphV1([root, tool])).toMatchObject({
      valid: true,
      evidenceLevel: 'L1',
    });

    const childStarted = observation({
      id: 'child',
      kind: 'child_agent',
      parentId: 'root',
      status: 'running',
    });
    const childCompleted = observation({
      id: 'child',
      kind: 'child_agent',
      parentId: 'root',
      status: 'completed',
    });
    expect(evaluateRuntimeEvidenceGraphV1([root, childStarted, childCompleted])).toMatchObject({
      valid: true,
      evidenceLevel: 'L2',
    });

    const accountedChild = observation({
      id: 'child',
      kind: 'child_agent',
      parentId: 'root',
      status: 'completed',
      turnAccounting: {
        turnId: 'child-turn-1',
        disposition: 'owner',
        ownerObservationId: 'child',
      },
      prompt: {
        ...unavailablePrompt,
        childInjected: {
          availability: 'partial',
          source: 'runtime',
          hash: 'sha256:child-prompt',
          bytes: 42,
          limitations: ['safe_payload_unavailable'],
        },
      },
      usage: {
        availability: 'partial',
        source: 'runtime',
        accountingMode: 'additive',
        values: { inputTokens: 10, outputTokens: 5 },
        valueSources: { inputTokens: 'runtime', outputTokens: 'runtime' },
        limitations: ['cache_not_observed'],
      },
      timing: {
        availability: 'partial',
        evidence: [{
          source: 'runtime',
          clockDomain: 'runtime_clock',
          durationMs: 20,
        }],
        limitations: ['wall_clock_not_observed'],
      },
    });
    const modelCall = observation({
      id: 'model-call',
      kind: 'model_call',
      parentId: 'child',
      turnAccounting: {
        turnId: 'child-turn-1',
        disposition: 'exclude_inherited',
        ownerObservationId: 'child',
      },
    });
    const l3 = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      accountedChild,
      modelCall,
    ]);
    expect(l3).toMatchObject({ valid: true, evidenceLevel: 'L3' });
    expect(l3.countedTurnIds).toEqual(['task-1/run-1/0/child-turn-1']);

    const withoutTurnAccounting = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      { ...accountedChild, turnAccounting: undefined },
      { ...modelCall, turnAccounting: undefined },
    ]);
    expect(withoutTurnAccounting).toMatchObject({
      valid: true,
      evidenceLevel: 'L2',
      countedTurnIds: [],
    });
  });

  it('requires exactly one closed, independent child/model Turn group for L3', () => {
    const root = observation({ id: 'root' });
    const childStarted = observation({
      id: 'child',
      kind: 'child_agent',
      parentId: 'root',
      status: 'running',
    });
    const accountedChild = observation({
      id: 'child',
      kind: 'child_agent',
      parentId: 'root',
      status: 'completed',
      turnAccounting: {
        turnId: 'turn-1',
        disposition: 'owner',
        ownerObservationId: 'child',
      },
      prompt: {
        ...unavailablePrompt,
        childInjected: {
          availability: 'partial',
          source: 'runtime',
          bytes: 1,
          limitations: ['hash_unavailable'],
        },
      },
      usage: {
        availability: 'partial',
        source: 'runtime',
        accountingMode: 'additive',
        values: { totalTokens: 1 },
        valueSources: { totalTokens: 'runtime' },
        limitations: ['breakdown_unavailable'],
      },
      timing: {
        availability: 'partial',
        evidence: [{ source: 'runtime', clockDomain: 'runtime_clock', durationMs: 1 }],
        limitations: ['wall_clock_unavailable'],
      },
    });
    const excludedModel = observation({
      id: 'model',
      kind: 'model_call',
      parentId: 'child',
      turnAccounting: {
        turnId: 'turn-1',
        disposition: 'exclude_inherited',
        ownerObservationId: 'child',
      },
    });

    const orphanExcluded = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      {
        ...accountedChild,
        turnAccounting: {
          turnId: 'turn-1',
          disposition: 'exclude_inherited',
          ownerObservationId: 'missing-owner',
        },
      },
      excludedModel,
    ]);
    expect(orphanExcluded.evidenceLevel).toBe('L2');
    expect(orphanExcluded.countedTurnIds).toEqual([]);
    expect(orphanExcluded.issues).toContainEqual(expect.objectContaining({
      code: 'turn_owner_missing',
    }));

    const missingExcluded = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      accountedChild,
      { ...excludedModel, turnAccounting: undefined },
    ]);
    expect(missingExcluded.evidenceLevel).toBe('L2');
    expect(missingExcluded.countedTurnIds).toEqual([]);
    expect(missingExcluded.issues).toContainEqual(expect.objectContaining({
      code: 'turn_excluded_copy_missing',
    }));

    const inclusiveOwner = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      {
        ...accountedChild,
        usage: { ...accountedChild.usage, accountingMode: 'inclusive' },
      },
      excludedModel,
    ]);
    expect(inclusiveOwner.evidenceLevel).toBe('L2');
    expect(inclusiveOwner.countedTurnIds).toEqual([]);
    expect(inclusiveOwner.issues).toContainEqual(expect.objectContaining({
      code: 'turn_owner_usage_not_independent',
    }));

    const unrelatedToolOwner = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      { ...accountedChild, turnAccounting: undefined },
      {
        ...accountedChild,
        identity: {
          ...accountedChild.identity,
          observationId: 'tool-owner',
        },
        kind: 'tool',
        turnAccounting: {
          turnId: 'turn-1',
          disposition: 'owner',
          ownerObservationId: 'tool-owner',
        },
      },
      {
        ...excludedModel,
        turnAccounting: {
          turnId: 'turn-1',
          disposition: 'exclude_inherited',
          ownerObservationId: 'tool-owner',
        },
      },
    ]);
    expect(unrelatedToolOwner.evidenceLevel).toBe('L2');
    expect(unrelatedToolOwner.countedTurnIds).toEqual([]);
    expect(unrelatedToolOwner.issues).toContainEqual(expect.objectContaining({
      code: 'turn_owner_kind_invalid',
    }));

    const goodPlusOrphan = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      accountedChild,
      excludedModel,
      {
        ...excludedModel,
        identity: { ...excludedModel.identity, observationId: 'orphan-model' },
        turnAccounting: {
          turnId: 'orphan-turn',
          disposition: 'exclude_inherited',
          ownerObservationId: 'missing-owner',
        },
      },
    ]);
    expect(goodPlusOrphan).toMatchObject({
      valid: false,
      evidenceLevel: 'L2',
      countedTurnIds: [],
    });
    expect(goodPlusOrphan.issues).toContainEqual(expect.objectContaining({
      code: 'turn_owner_missing',
    }));

    const goodPlusWrongGroup = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      accountedChild,
      excludedModel,
      {
        ...accountedChild,
        identity: {
          ...accountedChild.identity,
          observationId: 'extra-tool-owner',
        },
        kind: 'tool',
        turnAccounting: {
          turnId: 'wrong-turn',
          disposition: 'owner',
          ownerObservationId: 'extra-tool-owner',
        },
      },
      {
        ...excludedModel,
        identity: { ...excludedModel.identity, observationId: 'wrong-model' },
        turnAccounting: {
          turnId: 'wrong-turn',
          disposition: 'exclude_inherited',
          ownerObservationId: 'extra-tool-owner',
        },
      },
    ]);
    expect(goodPlusWrongGroup).toMatchObject({
      valid: false,
      evidenceLevel: 'L2',
      countedTurnIds: [],
    });
    expect(goodPlusWrongGroup.issues).toContainEqual(expect.objectContaining({
      code: 'turn_owner_kind_invalid',
    }));

    const duplicateClosed = evaluateRuntimeEvidenceGraphV1([
      root,
      childStarted,
      accountedChild,
      excludedModel,
      {
        ...accountedChild,
        turnAccounting: {
          turnId: 'turn-2',
          disposition: 'owner',
          ownerObservationId: 'child',
        },
      },
      {
        ...excludedModel,
        identity: { ...excludedModel.identity, observationId: 'model-2' },
        turnAccounting: {
          turnId: 'turn-2',
          disposition: 'exclude_inherited',
          ownerObservationId: 'child',
        },
      },
    ]);
    expect(duplicateClosed).toMatchObject({
      valid: false,
      evidenceLevel: 'L2',
      countedTurnIds: [],
    });
    expect(duplicateClosed.issues).toContainEqual(expect.objectContaining({
      code: 'turn_child_group_count_invalid',
    }));
  });

  it('rejects self-inconsistent Turn owner and excluded bindings at the schema', () => {
    expect(NormalizedAgentObservationV1Schema.safeParse(observation({
      id: 'child',
      kind: 'child_agent',
      parentId: 'root',
      turnAccounting: {
        turnId: 'turn-1',
        disposition: 'owner',
        ownerObservationId: 'other',
      },
    })).success).toBe(false);
    expect(NormalizedAgentObservationV1Schema.safeParse(observation({
      id: 'model',
      kind: 'model_call',
      parentId: 'child',
      turnAccounting: {
        turnId: 'turn-1',
        disposition: 'exclude_inherited',
        ownerObservationId: 'model',
      },
    })).success).toBe(false);
  });

  it('keeps a failed child and recovered completed parent as separate valid facts', () => {
    const result = evaluateRuntimeEvidenceGraphV1([
      observation({ id: 'root', status: 'running' }),
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'running' }),
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'failed' }),
      observation({ id: 'root', status: 'completed' }),
    ]);
    expect(result).toMatchObject({ valid: true, evidenceLevel: 'L2' });
  });

  it('rejects missing/cross-run parents, cycles, identity drift, and lifecycle regressions', () => {
    const root = observation({ id: 'root', status: 'running' });
    expect(evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'child', kind: 'child_agent', parentId: 'missing', status: 'running' }),
      observation({ id: 'child', kind: 'child_agent', parentId: 'missing', status: 'completed' }),
    ]).issues).toContainEqual(expect.objectContaining({ code: 'parent_missing' }));

    expect(evaluateRuntimeEvidenceGraphV1([
      root,
      observation({
        id: 'child',
        kind: 'child_agent',
        parentId: 'root',
        runId: 'run-2',
        status: 'running',
      }),
    ]).issues).toContainEqual(expect.objectContaining({ code: 'cross_run_parent' }));

    const cycle = evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'child-a', kind: 'child_agent', parentId: 'child-b', status: 'running' }),
      observation({ id: 'child-a', kind: 'child_agent', parentId: 'child-b', status: 'failed' }),
      observation({ id: 'child-b', kind: 'child_agent', parentId: 'child-a', status: 'running' }),
      observation({ id: 'child-b', kind: 'child_agent', parentId: 'child-a', status: 'failed' }),
    ]);
    expect(cycle.issues).toContainEqual(expect.objectContaining({ code: 'parent_cycle' }));

    const drift = evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'running' }),
      observation({
        id: 'child',
        kind: 'tool',
        parentId: 'root',
        runId: 'run-2',
        status: 'queued',
      }),
    ]);
    expect(drift.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'observation_identity_changed',
      'observation_kind_changed',
      'status_regression',
      'child_terminal_missing',
    ]));

    const parentDrift = evaluateRuntimeEvidenceGraphV1([
      observation({ id: 'root', status: 'running' }),
      observation({ id: 'root', parentId: 'other-root', status: 'completed' }),
      observation({ id: 'other-root' }),
    ]);
    expect(parentDrift.issues).toContainEqual(expect.objectContaining({
      code: 'parent_identity_changed',
    }));

    const changedTerminal = evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'running' }),
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'failed' }),
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'completed' }),
    ]);
    expect(changedTerminal.issues).toContainEqual(expect.objectContaining({
      code: 'terminal_status_changed',
    }));
  });

  it('requires child started and terminal and prevents sibling/inherited turn double counting', () => {
    const root = observation({ id: 'root' });
    const parentlessChild = evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'parentless', kind: 'child_agent', status: 'running' }),
      observation({ id: 'parentless', kind: 'child_agent', status: 'completed' }),
    ]);
    expect(parentlessChild.evidenceLevel).not.toBe('L2');
    expect(parentlessChild.issues).toContainEqual(expect.objectContaining({
      code: 'child_parent_missing',
    }));
    expect(evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'completed' }),
    ]).issues).toContainEqual(expect.objectContaining({ code: 'child_started_missing' }));
    expect(evaluateRuntimeEvidenceGraphV1([
      root,
      observation({ id: 'child', kind: 'child_agent', parentId: 'root', status: 'running' }),
    ]).issues).toContainEqual(expect.objectContaining({ code: 'child_terminal_missing' }));

    const doubleCounted = evaluateRuntimeEvidenceGraphV1([
      root,
      observation({
        id: 'tool-a',
        kind: 'tool',
        parentId: 'root',
        turnAccounting: {
          turnId: 'shared-turn',
          disposition: 'owner',
          ownerObservationId: 'tool-a',
        },
      }),
      observation({
        id: 'tool-b',
        kind: 'tool',
        parentId: 'root',
        turnAccounting: {
          turnId: 'shared-turn',
          disposition: 'owner',
          ownerObservationId: 'tool-b',
        },
      }),
    ]);
    expect(doubleCounted.issues).toContainEqual(expect.objectContaining({
      code: 'turn_counted_more_than_once',
    }));

    const inheritedWithoutSameRunOwner = evaluateRuntimeEvidenceGraphV1([
      root,
      observation({
        id: 'tool-owner',
        kind: 'tool',
        parentId: 'root-2',
        runId: 'run-2',
        turnAccounting: {
          turnId: 'shared-turn',
          disposition: 'owner',
          ownerObservationId: 'tool-owner',
        },
      }),
      observation({
        id: 'tool-copy',
        kind: 'tool',
        parentId: 'root',
        turnAccounting: {
          turnId: 'shared-turn',
          disposition: 'exclude_inherited',
          ownerObservationId: 'tool-owner',
        },
      }),
    ]);
    expect(inheritedWithoutSameRunOwner.issues).toContainEqual(expect.objectContaining({
      code: 'turn_owner_missing',
    }));
  });
});
