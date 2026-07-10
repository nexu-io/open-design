// @vitest-environment jsdom
//
// Purely presentational: given a hand-built OAuth controller, it renders the
// right status line + action buttons and forwards clicks. No hook, no port.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpOAuthControlView } from '../../../src/features/mcp-client/components/McpOAuthControlView';
import type { McpOAuthController } from '../../../src/features/mcp-client/hooks/useMcpOAuth.hooks';

afterEach(cleanup);

function controller(over: Partial<McpOAuthController> = {}): McpOAuthController {
  return {
    status: null,
    busy: 'idle',
    error: null,
    pendingAuthUrl: null,
    connected: false,
    isAwaiting: false,
    expiresLabel: null,
    onConnect: vi.fn(),
    onRefreshStatus: vi.fn(),
    onCancelPending: vi.fn(),
    onDisconnect: vi.fn(),
    ...over,
  };
}

describe('McpOAuthControlView', () => {
  it('not-connected: shows Connect and fires onConnect', () => {
    const c = controller();
    render(<McpOAuthControlView {...c} />);
    expect(screen.getByText(/Not connected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/ }));
    expect(c.onConnect).toHaveBeenCalled();
  });

  it('awaiting: shows the approve/refresh + cancel buttons and the fallback link', () => {
    const c = controller({ isAwaiting: true, pendingAuthUrl: 'https://auth' });
    render(<McpOAuthControlView {...c} />);
    expect(screen.getByText(/Waiting for authorization/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /approved — Refresh/i }));
    expect(c.onRefreshStatus).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(c.onCancelPending).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Open authorization page/i }).getAttribute('href')).toBe('https://auth');
  });

  it('connected: shows reconnect/refresh/disconnect + the expiry hint and an error', () => {
    const c = controller({ connected: true, expiresLabel: 'soon', error: 'boom' });
    render(<McpOAuthControlView {...c} />);
    expect(screen.getByText(/Token expires soon/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Disconnect/ }));
    expect(c.onDisconnect).toHaveBeenCalled();
    expect(screen.getByText('boom')).toBeTruthy();
  });
});
