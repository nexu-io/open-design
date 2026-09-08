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
  vi.restoreAllMocks();
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

function mockPickerRect(top: number, bottom: number) {
  const picker = screen.getByTestId('home-hero-template-picker');
  vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: top,
    left: 100,
    right: 240,
    top,
    bottom,
    width: 140,
    height: bottom - top,
    toJSON: () => ({}),
  });
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
    const view = renderPicker('document');

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Document');
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

  it('caps a tall viewport at six visible rows', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
    renderPicker('deck');
    mockPickerRect(160, 200);

    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));

    const menu = screen.getByTestId('home-hero-template-menu');
    expect(menu.style.top).toBe('208px');
    expect(menu.style.bottom).toBe('');
    expect(menu.style.maxHeight).toBe('286px');
  });

  it('flips above the trigger when the space below cannot fit one row', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    renderPicker('deck');
    mockPickerRect(220, 260);

    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));

    const menu = screen.getByTestId('home-hero-template-menu');
    expect(menu.style.top).toBe('');
    expect(menu.style.bottom).toBe('88px');
    expect(menu.style.maxHeight).toBe('196px');
    expect(menu.style.transformOrigin).toBe('bottom left');
  });
});
