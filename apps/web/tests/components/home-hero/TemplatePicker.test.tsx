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

// The pill is display + clear: picking a type belongs to the type row under
// the composer, and the dropdown this used to open was removed (per product)
// once that row carried the whole catalog one line below.
describe('TemplatePicker', () => {
  it('names the committed template and opens nothing when clicked', () => {
    const onClearTemplate = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        activeChipId="document"
        onClearTemplate={onClearTemplate}
        labelFor={labelFor}
      />,
    );

    expect(screen.getByTestId('home-hero-template-picker').className).toContain('has-selection');
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Document');

    fireEvent.click(screen.getByTestId('home-hero-template-trigger'));
    expect(screen.queryByTestId('home-hero-template-menu')).toBeNull();
    expect(screen.queryByTestId('home-hero-template-wedge-prototype')).toBeNull();
  });

  it('renders nothing at all with no template picked', () => {
    // The pill IS the committed value. An empty placeholder in the card would
    // name a field that is answered by the type row below it.
    render(
      <TemplatePicker templates={templates} activeChipId={null} labelFor={labelFor} />,
    );

    expect(screen.queryByTestId('home-hero-template-picker')).toBeNull();
    expect(screen.queryByTestId('home-hero-template-trigger')).toBeNull();
  });

  it('clears the template from the leading icon', () => {
    const onClearTemplate = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        activeChipId="document"
        onClearTemplate={onClearTemplate}
        labelFor={labelFor}
      />,
    );

    fireEvent.click(screen.getByTestId('home-hero-template-clear'));
    expect(onClearTemplate).toHaveBeenCalledTimes(1);
  });

  it('offers no clear when the host supplies no handler', () => {
    render(
      <TemplatePicker templates={templates} activeChipId="document" labelFor={labelFor} />,
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
        onClearTemplate={vi.fn()}
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
        onClearTemplate={vi.fn()}
        labelFor={labelFor}
      />,
    );
    expect(screen.getByTestId('home-hero-template-trigger').textContent).toBe(pillText);
  });

  it('offers one clear, and it gives up the template', () => {
    const onClearTemplate = vi.fn();
    render(
      <TemplatePicker
        templates={templates}
        activeChipId="prototype"
        onClearTemplate={onClearTemplate}
        labelFor={labelFor}
      />,
    );

    // The progressive "first × drops the category, second drops the type" pair
    // went away with the retitling that made it legible.
    expect(screen.queryByTestId('home-hero-template-clear-subtype')).toBeNull();
    fireEvent.click(screen.getByTestId('home-hero-template-clear'));
    expect(onClearTemplate).toHaveBeenCalledTimes(1);
  });
});
