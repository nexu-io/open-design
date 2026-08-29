// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserActionCard } from '../../src/components/UserActionCard';

afterEach(cleanup);

describe('UserActionCard', () => {
  it('keeps explanation content collapsed behind a reusable detail disclosure', () => {
    const { container } = render(
      <UserActionCard
        dataKind="test-action"
        icon="info"
        title="Sign in required"
        footerActions={<button type="button">Sign in</button>}
        detailsLabel="View details"
        details={<p>Authentication expired while the task was running.</p>}
      />,
    );

    expect(container.querySelector('[data-user-action-card="test-action"]')).toBeTruthy();
    const action = screen.getByRole('button', { name: 'Sign in' });
    expect(action).toBeTruthy();
    expect(container.querySelector('[data-user-action-footer="true"]')?.contains(action)).toBe(true);

    const toggle = screen.getByRole('button', { name: 'View details' });
    expect(toggle.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    const disclosure = container.querySelector('.accordion-collapsible');
    const details = container.querySelector('.accordion-collapsible-inner');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);
    expect(details?.hasAttribute('inert')).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.classList.contains('open')).toBe(true);
    expect(details?.hasAttribute('inert')).toBe(false);
  });

  it('keeps full localized recovery labels actionable in the footer', () => {
    const onRecharge = vi.fn();
    const onRetry = vi.fn();

    const { container } = render(
      <UserActionCard
        dataKind="run-recovery"
        icon="alert-triangle"
        title="余额不足"
        footerActions={
          <>
            <button type="button" onClick={onRecharge}>
              为 OpenDesign Cloud 充值
            </button>
            <button type="button" onClick={onRetry}>
              Retry the OpenDesign Cloud request
            </button>
          </>
        }
      />,
    );

    const footer = container.querySelector('[data-user-action-footer="true"]');
    const recharge = screen.getByRole('button', { name: '为 OpenDesign Cloud 充值' });
    const retry = screen.getByRole('button', {
      name: 'Retry the OpenDesign Cloud request',
    });
    expect(footer?.contains(recharge)).toBe(true);
    expect(footer?.contains(retry)).toBe(true);

    fireEvent.click(recharge);
    fireEvent.click(retry);
    expect(onRecharge).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
