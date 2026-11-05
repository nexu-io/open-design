import { describe, expect, it } from 'vitest';
import {
  composeOdNextMarkerProductionTurn,
  parseOdNextPromptBundleV2,
  renderChatTurnHostProtocolInstructions,
  renderOdNextProductionReadyInstructions,
  serializeOdNextPromptBundleV2,
} from '@open-design/contracts';
import { composeColdProductionBundle } from '../../../src/strategies/od-next/cold-production.js';
import { TEST_PROMPT_BUNDLE } from '../strategy-task-test-fixtures.js';

const hostProtocolText = renderChatTurnHostProtocolInstructions('def456', 'od_next_production').text;

it('freezes original context and complete plan while retiring only the request gate', () => {
  const bundle = parseOdNextPromptBundleV2(TEST_PROMPT_BUNDLE);
  bundle.context.clientSystemPrompt = `${renderOdNextProductionReadyInstructions('abc123')}\n\n---\n\nOnly generate a standalone image.`;
  bundle.context.priorTranscript = 'user: Keep the dog blue.';
  bundle.context.formOverride = 'Answered discovery.';
  bundle.taskMetadata.attachments = '/frozen-input/dog reference.png';
  bundle.taskMetadata.titleDirective = 'Generate a title';
  const turn = composeOdNextMarkerProductionTurn({ taskExecutionId: 'task-1', taskRunIndex: 1, hostProtocolText });
  const cold = parseOdNextPromptBundleV2(composeColdProductionBundle({
    frozenBundleText: serializeOdNextPromptBundleV2(bundle),
    planningReply: 'Plan: a blue dog image, no HTML. 中文 & <literal> preserved.',
    productionTurn: turn,
  }));
  expect(cold.coreSystemPrompt).toEqual(bundle.coreSystemPrompt);
  expect(cold.sessionSkills).toEqual(bundle.sessionSkills);
  expect(cold.context.recipeIdentity).toEqual(bundle.context.recipeIdentity);
  expect(cold.taskMetadata.attachments).toBe(bundle.taskMetadata.attachments);
  expect(cold.context.clientSystemPrompt).toBe('Only generate a standalone image.');
  expect(cold.context.priorTranscript).toContain(bundle.userFirstPrompt);
  expect(cold.context.priorTranscript).toContain('Keep the dog blue.');
  expect(cold.context.priorTranscript).toContain('Plan: a blue dog image, no HTML. 中文 & <literal> preserved.');
  expect(cold.userFirstPrompt).toContain('This is the production turn');
  expect(cold.context.formOverride).toBeUndefined();
  expect(cold.taskMetadata.titleDirective).toBeUndefined();
});

describe('cold production input boundary', () => {
  it('keeps requirements at the end of historical context and a complete plan beyond 12000 characters', () => {
    const bundle = parseOdNextPromptBundleV2(TEST_PROMPT_BUNDLE);
    const history = `user: Original requirements.\n${'Historical context. '.repeat(800)}\nuser: LATE_REQUIREMENT — never use external CDN assets.`;
    const plan = `Plan: build the requested page.\n${'Complete plan detail. '.repeat(800)}\nFINAL_PLAN_CONSTRAINT — retain keyboard navigation.`;
    bundle.context.priorTranscript = history;
    bundle.userFirstPrompt = 'Build the accessible page and preserve the late requirements.';
    expect(history.length).toBeGreaterThan(12000);
    expect(plan.length).toBeGreaterThan(12000);
    const cold = parseOdNextPromptBundleV2(composeColdProductionBundle({
      frozenBundleText: serializeOdNextPromptBundleV2(bundle), planningReply: plan,
      productionTurn: composeOdNextMarkerProductionTurn({ taskExecutionId: 'task-long-history', taskRunIndex: 1, hostProtocolText }),
    }));
    expect(cold.context.priorTranscript).toContain(history);
    expect(cold.context.priorTranscript).toContain(plan);
    expect(cold.context.priorTranscript).toContain(bundle.userFirstPrompt);
  });

  it('does not remove a user-owned marker example that resembles a host instruction', () => {
    const bundle = parseOdNextPromptBundleV2(TEST_PROMPT_BUNDLE);
    bundle.context.clientSystemPrompt = 'User reference: <od-production-ready key="abc123" />';
    const cold = parseOdNextPromptBundleV2(composeColdProductionBundle({
      frozenBundleText: serializeOdNextPromptBundleV2(bundle), planningReply: 'Plan ready.',
      productionTurn: composeOdNextMarkerProductionTurn({ taskExecutionId: 'task-1', taskRunIndex: 1, hostProtocolText }),
    }));
    expect(cold.context.clientSystemPrompt).toBe(bundle.context.clientSystemPrompt);
  });
});
