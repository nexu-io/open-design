// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
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

describe('TemplatePicker', () => {
  it('opens the selected type dropdown and keeps the independent clear action', () => {
    const onPick = vi.fn();
    const onClear = vi.fn();
    render(<TemplatePicker templates={templates} onPick={onPick} onClear={onClear}
      activeChipId="deck" labelFor={labelFor} />);

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    fireEvent.click(screen.getByText(labelFor('deck')));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: labelFor('deck') }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: labelFor('prototype') }));
    expect(onPick).toHaveBeenCalledWith(chipById('prototype'));
    expect(onClear).not.toHaveBeenCalled();
  });

  it('offers the dropdown before a type is selected', () => {
    const onPick = vi.fn();
    render(
      <TemplatePicker templates={templates} activeChipId={null} onPick={onPick} labelFor={labelFor} />,
    );

    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getAllByRole('option')).toHaveLength(templates.length);
    expect(screen.getAllByRole('option').every((option) => option.getAttribute('aria-selected') === 'false')).toBe(true);
    fireEvent.click(screen.getByRole('option', { name: labelFor('prototype') }));
    expect(onPick).toHaveBeenCalledWith(chipById('prototype'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clears the selected type without opening its switch menu', () => {
    const onClear = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        activeChipId="deck"
        onClear={onClear}
        labelFor={labelFor}
      />,
    );

    fireEvent.mouseOver(screen.getByTestId('home-hero-template-picker'));
    fireEvent.click(screen.getByTestId('home-hero-template-clear'));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not clear a type while selection is disabled', () => {
    const onClear = vi.fn();
    render(<TemplatePicker templates={templates} activeChipId="prototype" onClear={onClear}
      labelFor={labelFor} disabled />);
    fireEvent.click(screen.getByTestId('home-hero-template-clear'));
    expect(onClear).not.toHaveBeenCalled();
  });

  it('dismisses on outside pointer down and restores focus on Escape', () => {
    render(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);
    const trigger = screen.getByTestId('home-hero-template-trigger').querySelector('button')!;
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps a click made as the picker becomes enabled before passive effects flush', () => {
    function ReadyPicker({ disabled }: { disabled: boolean }) {
      useLayoutEffect(() => {
        if (!disabled) screen.getByTestId('home-hero-template-trigger').querySelector('button')!.click();
      }, [disabled]);
      return <TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} disabled={disabled} />;
    }
    const { rerender } = render(<ReadyPicker disabled />);
    rerender(<ReadyPicker disabled={false} />);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('closes an open menu when loading disables the picker', () => {
    const props = { templates, activeChipId: null, labelFor };
    const { rerender } = render(<TemplatePicker {...props} />);
    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getByRole('listbox')).toBeTruthy();
    rerender(<TemplatePicker {...props} disabled />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('home-hero-template-trigger').querySelector('button')!.disabled).toBe(true);
  });

  it('closes the picker when a type is committed and restores it after clearing', () => {
    const { rerender } = render(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);
    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getByRole('listbox')).toBeTruthy();

    rerender(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByText(labelFor('prototype')));
    expect(screen.getByRole('listbox')).toBeTruthy();

    rerender(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);
    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('offers no clear when the host supplies no handler', () => {
    render(
      <TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} />,
    );

    expect(screen.queryByTestId('home-hero-template-clear')).toBeNull();
    expect(screen.queryByTestId('home-hero-template-reset')).toBeNull();
  });
});

describe('TemplatePicker — the sub-type row cannot move the pill', () => {
  // The pill used to retitle itself to the picked sub-category, so browsing the
  // sub-type row relabelled and resized the composer's own row under the
  // cursor (per product: 切换二级目录时输入框的绿色按钮不要动). The category is
  // not part of this component's inputs at all any more — the only thing that
  // can change the pill is changing the TYPE.
  it('names the type, never a sub-category', () => {
    const { rerender } = render(
      <TemplatePicker
        templates={templates}
        activeChipId="prototype"
        labelFor={labelFor}
      />,
    );
    const pillText = screen.getByTestId('home-hero-template-trigger').textContent;
    expect(pillText).toContain(labelFor('prototype'));

    // Everything a sub-category pick changes in the host (its own selection
    // state) leaves this component's props untouched, so the pill re-renders
    // identically.
    rerender(
      <TemplatePicker
        templates={templates}
        activeChipId="prototype"
        labelFor={labelFor}
      />,
    );
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toBe(pillText);
  });

  it('offers neither a type clear nor a sub-type clear', () => {
    render(
      <TemplatePicker
        templates={templates}
        activeChipId="prototype"
        labelFor={labelFor}
      />,
    );

    // The progressive "first × drops the category, second drops the type" pair
    // went away with the retitling that made it legible.
    expect(screen.queryByTestId('home-hero-template-clear-subtype')).toBeNull();
    fireEvent.mouseOver(screen.getByTestId('home-hero-template-picker'));
    expect(screen.queryByTestId('home-hero-template-clear')).toBeNull();
  });
});
