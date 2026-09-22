// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function triggerButton(): HTMLButtonElement {
  const trigger = screen.getByTestId('home-hero-template-trigger').querySelector('button');
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('Missing template picker trigger');
  return trigger;
}

function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing test item at index ${index}`);
  return item;
}

describe('TemplatePicker', () => {
  it('opens all categories and switches the committed template', () => {
    const onPick = vi.fn();
    render(<TemplatePicker templates={templates} onPick={onPick} activeChipId="deck" labelFor={labelFor} />);

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain(labelFor('deck'));

    fireEvent.click(triggerButton());
    expect(screen.getAllByRole('option')).toHaveLength(templates.length);
    expect(screen.getByRole('option', { name: labelFor('deck') }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: labelFor('prototype') }));
    expect(onPick).toHaveBeenCalledWith(chipById('prototype'));
    expect(screen.queryByRole('listbox')).toBeNull();

  });

  it('offers the dropdown before a type is selected', () => {
    render(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);

    fireEvent.click(triggerButton());
    expect(screen.getAllByRole('option')).toHaveLength(templates.length);
    expect(screen.getAllByRole('option').every((option) => option.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('keeps the leading icon without a clear control', () => {
    render(<TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} />);

    fireEvent.mouseOver(screen.getByTestId('home-hero-template-picker'));
    expect(screen.queryByTestId('home-hero-template-clear')).toBeNull();
  });

  it('does not reapply an already selected type', () => {
    const onPick = vi.fn();
    render(<TemplatePicker templates={templates} activeChipId="prototype" onPick={onPick} labelFor={labelFor} />);
    fireEvent.click(triggerButton());
    fireEvent.click(screen.getByRole('option', { name: labelFor('prototype') }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('dismisses on outside pointer down and restores focus on Escape', () => {
    render(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);
    const trigger = triggerButton();
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
        if (!disabled) triggerButton().click();
      }, [disabled]);
      return <TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} disabled={disabled} />;
    }
    const { rerender } = render(<ReadyPicker disabled />);
    rerender(<ReadyPicker disabled={false} />);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('opens from the selected trigger with ArrowDown and moves to the next option', async () => {
    render(<TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} />);
    const trigger = triggerButton();

    expect(fireEvent.keyDown(trigger, { key: 'ArrowDown' })).toBe(false);
    const selected = screen.getByRole('option', { name: labelFor('deck') });
    await waitFor(() => expect(document.activeElement).toBe(selected));
    fireEvent.keyDown(selected, { key: 'ArrowDown' });

    const selectedIndex = templates.findIndex((chip) => chip.id === 'deck');
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('option', { name: labelFor(itemAt(templates, selectedIndex + 1).id) }),
    ));
  });

  it.each([
    ['ArrowDown', 0],
    ['ArrowUp', templates.length - 1],
  ])('opens without a selection on %s and focuses the expected boundary', async (key, expectedIndex) => {
    render(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);

    expect(fireEvent.keyDown(triggerButton(), { key })).toBe(false);

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('option', { name: labelFor(itemAt(templates, expectedIndex).id) }),
    ));
  });

  it.each([
    ['ArrowDown', 'deck', 'deck'],
    ['ArrowUp', 'deck', 'deck'],
    ['ArrowDown', null, itemAt(templates, 0).id],
    ['ArrowUp', null, itemAt(templates, templates.length - 1).id],
  ])('moves focus from an already-open trigger on %s with active type %s', async (key, activeChipId, expectedChipId) => {
    render(<TemplatePicker templates={templates} activeChipId={activeChipId} labelFor={labelFor} />);
    const trigger = triggerButton();
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    expect(fireEvent.keyDown(trigger, { key })).toBe(false);

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('option', { name: labelFor(expectedChipId) }),
    ));
  });

  it('clamps Arrow navigation at both option boundaries', async () => {
    render(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);
    fireEvent.keyDown(triggerButton(), { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    const first = itemAt(options, 0);
    const last = itemAt(options, options.length - 1);
    await waitFor(() => expect(document.activeElement).toBe(first));

    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toBe(last));
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Home' });
    await waitFor(() => expect(document.activeElement).toBe(first));
  });

  it('renders exactly one option in the tab order', () => {
    render(<TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} />);
    fireEvent.click(triggerButton());

    const tabStops = screen.getAllByRole('option').filter((option) => option.tabIndex === 0);
    expect(tabStops).toHaveLength(1);
    expect(itemAt(tabStops, 0)).toBe(screen.getByRole('option', { name: labelFor('deck') }));
  });

  it.each(['Enter', ' '])('selects exactly once with %s and restores trigger focus', async (key) => {
    const onPick = vi.fn();
    render(<TemplatePicker templates={templates} activeChipId="deck" onPick={onPick} labelFor={labelFor} />);
    const trigger = triggerButton();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const selected = screen.getByRole('option', { name: labelFor('deck') });
    await waitFor(() => expect(document.activeElement).toBe(selected));
    fireEvent.keyDown(selected, { key: 'ArrowDown' });
    const next = screen.getByRole('option', {
      name: labelFor(itemAt(templates, templates.findIndex((chip) => chip.id === 'deck') + 1).id),
    });
    await waitFor(() => expect(document.activeElement).toBe(next));

    fireEvent.keyDown(next, { key });
    fireEvent.keyUp(next, { key });
    fireEvent.click(next);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes a keyboard re-selection without calling onPick', async () => {
    const onPick = vi.fn();
    render(<TemplatePicker templates={templates} activeChipId="deck" onPick={onPick} labelFor={labelFor} />);
    const trigger = triggerButton();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const selected = screen.getByRole('option', { name: labelFor('deck') });
    await waitFor(() => expect(document.activeElement).toBe(selected));

    fireEvent.keyDown(selected, { key: 'Enter' });
    fireEvent.click(selected);

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('restores trigger focus when Escape is pressed from an option', async () => {
    render(<TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} />);
    const trigger = triggerButton();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const selected = screen.getByRole('option', { name: labelFor('deck') });
    await waitFor(() => expect(document.activeElement).toBe(selected));

    fireEvent.keyDown(selected, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when focus leaves both trigger and popup', async () => {
    render(<><TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} /><button type="button">Outside</button></>);
    fireEvent.click(triggerButton());
    screen.getByRole('option', { name: labelFor('deck') }).focus();

    screen.getByRole('button', { name: 'Outside' }).focus();

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside' }));
  });

  it('repairs roving focus when the focused template is removed', async () => {
    const { rerender } = render(<TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />);
    fireEvent.keyDown(triggerButton(), { key: 'ArrowDown' });
    const removedTemplate = itemAt(templates, 1);
    const options = screen.getAllByRole('option');
    const removed = itemAt(options, 1);
    fireEvent.keyDown(itemAt(options, 0), { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(removed));

    rerender(<TemplatePicker templates={templates.filter((chip) => chip.id !== removedTemplate.id)} activeChipId={null} labelFor={labelFor} />);

    expect(screen.queryByRole('option', { name: labelFor(removedTemplate.id) })).toBeNull();
    const tabStops = screen.getAllByRole('option').filter((option) => option.tabIndex === 0);
    expect(tabStops).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(itemAt(tabStops, 0)));
  });

  it('keeps focus stable when an outside pointer dismisses the popup', () => {
    render(<><TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} /><button type="button">Outside</button></>);
    const trigger = triggerButton();
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes an open menu when loading disables the picker', () => {
    const props = { templates, activeChipId: 'prototype', labelFor };
    const { rerender } = render(<TemplatePicker {...props} />);
    fireEvent.click(triggerButton());
    expect(screen.getByRole('listbox')).toBeTruthy();
    rerender(<TemplatePicker {...props} disabled />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(triggerButton().disabled).toBe(true);
    fireEvent.click(triggerButton());
    fireEvent.keyDown(triggerButton(), { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes an open menu when the controlled selection changes', () => {
    const { rerender } = render(
      <TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />,
    );
    fireEvent.click(triggerButton());
    expect(screen.getByRole('listbox')).toBeTruthy();

    rerender(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(triggerButton().getAttribute('aria-expanded')).toBe('false');
    expect(triggerButton().textContent).toContain(labelFor('prototype'));

    fireEvent.click(triggerButton());
    expect(screen.getByRole('option', { name: labelFor('prototype') }).getAttribute('aria-selected')).toBe('true');
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
        triggerButton().click();
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
    render(<TemplatePicker templates={templates} activeChipId="deck" labelFor={labelFor} />);

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
    const { rerender } = render(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);
    const pillText = screen.getByTestId('home-hero-template-trigger').textContent;
    expect(pillText).toContain(labelFor('prototype'));

    // Everything a sub-category pick changes in the host (its own selection
    // state) leaves this component's props untouched, so the pill re-renders
    // identically.
    rerender(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toBe(pillText);
  });

  it('offers neither a type clear nor a sub-type clear', () => {
    render(<TemplatePicker templates={templates} activeChipId="prototype" labelFor={labelFor} />);

    // The progressive "first × drops the category, second drops the type" pair
    // went away with the retitling that made it legible.
    expect(screen.queryByTestId('home-hero-template-clear-subtype')).toBeNull();
    fireEvent.mouseOver(screen.getByTestId('home-hero-template-picker'));
    expect(screen.queryByTestId('home-hero-template-clear')).toBeNull();
  });
});
