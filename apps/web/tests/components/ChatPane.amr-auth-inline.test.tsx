// @vitest-environment jsdom

/**
 * The in-chat AMR auth surface. When an AMR run fails with AMR_AUTH_REQUIRED,
 * the error card must offer an INLINE sign-in (the AmrLoginPill, which drives
 * vela login + surfaces the activation URL/code) rather than bouncing the user
 * out to Settings. On a successful sign-in the failed run is retried exactly
 * once. The pill's own login + activation-block behaviour is covered by
 * AmrLoginPill.test.tsx; here we only assert ChatPane's wiring.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useEffect, type ComponentProps } from 'react';
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
  onSignInStarted?: () => void;
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
    onSignInStarted?: () => void;
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

function localAgentAuthFailedMessage(): ChatMessage {
  return {
    ...amrAuthFailedMessage(),
    id: 'msg-local-auth',
    runId: 'run-local-auth',
    agentId: 'codex',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Codex authorization expired.',
        code: 'AGENT_AUTH_REQUIRED',
      },
    ],
  };
}

function renderChat(
  onRetry: (m: ChatMessage) => void,
  props: Partial<ComponentProps<typeof ChatPane>> = {},
) {
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
      {...props}
    />,
  );
}

const signedIn: VelaLoginStatus = {
  loggedIn: true,
  profile: 'prod',
  user: { id: 'account-a', email: 'account-a@example.com', plan: 'free' },
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
    expect(screen.queryByText('promptTemplates.retry')).toBeNull();
  });

  it('arms on the origin mount and retries once only after an exact fresh mount', () => {
    const onRetry = vi.fn();
    let pending: Parameters<NonNullable<ComponentProps<typeof ChatPane>['onArmAmrAuthRetryContinuation']>>[0] | null = null;
    const onArm = vi.fn((next) => {
      pending = next;
    });
    renderChat(onRetry, {
      amrAuthRetryMountId: 'mount-origin',
      amrAuthRetryWorkspaceIdentityKey:
        'workspace-a:personal:member-a:owner:active:active:true:true',
      onArmAmrAuthRetryContinuation: onArm,
    });

    lastPillProps?.onSignInStarted?.();
    expect(onArm).toHaveBeenCalledTimes(1);
    expect(pending).toMatchObject({
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantId: 'msg-amr-auth',
      originMountId: 'mount-origin',
    });
    // Even a fast signed-in event cannot let the origin authorization lifetime
    // retry with its now-stale context.
    lastPillProps?.onStatusChange?.(signedIn);
    expect(onRetry).not.toHaveBeenCalled();

    cleanup();
    let available = true;
    const onConsume = vi.fn(() => {
      if (!available) return false;
      available = false;
      return true;
    });
    renderChat(onRetry, {
      amrAuthRetryContinuation: {
        ...pending!,
        accountIdAtArm: null,
        createdAtMs: Date.now(),
      },
      amrAuthRetryMountId: 'mount-fresh',
      amrAuthRetryWorkspaceIdentityKey:
        'workspace-a:personal:member-a:owner:active:active:true:true',
      onConsumeAmrAuthRetryContinuation: onConsume,
    });

    lastPillProps?.onStatusChange?.(signedIn);
    lastPillProps?.onStatusChange?.(signedIn);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-amr-auth' });
    expect(onConsume).toHaveBeenCalledTimes(2);
  });

  it('waits for the current signed-in status to carry an account id', () => {
    const onRetry = vi.fn();
    const onConsume = vi.fn(() => true);
    renderChat(onRetry, {
      amrAuthRetryContinuation: {
        projectId: 'project-1',
        conversationId: 'conv-1',
        assistantId: 'msg-amr-auth',
        workspaceIdentityKey:
          'workspace-a:personal:member-a:owner:active:active:true:true',
        originMountId: 'mount-origin',
        accountIdAtArm: 'account-a',
        createdAtMs: Date.now(),
      },
      amrAuthRetryMountId: 'mount-fresh',
      amrAuthRetryWorkspaceIdentityKey:
        'workspace-a:personal:member-a:owner:active:active:true:true',
      onConsumeAmrAuthRetryContinuation: onConsume,
    });

    lastPillProps?.onStatusChange?.({
      ...signedIn,
      user: null,
    });

    expect(onConsume).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();

    lastPillProps?.onStatusChange?.(signedIn);

    expect(onConsume).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('consumes a Settings handoff on a fresh exact mount even without an inline AMR failure', async () => {
    fetchVelaLoginStatusMock.mockResolvedValue(signedIn);
    const onRetry = vi.fn();
    let available = true;
    const onConsume = vi.fn(() => {
      if (!available) return false;
      available = false;
      return true;
    });
    renderChat(onRetry, {
      messages: [localAgentAuthFailedMessage()],
      amrAuthRetryContinuation: {
        projectId: 'project-1',
        conversationId: 'conv-1',
        assistantId: 'msg-local-auth',
        workspaceIdentityKey:
          'workspace-a:personal:member-a:owner:active:active:true:true',
        originMountId: 'mount-before-settings',
        accountIdAtArm: null,
        createdAtMs: Date.now(),
      },
      amrAuthRetryMountId: 'mount-after-settings',
      amrAuthRetryWorkspaceIdentityKey:
        'workspace-a:personal:member-a:owner:active:active:true:true',
      onConsumeAmrAuthRetryContinuation: onConsume,
    });

    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-local-auth' });
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it('retries an unbound local project on the same mount only after signed-out -> signed-in', () => {
    const onRetry = vi.fn();
    let armed: Parameters<NonNullable<ComponentProps<typeof ChatPane>['onArmAmrAuthRetryContinuation']>>[0] | null = null;
    const onArm = vi.fn((next) => {
      armed = next;
    });
    let available = true;
    const onConsume = vi.fn(() => {
      if (!available) return false;
      available = false;
      return true;
    });
    const baseProps: Partial<ComponentProps<typeof ChatPane>> = {
      amrAuthRetryMountId: 'mount-local',
      amrAuthRetryWorkspaceIdentityKey: 'none',
      onArmAmrAuthRetryContinuation: onArm,
      onConsumeAmrAuthRetryContinuation: onConsume,
    };
    const view = renderChat(onRetry, baseProps);

    lastPillProps?.onSignInStarted?.();
    expect(armed).not.toBeNull();
    view.rerender(
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
        {...baseProps}
        amrAuthRetryWorkspaceIdentityKey=
          "personal-a:personal:member-personal-a:owner:active:active:true:true"
        amrAuthRetryPersonalAdoptionWitness={{
          workspaceIdentityKey:
            'personal-a:personal:member-personal-a:owner:active:active:true:true',
          workspaceId: 'personal-a',
          workspaceMemberId: 'member-personal-a',
          workspaceType: 'personal',
          memberStatus: 'active',
        }}
        amrAuthRetryContinuation={{
          ...armed!,
          accountIdAtArm: null,
          createdAtMs: Date.now(),
        }}
      />,
    );

    // A signed-in poll by itself is not proof that this authorization attempt
    // changed identity, so it must not retry.
    lastPillProps?.onStatusChange?.(signedIn);
    expect(onRetry).not.toHaveBeenCalled();

    lastPillProps?.onStatusChange?.({
      loggedIn: false,
      loginInFlight: true,
      profile: 'prod',
      user: null,
      configPath: '',
    });
    lastPillProps?.onStatusChange?.(signedIn);
    lastPillProps?.onStatusChange?.(signedIn);

    expect(onConsume).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
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
