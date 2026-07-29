import { describe, expect, it } from 'vitest';

import {
  submittedFormIdFromPrompt,
  shouldIncludeAutomaticScenarioCraft,
  shouldIncludeDefaultRouterSkill,
} from '../../src/prompts/automatic-scenario-context.js';

describe('automatic scenario prompt context', () => {
  it('keeps the default router for conversation bootstrap and its answer transition only', () => {
    expect(shouldIncludeDefaultRouterSkill({
      sessionMode: 'design',
      resolvedSurface: null,
      isInitialConversationTurn: true,
    })).toBe(true);
    expect(shouldIncludeDefaultRouterSkill({
      sessionMode: 'plan',
      resolvedSurface: null,
      isInitialConversationTurn: true,
    })).toBe(true);
    expect(shouldIncludeDefaultRouterSkill({
      sessionMode: 'design',
      resolvedSurface: null,
      isInitialConversationTurn: false,
      submittedFormId: 'task-type',
    })).toBe(true);
    expect(shouldIncludeDefaultRouterSkill({
      sessionMode: 'design',
      resolvedSurface: null,
      isInitialConversationTurn: false,
      submittedFormId: 'discovery',
    })).toBe(true);

    for (const input of [
      {
        sessionMode: 'chat' as const,
        resolvedSurface: null,
        isInitialConversationTurn: true,
      },
      {
        sessionMode: 'design' as const,
        resolvedSurface: 'deck' as const,
        isInitialConversationTurn: true,
      },
      {
        sessionMode: 'design' as const,
        resolvedSurface: 'image' as const,
        isInitialConversationTurn: true,
      },
      {
        sessionMode: 'design' as const,
        resolvedSurface: null,
        isInitialConversationTurn: false,
      },
      {
        sessionMode: 'design' as const,
        resolvedSurface: null,
        isInitialConversationTurn: false,
        submittedFormId: 'annotation',
      },
    ]) {
      expect(shouldIncludeDefaultRouterSkill(input)).toBe(false);
    }
  });

  it('parses only a leading submitted-form marker', () => {
    expect(submittedFormIdFromPrompt(
      '[form answers — task-type]\n- taskType: Slide deck',
    )).toBe('task-type');
    expect(submittedFormIdFromPrompt(
      '  [Form Answers - discovery]\n- audience: Operators',
    )).toBe('discovery');
    expect(submittedFormIdFromPrompt('Please use [form answers — task-type]')).toBeNull();
    expect(submittedFormIdFromPrompt(undefined)).toBeNull();
  });

  it('keeps automatic craft only while its hidden router is present', () => {
    expect(shouldIncludeAutomaticScenarioCraft('chat')).toBe(false);
    expect(shouldIncludeAutomaticScenarioCraft('design')).toBe(true);
    expect(shouldIncludeAutomaticScenarioCraft('plan')).toBe(true);
    expect(shouldIncludeAutomaticScenarioCraft('design', false)).toBe(false);
    expect(shouldIncludeAutomaticScenarioCraft('plan', false)).toBe(false);
  });
});
