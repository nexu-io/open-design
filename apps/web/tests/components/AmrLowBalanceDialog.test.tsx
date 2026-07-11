// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrLowBalanceDialog } from '../../src/components/AmrLowBalanceDialog';

function renderDialog(plan: string | null) {
  const onDecision = vi.fn();
  render(
    <AmrLowBalanceDialog
      balanceUsd="1.20"
      plan={plan}
      profile="prod"
      entrySource="chat_low_balance_warn_recharge"
      metricsConsent={false}
      installationId={null}
      onDecision={onDecision}
    />,
  );
  return { onDecision };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AmrLowBalanceDialog', () => {
  it('uses the upgrade-plan primary CTA for free accounts', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { onDecision } = renderDialog('free');

    const primary = screen.getByTestId('amr-low-balance-dialog-recharge');
    expect(primary.textContent).toBe('Upgrade plan');

    fireEvent.click(primary);

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('view=plans'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(onDecision).toHaveBeenCalledWith('recharge');
  });

  it('keeps the top-up primary CTA for paid accounts', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderDialog('plus');

    const primary = screen.getByTestId('amr-low-balance-dialog-recharge');
    expect(primary.textContent).toBe('Top up');

    fireEvent.click(primary);

    const url = String(open.mock.calls[0]?.[0] ?? '');
    expect(url).not.toContain('view=plans');
  });

  it('dismisses from the corner close button', () => {
    const { onDecision } = renderDialog('free');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onDecision).toHaveBeenCalledWith('dismiss');
  });
});
