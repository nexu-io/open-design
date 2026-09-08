import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_ADAPTIVE_PROMPT_RECIPE_ID,
  OD_NEXT_ADAPTIVE_RUNTIME_STATE_SCHEMA,
  OD_NEXT_PROMPT_RECIPE_ID,
  OdNextAdaptiveRuntimeStateV1Schema,
  StrategyRuntimeStateV2Schema,
  StrategyRuntimeTransitionV2Schema,
  StrategyTaskProjectionV2Schema,
  strategyExecutionPolicyForRecipe,
} from '../src/index.js';

function projection(overrides: Record<string, unknown> = {}) {
  return {
    taskExecutionId: 'task-1',
    executionPolicy: 'adaptive_v1',
    strategy: {
      id: 'od-next-strategy', version: '3.0.0', packageHash: 'a'.repeat(64), snapshotId: 'snapshot-1',
    },
    inputStage: 'request', outcome: 'completed', route: null, executionMode: null,
    activeRunId: 'run-1', terminal: true,
    ...overrides,
  };
}

describe('adaptive task contract', () => {
  it('selects semantics only from a recognized frozen recipe', () => {
    expect(strategyExecutionPolicyForRecipe(OD_NEXT_PROMPT_RECIPE_ID)).toBe('plan_build_v2');
    expect(strategyExecutionPolicyForRecipe(OD_NEXT_ADAPTIVE_PROMPT_RECIPE_ID)).toBe('adaptive_v1');
    expect(() => strategyExecutionPolicyForRecipe('unknown' as typeof OD_NEXT_PROMPT_RECIPE_ID)).toThrow();
  });

  it('accepts a compact result without a plan and rejects host-owned control fields', () => {
    const result = { schema: OD_NEXT_ADAPTIVE_RUNTIME_STATE_SCHEMA, outcome: 'completed', deliveryKind: 'answer' };
    expect(OdNextAdaptiveRuntimeStateV1Schema.parse(result)).toEqual({ ...result, reasonCodes: [] });
    for (const extra of [{ route: 'full_plan' }, { inputStage: 'production' }, { planContract: {} }]) {
      expect(OdNextAdaptiveRuntimeStateV1Schema.safeParse({ ...result, ...extra }).success).toBe(false);
    }
    expect(OdNextAdaptiveRuntimeStateV1Schema.safeParse({ ...result, outcome: 'clarification_required' }).success).toBe(false);
    expect(OdNextAdaptiveRuntimeStateV1Schema.safeParse({ ...result, outcome: 'plan_ready' }).success).toBe(false);
  });

  it('projects completion and repeated necessary questions without production stages', () => {
    expect(StrategyTaskProjectionV2Schema.parse(projection())).toEqual(projection());
    const waiting = projection({ inputStage: 'clarification', outcome: 'clarification_required', terminal: false });
    expect(StrategyTaskProjectionV2Schema.parse(waiting)).toEqual(waiting);
    for (const invalid of [
      { inputStage: 'production' }, { outcome: 'plan_ready', terminal: false },
      { route: 'full_plan' }, { executionMode: 'complex' }, { nextRunId: 'run-2' },
      { executionPolicy: 'unknown' },
    ]) {
      expect(StrategyTaskProjectionV2Schema.safeParse(projection(invalid)).success).toBe(false);
    }
  });

  it('keeps missing-policy and explicit legacy projections under the original strict rules', () => {
    const legacy = projection({ executionPolicy: undefined, route: 'full_plan', executionMode: 'simple' });
    expect(StrategyTaskProjectionV2Schema.safeParse(legacy).success).toBe(false);
    expect(StrategyTaskProjectionV2Schema.safeParse({ ...legacy, executionPolicy: 'plan_build_v2' }).success).toBe(false);
    expect(StrategyRuntimeStateV2Schema.safeParse({
      schema: 'open-design.strategy-state/v2', route: 'full_plan', inputStage: 'request',
      outcome: 'completed', executionMode: 'simple', reasonCodes: [],
    }).success).toBe(false);
    const endpoint = { route: 'full_plan', inputStage: 'clarification', executionMode: null };
    expect(StrategyRuntimeTransitionV2Schema.safeParse({ from: endpoint, to: endpoint }).success).toBe(false);
  });
});
