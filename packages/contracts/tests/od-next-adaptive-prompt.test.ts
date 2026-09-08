import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_ADAPTIVE_PROMPT_RECIPE_ID,
  OD_NEXT_RUNTIME_STATE_BLOCK,
  OdNextAdaptiveRuntimeStateV1Schema,
} from '../src/plugins/strategy-v2.js';
import {
  composeOdNextAdaptiveClarificationContinuationV1,
  composeOdNextStrategyBundleHeadV2,
  composeOdNextStrategyContinuationV2,
  composeOdNextStrategyRequestPromptV2,
  type OdNextStrategyRequestRecipeV2,
} from '../src/prompts/od-next-strategy.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

const recipe: OdNextStrategyRequestRecipeV2 = {
  recipe: OD_NEXT_ADAPTIVE_PROMPT_RECIPE_ID,
  strategyId: 'od-next-strategy',
  strategyVersion: '2.1.0',
  snapshotId: 'adaptive-prompt-snapshot',
  packageHash: 'a'.repeat(64),
  taskProfileDigest: 'b'.repeat(64),
  taskProfileVersion: '2.3.0',
  taskType: 'prototype',
  executionProfile: 'filesystem',
  coreStrategy: 'Complete the current request with actual available tools.',
  generalOrchestration: 'Plan as needed and preserve the requested scope.',
  taskSkill: 'Deliver editable HTML for prototype requests.',
  activeStages: [
    { name: 'discovery', atoms: [{ name: 'discovery-question-form' }] },
    { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
  ],
};

describe('OD Next adaptive prompt', () => {
  it('carries one minimal state example in both composers without a mandatory machine plan', () => {
    const head = composeOdNextStrategyBundleHeadV2(recipe);
    const direct = composeOdNextStrategyRequestPromptV2(recipe);
    const block = new RegExp(`<${OD_NEXT_RUNTIME_STATE_BLOCK}>\\n([\\s\\S]*?)\\n</${OD_NEXT_RUNTIME_STATE_BLOCK}>`);
    const match = block.exec(head.coreSystemPrompt.outputContract);
    expect(match?.[1]).toBeDefined();
    const state = OdNextAdaptiveRuntimeStateV1Schema.parse(JSON.parse(match![1]!));
    expect(state).toEqual({
      schema: 'open-design.strategy-state/adaptive-v1',
      outcome: 'completed',
      deliveryKind: 'artifact',
      reasonCodes: [],
    });
    expect(direct).toContain(head.coreSystemPrompt.outputContract);
    expect(direct).toContain(head.coreSystemPrompt.discoveryAndPlanningSurface);
    expect(direct).not.toContain('open-design.plan-contract/v2');
    expect(direct).not.toContain('planning-only');
    expect(direct).not.toContain('ask no second question');
    expect(head.activeStages.map((stage) => stage.name)).toEqual(['discovery', 'generate']);
  });

  it('keeps requested plan-only delivery and confirmation exceptions in the adaptive rules', () => {
    const text = composeOdNextStrategyBundleHeadV2(recipe).coreSystemPrompt;
    expect(text.discoveryAndPlanningSurface).toContain('If they ask only for a plan');
    expect(text.discoveryAndPlanningSurface).toContain('prepare and show the plan first, then wait');
    expect(text.discoveryAndPlanningSurface).toContain('Later material questions remain allowed');
    expect(text.discoveryAndPlanningSurface).toContain('each new question round a distinct form id');
    expect(text.outputContract).toContain('Do not label an unfinished artifact request as an answer or plan');
    expect(text.outputContract).toContain('Omit deliveryKind while waiting');
    expect(text.outputContract).toContain('A requested plan may be written as a file');
    expect(text.outputContract).toContain('non-empty visible final answer or delivery note');
  });

  it('rejects the mandatory legacy plan stage on an adaptive recipe', () => {
    expect(() => composeOdNextStrategyBundleHeadV2({
      ...recipe,
      activeStages: [
        recipe.activeStages[0]!,
        { name: 'plan', atoms: [{ name: 'direction-picker' }, { name: 'todo-write' }] },
        recipe.activeStages[1]!,
      ],
    })).toThrow(/exactly discovery and generate/);
  });

  it('honors plan and answer delivery on the text-artifact profile without inventing file tools', () => {
    const textRecipe = { ...recipe, executionProfile: 'text_artifact' as const };
    const head = composeOdNextStrategyBundleHeadV2(textRecipe);
    const direct = composeOdNextStrategyRequestPromptV2(textRecipe);
    expect(head.coreSystemPrompt.nativeExecution.body).toContain('no project-file tools');
    expect(head.coreSystemPrompt.nativeExecution.body).toContain(
      'For a requested answer, discussion, or plan, deliver that result in visible prose',
    );
    expect(direct).toContain(head.coreSystemPrompt.nativeExecution.body);
    expect(direct).toContain('A text-artifact profile instead delivers the complete source');
    expect(direct).not.toContain('Produce only the complete declared text artifact');
  });

  it('preserves task and host instructions through the shared API composer', () => {
    const ppt = { ...recipe, taskType: 'ppt' as const };
    const direct = composeSystemPrompt({ odNextStrategyRecipe: ppt });
    expect(direct).toContain(ppt.taskSkill);
    expect(direct).toContain('<question-form>');
    expect(direct).toContain('ship-on-write');
    expect(direct).not.toContain('## Active stage: plan');
  });

  it('continues later adaptive questions incrementally while preserving legacy continuation', () => {
    const adaptive = composeOdNextAdaptiveClarificationContinuationV1({
      nativeSessionResume: true,
      taskExecutionId: 'task-adaptive',
      taskRunIndex: 4,
      answer: 'Preserve both required outputs and proceed.',
    });
    expect(adaptive).toContain('# OD Next adaptive continuation — clarification');
    expect(adaptive).toContain('Preserve both required outputs and proceed.');
    expect(adaptive).toContain('ask again only for a newly unresolved material decision');
    expect(adaptive).not.toContain('route=direct_edit');
    expect(adaptive).not.toContain('ask no second question round');
    const legacy = composeOdNextStrategyContinuationV2({
      nativeSessionResume: true,
      stage: 'clarification',
      taskExecutionId: 'task-legacy',
      taskRunIndex: 2,
      answer: 'Keep the existing scope.',
    });
    expect(legacy).toContain('ask no second question round');
    expect(legacy).toContain('Preserve the locked route');
  });
});
