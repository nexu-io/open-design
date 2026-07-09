// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrBalanceDialog } from '../../src/components/AmrBalanceDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AmrBalanceDialog', () => {
  it('dismisses from the corner close button', () => {
    const onClose = vi.fn();

    render(
      <AmrBalanceDialog
        reason="insufficient"
        balanceUsd="0.00"
        profile="prod"
        entrySource="chat_balance_gate_upgrade"
        metricsConsent={false}
        installationId={null}
        onClose={onClose}
        onResolved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
