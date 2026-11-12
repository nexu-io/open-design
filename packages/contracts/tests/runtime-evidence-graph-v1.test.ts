import { describe, expect, it } from 'vitest';

import {
  NormalizedAgentObservationV1Schema,
  evaluateRuntimeEvidenceGraphV1,
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

// Runtime qualification and provider fixture acceptance were retired. These
// assertions describe observation lifecycle/accounting, not admission to run.
describe('runtime evidence graph evaluation', () => {
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
