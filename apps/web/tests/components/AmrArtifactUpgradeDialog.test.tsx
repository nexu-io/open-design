// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrArtifactUpgradeDialog } from '../../src/components/AmrArtifactUpgradeDialog';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AmrArtifactUpgradeDialog', () => {
  it('opens the plans view from the successful-artifact upgrade CTA', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <AmrArtifactUpgradeDialog
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText('Keep refining with stronger models')).toBeTruthy();
    expect(
      screen.getByText('Unlock advanced models, more parallel tasks, and more monthly credits.'),
    ).toBeTruthy();
    expect(screen.getByTestId('amr-artifact-upgrade-art')).toHaveAttribute(
      'src',
      '/upgrade/creative-capacity-warm.jpg',
    );
    expect(screen.getByText('More advanced models, including Fable 5 and GPT-5.6')).toBeTruthy();
    expect(screen.getByText('Run up to 10× more tasks concurrently')).toBeTruthy();
    expect(screen.getByText('Up to 300× more monthly credits')).toBeTruthy();
    const priorityBenefit = screen.getByText(
      'Priority queue at peak times for faster generations',
    );
    expect(priorityBenefit.tagName).toBe('SPAN');
    expect(priorityBenefit.closest('li')?.hasAttribute('data-priority')).toBe(false);
    expect(
      screen.getByText('Limited time: save up to 67% on plans'),
    ).toBeTruthy();
    expect(screen.getByRole('timer', { name: /Offer ends in/ })).toBeTruthy();
    const plansCta = screen.getByTestId('amr-artifact-upgrade-plans');
    expect(plansCta).toHaveTextContent('Upgrade now, up to 67% off');
    expect(plansCta.querySelector('svg')).toBeNull();
    fireEvent.click(plansCta);

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('view=plans'),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('restarts the seven-day offer countdown at the cycle boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T23:59:59.000Z'));
    render(
      <AmrArtifactUpgradeDialog
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByTestId('amr-artifact-upgrade-offer-days')).toHaveTextContent('00d');
    expect(screen.getByTestId('amr-artifact-upgrade-offer-time')).toHaveTextContent(
      '00:00:01',
    );

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByTestId('amr-artifact-upgrade-offer-days')).toHaveTextContent('07d');
    expect(screen.getByTestId('amr-artifact-upgrade-offer-time')).toHaveTextContent(
      '00:00:00',
    );
  });

  it('continues the paused Send only from the explicit Free action', () => {
    const onClose = vi.fn();
    const onContinue = vi.fn();
    render(
      <AmrArtifactUpgradeDialog
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onClose={onClose}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-later'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('treats the modal close control as cancel, not as Send', () => {
    const onClose = vi.fn();
    const onContinue = vi.fn();
    render(
      <AmrArtifactUpgradeDialog
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onClose={onClose}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('moves focus into the modal, traps both Tab directions, locks scroll, and restores state', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    document.body.style.overflow = 'auto';
    opener.focus();
    const view = render(
      <AmrArtifactUpgradeDialog
        profile="prod"
        metricsConsent={false}
        installationId={null}
        onClose={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close' });
    const later = screen.getByTestId('amr-artifact-upgrade-later');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(dialog);
    expect(opener.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(later);

    dialog.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    later.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    view.unmount();
    expect(opener.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
    opener.remove();
  });
});
