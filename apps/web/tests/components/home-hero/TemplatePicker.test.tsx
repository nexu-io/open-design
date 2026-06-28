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

function descriptionFor(chipId: string): string {
  return chipById(chipId).description ?? '';
}

function renderPicker(activeChipId: string | null, onClear = vi.fn()) {
  const onPick = vi.fn();
  return {
    onClear,
    onPick,
    ...render(
      <TemplatePicker
        templates={templates}
        activeChipId={activeChipId}
        labelFor={labelFor}
        descriptionFor={descriptionFor}
        onPick={onPick}
        onClear={onClear}
      />,
    ),
  };
}

describe('TemplatePicker', () => {
  it('highlights a selected template and exposes an inline reset control', () => {
    const onClear = vi.fn();
    const view = renderPicker('wireframe', onClear);

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Wireframe');
    const reset = screen.getByTestId('home-hero-template-reset');
    const resetIcon = reset.querySelector('svg');
    expect(resetIcon).not.toBeNull();
    expect(resetIcon?.getAttribute('width')).toBe('11');
    expect(resetIcon?.getAttribute('height')).toBe('11');

    fireEvent.click(reset);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('home-hero-template-menu')).toBeNull();

    view.rerender(
      <TemplatePicker
        templates={templates}
        activeChipId={null}
        labelFor={labelFor}
        descriptionFor={descriptionFor}
        onPick={vi.fn()}
        onClear={onClear}
      />,
    );

    expect(screen.getByTestId('home-hero-template-picker').className).not.toContain('has-selection');
    expect(screen.queryByTestId('home-hero-template-reset')).toBeNull();
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('None');
  });
});
