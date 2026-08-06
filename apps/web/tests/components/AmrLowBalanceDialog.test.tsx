// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrLowBalanceDialog } from '../../src/components/AmrLowBalanceDialog';

function renderDialog() {
  const onDecision = vi.fn();
  render(
    <AmrLowBalanceDialog
      balanceUsd="1.20"
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
  it('opens the top-up flow for eligible paid accounts', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderDialog();

    const primary = screen.getByTestId('amr-low-balance-dialog-recharge');
    expect(primary.textContent).toBe('Top up');

    fireEvent.click(primary);

    const url = String(open.mock.calls[0]?.[0] ?? '');
    // The top-up entry must not carry B's upgrade intent — it opens the
    // console to add credit, not the plan catalog.
    expect(url).not.toContain('billing=plan');
  });

  it('dismisses from the corner close button', () => {
    const { onDecision } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onDecision).toHaveBeenCalledWith('dismiss');
  });
});
