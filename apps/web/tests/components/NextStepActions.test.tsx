// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NextStepActions } from '../../src/components/NextStepActions';
import { en } from '../../src/i18n/locales/en';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderActions(overrides: Partial<Parameters<typeof NextStepActions>[0]> = {}) {
  const handlers = {
    onShare: vi.fn(),
    onChip: vi.fn(),
  };
  render(
    <NextStepActions
      fileName="landing.html"
      onShare={handlers.onShare}
      onChip={handlers.onChip}
      {...overrides}
    />,
  );
  return handlers;
}

describe('NextStepActions', () => {
  it('renders Share alongside the recommended directions at one level', () => {
    renderActions();
    expect(screen.getByText(en['nextStep.share'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.chipPolishVisual'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.chipBrand'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.chipConcise'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.chipSecondVersion'])).toBeTruthy();
  });

  it('fires Share with the artifact file name', () => {
    const handlers = renderActions();
    fireEvent.click(screen.getByText(en['nextStep.share']));
    expect(handlers.onShare).toHaveBeenCalledWith('landing.html');
  });

  it('prefills the chip label (no auto-send) when a chip is clicked', () => {
    const handlers = renderActions();
    fireEvent.click(screen.getByText(en['nextStep.chipBrand']));
    expect(handlers.onChip).toHaveBeenCalledWith('landing.html', en['nextStep.chipBrand']);
  });

  it('accumulates a combined prompt across multiple selected chips (CHIPS order)', () => {
    const handlers = renderActions();
    const joiner = en['nextStep.chipJoiner'];

    // Click out of catalogue order: brand (2nd) then polish_visual (1st).
    fireEvent.click(screen.getByText(en['nextStep.chipBrand']));
    expect(handlers.onChip).toHaveBeenLastCalledWith('landing.html', en['nextStep.chipBrand']);

    fireEvent.click(screen.getByText(en['nextStep.chipPolishVisual']));
    // Combined text stays in catalogue order, not click order.
    expect(handlers.onChip).toHaveBeenLastCalledWith(
      'landing.html',
      `${en['nextStep.chipPolishVisual']}${joiner}${en['nextStep.chipBrand']}`,
    );
  });

  it('toggles a chip off and reflects pressed state', () => {
    const handlers = renderActions();
    const chip = screen.getByText(en['nextStep.chipConcise']);

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(handlers.onChip).toHaveBeenLastCalledWith('landing.html', en['nextStep.chipConcise']);

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    // Deselecting the last chip clears the composer draft.
    expect(handlers.onChip).toHaveBeenLastCalledWith('landing.html', '');
  });

  it('keeps selectable chips exposed as native buttons', () => {
    renderActions();

    const chip = screen.getByRole('button', {
      name: en['nextStep.chipBrand'],
    });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});
