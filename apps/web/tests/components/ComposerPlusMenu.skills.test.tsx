// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillSummary } from '@open-design/contracts';

import { ComposerPlusMenu } from '../../src/components/ComposerPlusMenu';

function skill(overrides: Partial<SkillSummary> & Pick<SkillSummary, 'id' | 'name'>): SkillSummary {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? 'Skill fixture.',
    triggers: overrides.triggers ?? [],
    mode: overrides.mode ?? 'prototype',
    surface: overrides.surface,
    category: overrides.category ?? null,
    source: overrides.source ?? 'built-in',
    previewType: overrides.previewType ?? 'html',
    designSystemRequired: overrides.designSystemRequired ?? false,
    defaultFor: overrides.defaultFor ?? [],
    upstream: overrides.upstream ?? null,
    hasBody: overrides.hasBody ?? true,
    examplePrompt: overrides.examplePrompt ?? '',
    aggregatesExamples: overrides.aggregatesExamples ?? false,
  };
}

afterEach(() => {
  cleanup();
});

describe('ComposerPlusMenu skills flyout', () => {
  it('shows searchable skills with a hover preview and selects a skill', async () => {
    const prototypeSkill = skill({
      id: 'prototype-lab',
      name: 'Prototype Lab',
      description: 'Design a polished onboarding flow.',
      triggers: ['prototype', 'flow'],
      category: 'product',
      examplePrompt: 'Prototype the first-run path.',
    });
    const deckSkill = skill({
      id: 'deck-lab',
      name: 'Deck Lab',
      description: 'Create a board-ready slide deck.',
      triggers: ['slides'],
      mode: 'deck',
      source: 'user',
    });
    const onPickSkill = vi.fn();

    render(
      <ComposerPlusMenu
        connectors={[]}
        onPickConnector={() => undefined}
        plugins={[]}
        onPickPlugin={() => undefined}
        skills={[prototypeSkill, deckSkill]}
        onPickSkill={onPickSkill}
        mcpServers={[]}
        onPickMcp={() => undefined}
        onAttachFiles={() => undefined}
        triggerTestId="plus-trigger"
      />,
    );

    fireEvent.click(screen.getByTestId('plus-trigger'));
    fireEvent.click(screen.getByTestId('composer-plus-skills'));

    expect(await screen.findByRole('menuitem', { name: /Prototype Lab/ })).toBeTruthy();
    expect(screen.getByText('Design a polished onboarding flow.')).toBeTruthy();
    expect(screen.getByText('product')).toBeTruthy();
    expect(screen.getByText('Prototype the first-run path.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Skills'), {
      target: { value: 'slides' },
    });

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /Deck Lab/ })).toBeTruthy();
      expect(screen.queryByRole('menuitem', { name: /Prototype Lab/ })).toBeNull();
    });
    expect(screen.getByText('Create a board-ready slide deck.')).toBeTruthy();
    expect(screen.getByText('User skill')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /Deck Lab/ }));

    expect(onPickSkill).toHaveBeenCalledWith(deckSkill);
  });
});
