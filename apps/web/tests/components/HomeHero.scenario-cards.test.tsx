// @vitest-environment jsdom
//
// Scenario-card rail coverage.
//   - The default create rail renders illustrated scenario cards carrying a
//     title AND a one-line description.
//   - The rail leads with the slide deck ("Slides") per the curated create
//     order.
//   - The finer-grained scenarios (wireframe / mobile / document / social /
//     diagram) exist and route to a working scenario plugin.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const placeholderCarouselMock = vi.hoisted(() => ({
  reportScenario: false,
  reportedScenarioId: null as string | null,
}));

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: ({
    scenarios,
    active,
    onScenarioChange,
  }: {
    scenarios: Array<{ id: string; chipId?: string | null; text: string }>;
    active: boolean;
    onScenarioChange: (scenario: { id: string; chipId?: string | null; text: string }) => void;
  }) => {
    const scenario = scenarios[0];
    if (
      placeholderCarouselMock.reportScenario &&
      active &&
      scenario &&
      placeholderCarouselMock.reportedScenarioId !== scenario.id
    ) {
      placeholderCarouselMock.reportedScenarioId = scenario.id;
      queueMicrotask(() => onScenarioChange(scenario));
    }
    return null;
  },
}));

import { HomeHero } from '../../src/components/HomeHero';
import { findChip, orderedCreateChips } from '../../src/components/home-hero/chips';

afterEach(() => {
  placeholderCarouselMock.reportScenario = false;
  placeholderCarouselMock.reportedScenarioId = null;
  cleanup();
});

function renderHero(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  const props = {
    prompt: '',
    onPromptChange: () => undefined,
    onSubmit: () => undefined,
    activePluginTitle: null,
    activeChipId: null,
    onClearActivePlugin: () => undefined,
    pluginOptions: [],
    pluginsLoading: false,
    pendingPluginId: null,
    pendingChipId: null,
    onPickPlugin: () => undefined,
    onPickChip: () => undefined,
    contextItemCount: 0,
    error: null,
    ...overrides,
  } as React.ComponentProps<typeof HomeHero>;
  render(<HomeHero {...props} />);
}

describe('HomeHero scenario cards', () => {
  it('renders each create scenario card with a title and a description', () => {
    renderHero();
    const prototype = screen.getByTestId('home-hero-rail-prototype');
    expect(prototype.textContent).toContain('Prototype');
    expect(prototype.textContent).toContain('Interactive app mockups');

    const deck = screen.getByTestId('home-hero-rail-deck');
    expect(deck.textContent).toContain('Presentations & pitch decks');
  });

  it('leads the create rail with the slide deck', () => {
    expect(orderedCreateChips()[0]?.id).toBe('deck');
  });

  it('adds the finer-grained scenarios as create cards routed to a scenario plugin', () => {
    renderHero();
    for (const id of ['wireframe', 'mobile', 'document', 'social-card', 'diagram']) {
      const card = screen.getByTestId(`home-hero-rail-${id}`);
      const tabs = screen.getByTestId('home-hero-type-tabs');
      expect(tabs.contains(card)).toBe(true);
      expect(findChip(id)?.action.kind).toBe('apply-scenario');
    }
    expect(findChip('wireframe')?.action).toMatchObject({
      pluginId: 'od-wireframe',
      projectKind: 'prototype',
      projectMetadata: { kind: 'prototype', intent: 'wireframe', fidelity: 'wireframe' },
    });
    expect(findChip('mobile')?.action).toMatchObject({
      pluginId: 'od-mobile-app',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        intent: 'mobile-app',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    });
    expect(findChip('document')?.action).toMatchObject({
      pluginId: 'od-document',
      projectKind: 'other',
      projectMetadata: { kind: 'other', intent: 'document' },
    });
    expect(findChip('social-card')?.action).toMatchObject({
      pluginId: 'od-social-card',
      projectKind: 'image',
      projectMetadata: { kind: 'image', intent: 'social-card' },
    });
    expect(findChip('diagram')?.action).toMatchObject({
      pluginId: 'od-technical-diagram',
      projectKind: 'image',
      projectMetadata: { kind: 'image', intent: 'diagram' },
    });
  });

  it('keeps empty carousel scenario submit disabled while plugins are loading', async () => {
    placeholderCarouselMock.reportScenario = true;
    const onSubmit = vi.fn();
    const onSubmitScenario = vi.fn();
    renderHero({
      pluginsLoading: true,
      onSubmit,
      onSubmitScenario,
    });

    await waitFor(() => expect(placeholderCarouselMock.reportedScenarioId).not.toBeNull());
    const submit = screen.getByTestId('home-hero-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSubmitScenario).not.toHaveBeenCalled();
  });
});
