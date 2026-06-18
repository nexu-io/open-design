// @vitest-environment jsdom
//
// Render contract for the AuthAccountMenu (web half of the dual-track auth
// surface). Drives the real component with a mocked better-auth client and
// asserts the signed-out / signed-in states and the sign-up interaction. The
// real /api/auth round-trip is covered by the e2e flow, not here.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthAccountMenu } from '../../src/components/AuthAccountMenu';

const h = vi.hoisted(() => {
  const state: { data: { user?: { name?: string; email?: string } } | null } = { data: null };
  return {
    state,
    signInEmail: vi.fn(async () => ({ error: null })),
    signUpEmail: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    refetch: vi.fn(async () => {}),
  };
});

vi.mock('../../src/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: h.state.data, refetch: h.refetch }),
    signIn: { email: h.signInEmail },
    signUp: { email: h.signUpEmail },
    signOut: h.signOut,
  },
}));

describe('AuthAccountMenu', () => {
  beforeEach(() => {
    h.state.data = null;
    h.signInEmail.mockClear();
    h.signUpEmail.mockClear();
    h.signOut.mockClear();
  });
  afterEach(() => cleanup());

  it('shows a Sign in trigger and opens the auth form when signed out', () => {
    render(<AuthAccountMenu />);
    const trigger = screen.getByRole('button', { name: 'Sign in' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    // Tabs + fields appear.
    expect(screen.getByRole('tab', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Create' })).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Password')).toBeTruthy();
  });

  it('switching to Create reveals the Name field and submits via signUp', async () => {
    render(<AuthAccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));
    expect(screen.getByText('Name')).toBeTruthy();

    const dialog = screen.getByRole('dialog');
    const inputs = dialog.querySelectorAll('input');
    // Name, Email, Password in order.
    fireEvent.change(inputs[0]!, { target: { value: 'Ada' } });
    fireEvent.change(inputs[1]!, { target: { value: 'ada@example.com' } });
    fireEvent.change(inputs[2]!, { target: { value: 'longenough1' } });
    fireEvent.submit(dialog.querySelector('form')!);

    expect(h.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', name: 'Ada', password: 'longenough1' }),
    );
    expect(h.signInEmail).not.toHaveBeenCalled();
  });

  it('renders the account identity and a Sign out action when signed in', () => {
    h.state.data = { user: { name: 'Ada Lovelace', email: 'ada@example.com' } };
    render(<AuthAccountMenu />);
    const trigger = screen.getByRole('button', { name: 'Account: Ada Lovelace' });
    fireEvent.click(trigger);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});
