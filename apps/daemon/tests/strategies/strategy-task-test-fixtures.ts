import {
  serializeOdNextRequestTurnV1,
  serializeOdNextPromptBundleV2,
  type StrategyInputStageV2,
} from '@open-design/contracts';

import { createEmptyFrozenSkillPackage } from '../../src/strategies/od-next/frozen-skill-package.js';

export const TEST_TASK_INPUT_MANIFEST_SHA256 = 'd'.repeat(64);

export const TEST_PROMPT_BUNDLE = serializeOdNextPromptBundleV2({
  coreSystemPrompt: {
    executionBoundary: 'Frozen test execution boundary.',
    nativeExecution: { profile: 'filesystem', body: 'Frozen test native execution.' },
    discoveryAndPlanningSurface: 'Frozen test planning surface.',
    coreStrategy: 'Frozen test core strategy.',
    outputContract: 'Frozen test output contract.',
    echoGuard: 'Frozen test echo guard.',
  },
  sessionSkills: {
    generalOrchestrationSkill: {
      skillName: 'general_orchestration',
      body: 'Frozen test orchestration.',
    },
    taskTypeSkill: { skillName: 'prototype', body: 'Frozen test task skill.' },
  },
  activeStages: [
    { name: 'discovery', atoms: [{ name: 'discovery-question-form', body: 'Frozen atom.' }] },
  ],
  taskMetadata: {
    taskType: 'prototype',
    taskConfiguration: 'Frozen test task configuration.',
  },
  context: {
    recipeIdentity: {
      recipe: 'od-next-plan-build-v2',
      strategyId: 'od-next-strategy',
      strategyVersion: '2.0.0',
      appliedSnapshot: 'frozen-test-snapshot',
      taskProfileVersion: '2.0.0',
    },
    stableRequestContext: 'Frozen test context.',
  },
  userFirstPrompt: '冻结的用户请求。',
});

export function strategyTaskCreateIdentityFixture() {
  return {
    frozenSkillPackage: createEmptyFrozenSkillPackage(),
    promptBundleText: TEST_PROMPT_BUNDLE,
    taskInputManifestSha256: TEST_TASK_INPUT_MANIFEST_SHA256,
  };
}

export function strategyTaskTurnText(input: {
  taskExecutionId: string;
  inputStage: Exclude<StrategyInputStageV2, 'request'>;
  taskRunIndex: number;
  payload?: string;
}): string {
  return serializeOdNextRequestTurnV1({
    taskExecutionId: input.taskExecutionId,
    stage: input.inputStage,
    taskRunIndex: input.taskRunIndex,
    payload: input.payload ?? 'Continue the frozen test task.',
  });
}
