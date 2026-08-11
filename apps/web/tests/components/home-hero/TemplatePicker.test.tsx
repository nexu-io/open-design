// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplatePicker } from '../../../src/components/home-hero/TemplatePicker';
import {
  HOME_HERO_CHIPS,
  type HomeHeroChip,
} from '../../../src/components/home-hero/chips';

afterEach(() => {
  cleanup();
});

const templates = HOME_HERO_CHIPS.filter((chip) => chip.group === 'create');

function chipById(chipId: string): HomeHeroChip {
  const chip = templates.find((item) => item.id === chipId);
  if (!chip) throw new Error(`Missing chip fixture: ${chipId}`);
  return chip;
}

function labelFor(chipId: string): string {
  return chipById(chipId).label;
}

function renderPicker(activeChipId: string | null) {
  const onPick = vi.fn();
  return {
    onPick,
    ...render(
      <TemplatePicker
        templates={templates}
        activeChipId={activeChipId}
        labelFor={labelFor}
        onPick={onPick}
      />,
    ),
  };
}

describe('TemplatePicker', () => {
  it('keeps the menu open for its own scroll but dismisses when a trigger ancestor scrolls', () => {
    renderPicker('deck');
    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));

    const menu = screen.getByTestId('home-hero-template-menu');
    fireEvent.scroll(menu);
    expect(screen.queryByTestId('home-hero-template-menu')).not.toBeNull();

    const triggerAncestor = screen.getByTestId('home-hero-template-picker').parentElement;
    expect(triggerAncestor).not.toBeNull();
    fireEvent.scroll(triggerAncestor!);
    expect(screen.queryByTestId('home-hero-template-menu')).toBeNull();
  });

  it('shows the selected template on the trigger and offers no clear affordance', () => {
    const view = renderPicker('wireframe');

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Wireframe');
    // Clearing the creation type was removed (per product): neither the pill's
    // inline × nor the menu's leading Clear row exists any more.
    expect(screen.queryByTestId('home-hero-template-reset')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));
    expect(screen.getByTestId('home-hero-template-menu')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-template-radial-clear')).toBeNull();

    view.rerender(
      <TemplatePicker
        templates={templates}
        activeChipId={null}
        labelFor={labelFor}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('home-hero-template-picker').className).not.toContain('has-selection');
    // #5517 dropped the explicit "None" placeholder at rest — the gray
    // "Creation type" kicker alone reads as the empty state, and the label slot
    // only appears once a template is selected.
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Creation type');
  });
});
