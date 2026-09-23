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
  it('opens all categories and switches the committed template', () => {
    const onPick = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        onPick={onPick}
        activeChipId="deck"
        labelFor={labelFor}
      />,
    );

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain(labelFor('deck'));

    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getAllByRole('option')).toHaveLength(templates.length);
    expect(screen.getByRole('option', { name: labelFor('deck') }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: labelFor('prototype') }));
    expect(onPick).toHaveBeenCalledWith(chipById('prototype'));
    expect(screen.queryByRole('listbox')).toBeNull();

  });

  it('offers the dropdown before a type is selected', () => {
    render(
      <TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />,
    );

    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getAllByRole('option')).toHaveLength(templates.length);
    expect(screen.getAllByRole('option').every((option) => option.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('keeps the leading icon without a clear control', () => {
    render(
      <TemplatePicker
        templates={templates}
        activeChipId="deck"
        labelFor={labelFor}
      />,
    );

    fireEvent.mouseOver(screen.getByTestId('home-hero-template-picker'));
    expect(screen.queryByTestId('home-hero-template-clear')).toBeNull();
  });

  it('does not reapply an already selected type', () => {
    const onPick = vi.fn();
    render(<TemplatePicker templates={templates} activeChipId="prototype" onPick={onPick} labelFor={labelFor} />);
    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    fireEvent.click(screen.getByRole('option', { name: labelFor('prototype') }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('dismisses on outside pointer down and restores focus on Escape', () => {
    render(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);
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
      return <TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} disabled={disabled} />;
    }
    const { rerender } = render(<ReadyPicker disabled />);
    rerender(<ReadyPicker disabled={false} />);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('closes an open menu when loading disables the picker', () => {
    const props = { templates, activeChipId: 'prototype', labelFor };
    const { rerender } = render(<TemplatePicker {...props} />);
    fireEvent.click(screen.getByTestId('home-hero-template-trigger').querySelector('button')!);
    expect(screen.getByRole('listbox')).toBeTruthy();
    rerender(<TemplatePicker {...props} disabled />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('home-hero-template-trigger').querySelector('button')!.disabled).toBe(true);
  });

  it('keeps a menu opened after a committed type change open', () => {
    // On a loaded machine React commits a render and runs its passive effects
    // in separate tasks, so a click can land on a trigger that already shows
    // the new type before that commit's effects run. Opening the menu there is
    // a fresh intent; the type change the user already saw must not close it.
    // The layout effect below clicks at exactly that point: after the commit,
    // before its passive effects.
    function ClickAfterCommit({ activeChipId }: { activeChipId: string | null }) {
      useLayoutEffect(() => {
        if (activeChipId !== 'prototype') return;
        screen.getByTestId('home-hero-template-trigger').querySelector('button')!.click();
      }, [activeChipId]);
      return null;
    }
    function Host({ activeChipId }: { activeChipId: string | null }) {
      return (
        <>
          <TemplatePicker templates={templates} activeChipId={activeChipId} labelFor={labelFor} />
          <ClickAfterCommit activeChipId={activeChipId} />
        </>
      );
    }
    const { rerender } = render(<Host activeChipId={null} />);
    rerender(<Host activeChipId="prototype" />);

    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain(labelFor('prototype'));
    expect(screen.queryByTestId('home-hero-template-menu')).not.toBeNull();
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
