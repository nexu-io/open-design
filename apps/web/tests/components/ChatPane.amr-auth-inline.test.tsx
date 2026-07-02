// @vitest-environment jsdom

/**
 * The in-chat AMR auth surface. When an AMR run fails with AMR_AUTH_REQUIRED,
 * the error card must offer an INLINE sign-in (the AmrLoginPill, which drives
 * vela login + surfaces the activation URL/code) rather than bouncing the user
 * out to Settings. On a successful sign-in the failed run is retried exactly
 * once. The pill's own login + activation-block behaviour is covered by
 * AmrLoginPill.test.tsx; here we only assert ChatPane's wiring.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';
import type { VelaLoginStatus } from '../../src/providers/daemon';

const fetchVelaLoginStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchVelaLoginStatus: fetchVelaLoginStatusMock,
}));

// Capture the props ChatPane hands the inline pill, and expose a button that
// lets the test drive the login-status callback.
let lastPillProps: {
  signInLabel?: string;
  amrEntrySourceDetail?: string;
  initialStatus?: VelaLoginStatus | null;
  metricsConsent?: boolean;
  installationId?: string | null;
  showActivationDetails?: boolean;
  onStatusChange?: (s: VelaLoginStatus | null) => void;
} | null = null;
vi.mock('../../src/components/AmrLoginPill', () => ({
  AmrLoginPill: (props: {
    signInLabel?: string;
    amrEntrySourceDetail?: string;
    initialStatus?: VelaLoginStatus | null;
    metricsConsent?: boolean;
    installationId?: string | null;
    showActivationDetails?: boolean;
    onStatusChange?: (s: VelaLoginStatus | null) => void;
  }) => {
    lastPillProps = props;
    useEffect(() => {
      props.onStatusChange?.(props.initialStatus ?? null);
    }, [props.initialStatus, props.onStatusChange]);
    return <div data-testid="amr-login-pill">{props.signInLabel}</div>;
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

function amrAuthFailedMessage(): ChatMessage {
  return {
    id: 'msg-amr-auth',
    role: 'assistant',
    content: 'Partial work before AMR demanded sign-in.',
    createdAt: 1,
    runId: 'run-amr-auth',
    runStatus: 'failed',
    agentId: 'amr',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'AMR sign-in is required.',
        code: 'AMR_AUTH_REQUIRED',
      },
    ],
  };
}

function renderChat(onRetry: (m: ChatMessage) => void) {
  return render(
    <ChatPane
      messages={[amrAuthFailedMessage()]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={onRetry}
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
}

const signedIn: VelaLoginStatus = {
  loggedIn: true,
  profile: 'prod',
  user: null,
  configPath: '',
};

describe('ChatPane inline AMR auth', () => {
  it('renders the inline sign-in pill (not a Settings bounce) on AMR_AUTH_REQUIRED', () => {
    renderChat(vi.fn());

    expect(screen.getByTestId('amr-login-pill')).toBeTruthy();
    expect(lastPillProps?.signInLabel).toBe('chat.amrError.authorizeCta');
    expect(lastPillProps?.amrEntrySourceDetail).toBe('chat_error_authorize_retry');
    expect(lastPillProps?.metricsConsent).toBe(true);
    expect(lastPillProps?.installationId).toBe('install-123');
    expect(lastPillProps?.showActivationDetails).toBe(true);
  });

  it('retries the failed run exactly once on a signed-out -> signed-in transition', () => {
    const onRetry = vi.fn();
    renderChat(onRetry);

    const signedOut: VelaLoginStatus = {
      loggedIn: false,
      loginInFlight: true,
      profile: 'prod',
      user: null,
      configPath: '',
    };
    // Establish the signed-out baseline, then the sign-in transition retries
    // once; a repeated signed-in poll must NOT retry again (loop guard).
    lastPillProps?.onStatusChange?.(signedOut);
    lastPillProps?.onStatusChange?.(signedIn);
    lastPillProps?.onStatusChange?.(signedIn);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-amr-auth' });
  });

  it('does not retry while still signed out', () => {
    const onRetry = vi.fn();
    renderChat(onRetry);

    lastPillProps?.onStatusChange?.({
      loggedIn: false,
      loginInFlight: true,
      profile: 'prod',
      user: null,
      configPath: '',
    });

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not auto-retry when the shared AMR status already reports signed in', async () => {
    // Loop guard: when /status reports signed-in from the start (no signed-out
    // -> signed-in transition), a run that keeps failing AMR_AUTH_REQUIRED must
    // NOT auto-retry — otherwise each retry spawns a new run that fails again.
    fetchVelaLoginStatusMock.mockResolvedValue(signedIn);
    const onRetry = vi.fn();
    renderChat(onRetry);

    // Let the shared poll + the pill's mount status callback settle.
    await new Promise((resolve) => setTimeout(resolve, 120));
    lastPillProps?.onStatusChange?.(signedIn);

    expect(onRetry).not.toHaveBeenCalled();
  });
});
