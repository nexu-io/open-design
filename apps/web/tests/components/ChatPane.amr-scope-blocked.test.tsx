// @vitest-environment jsdom

/**
 * The AMR workspace-scope gate must explain itself in the composer.
 *
 * `21f452ffe` disables the send button when an AMR project cannot resolve a
 * personal/team workspace authority. Keeping it disabled is intended. Being
 * SILENT about it is not: the user saw a dead grey button with no reason and no
 * way out, while Home's equivalent dead end (`checkAmrBalanceGate` ->
 * `AmrBalanceDialog` reason `signed_out`) hands over an in-app sign-in.
 *
 * So the blocked composer must render, next to the composer itself:
 *   - a reason the user can read, and
 *   - the remedy that actually clears that reason — the SAME `AmrLoginPill`
 *     sign-in action and copy Home's balance gate uses, or a retry of the
 *     workspace-scope read when the session is not the missing piece.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AmrWorkspaceScopeBlock } from '../../src/runtime/amr-workspace-scope-gate';
import type { AppConfig } from '../../src/types';

const fetchVelaLoginStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchVelaLoginStatus: fetchVelaLoginStatusMock,
}));

let lastPillProps: {
  signInLabel?: string;
  amrEntrySourceDetail?: string;
  metricsConsent?: boolean;
  installationId?: string | null;
  showActivationDetails?: boolean;
} | null = null;
vi.mock('../../src/components/AmrLoginPill', () => ({
  AmrLoginPill: (props: {
    signInLabel?: string;
    amrEntrySourceDetail?: string;
    metricsConsent?: boolean;
    installationId?: string | null;
    showActivationDetails?: boolean;
  }) => {
    lastPillProps = props;
    return (
      <button type="button" data-testid="amr-login-pill">
        {props.signInLabel}
      </button>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  lastPillProps = null;
});

beforeEach(() => {
  fetchVelaLoginStatusMock.mockResolvedValue({
    loggedIn: false,
    profile: 'prod',
    user: null,
    configPath: '',
  });
});

function renderChat(
  amrScopeBlock: AmrWorkspaceScopeBlock | null,
  onRetryWorkspaceScope = vi.fn(),
) {
  render(
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      // Mirrors ProjectView: the gate holds the send action closed.
      sendDisabled={amrScopeBlock != null}
      amrScopeBlock={amrScopeBlock}
      onRetryWorkspaceScope={onRetryWorkspaceScope}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{
        agentId: 'amr',
        agentCliEnv: {},
        installationId: 'install-123',
        telemetry: { metrics: true },
      } as unknown as AppConfig}
    />,
  );
  return { onRetryWorkspaceScope };
}

describe('ChatPane AMR workspace-scope notice', () => {
  it('renders nothing while the gate is open', () => {
    renderChat(null);

    expect(screen.queryByTestId('amr-scope-blocked-notice')).toBeNull();
  });

  it('explains a missing Open Design Cloud session and offers the in-app sign-in', () => {
    renderChat({ kind: 'signed_out' });

    const notice = screen.getByTestId('amr-scope-blocked-notice');
    // A reason the user can actually read, not just a dead button.
    expect(notice.textContent).toContain('chat.amrScopeGate.signedOutMessage');
    // ...and the remedy: the same sign-in action + copy Home's balance gate uses.
    expect(screen.getByTestId('amr-login-pill')).toBeTruthy();
    expect(lastPillProps?.signInLabel).toBe('chat.amrBalanceGate.signInCta');
    expect(lastPillProps?.amrEntrySourceDetail).toBe('chat_balance_gate_sign_in');
    expect(lastPillProps?.showActivationDetails).toBe(true);
    expect(lastPillProps?.metricsConsent).toBe(true);
    expect(lastPillProps?.installationId).toBe('install-123');
  });

  it('explains an unresolved workspace authority and offers a re-read of it', () => {
    const { onRetryWorkspaceScope } = renderChat({ kind: 'unresolved' });

    const notice = screen.getByTestId('amr-scope-blocked-notice');
    expect(notice.textContent).toContain('chat.amrScopeGate.unresolvedMessage');
    // Signing in is not the missing piece here, so the remedy is a retry of the
    // workspace-scope read rather than an account action.
    expect(screen.queryByTestId('amr-login-pill')).toBeNull();
    const retry = screen.getByTestId('amr-scope-blocked-retry');
    retry.click();
    expect(onRetryWorkspaceScope).toHaveBeenCalledTimes(1);
  });
});
