// @vitest-environment jsdom

/**
 * The in-chat AMR auth continuation.
 *
 * ⚠️ **OPEND-2807 removed the inline sign-in pill from the error card.** The
 * ticket ("错误卡片…应该只有三个按钮") leaves an AMR failure with exactly
 * 联系我们 / 导出日志 / 重试, so there is no AmrLoginPill on the card any more
 * and ChatPane no longer ARMS a continuation — that half now lives only in
 * `ProjectView.handleSwitchToAmrAndRetry`.
 *
 * What survives here, and is still worth its weight, is the **consumption**
 * half: an armed continuation must be redeemed exactly once, against the
 * account identity of the exact status observation that redeems it. Those are
 * the account-generation guards from the #7426 family, and they are unchanged.
 *
 * The driver changed with the pill: instead of poking the pill's
 * `onStatusChange`, these tests now advance ChatPane's own 500ms auth poll
 * (`fetchVelaLoginStatus`) — which is what production actually runs.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useEffect, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';
import type { VelaLoginStatus } from '../../src/providers/daemon';

const fetchVelaLoginStatusMock = vi.hoisted(() => vi.fn());

const translate = (key: string) => key;

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
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
  vi.useRealTimers();
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

const signedOut: VelaLoginStatus = {
  loggedIn: false,
  profile: 'prod',
  user: null,
  configPath: '',
};

/**
 * Feed ChatPane's auth poll ONE observation.
 *
 * The pane polls `fetchVelaLoginStatus` every 500ms while an AMR authorize
 * failure is on screen and hands every reading to the continuation guard —
 * the same seam the pill's `onStatusChange` used to drive. A sticky
 * `mockResolvedValue` (not `…Once`) keeps this deterministic: two pollers
 * start on mount, so a queue of one-shot values would be raced.
 */
async function observeStatus(status: VelaLoginStatus): Promise<void> {
  fetchVelaLoginStatusMock.mockResolvedValue(status);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

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
  /*
   * origin/main 这条钉的是「S04 给内联登录,不把人踢去设置」。
   * OPEND-2807 之后卡上只有三颗按钮,内联登录不在其中 ——
   * ⚠️ **这意味着 S04 的卡上没有登录入口**,只有一颗会再失败一次的〔重试〕。
   * 这条代价已写进 PR 描述与决策表,交产品定夺;这里先把现状钉死,
   * 免得它悄悄变回来或者悄悄再多一颗。
   */
  it('OPEND-2807:S04 卡上不再有内联登录,只剩三颗按钮', () => {
    const { container } = renderChat(vi.fn());

    expect(screen.queryByTestId('amr-login-pill')).toBeNull();
    const footer = container.querySelector<HTMLElement>('[data-user-action-footer="true"]');
    expect(footer).toBeTruthy();
    expect(
      Array.from(footer!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'chat-error-contact-support',
      'chat-error-export-logs',
      'chat-error-retry',
    ]);
  });

  /*
   * ⚠️ 原用例的前半段是「在 origin mount 上**武装**」,由卡上那颗登录 pill 的
   * `onSignInStarted` 驱动。OPEND-2807 拿掉了 pill,武装这一半随之搬到
   * `ProjectView.handleSwitchToAmrAndRetry`,不再是 ChatPane 的职责。
   * 留在这里的是仍归 ChatPane 的那一半:**在一个精确匹配的新 mount 上,
   * 一次武装只能兑现一次**。
   */
  it('redeems an armed continuation exactly once on an exact fresh mount', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    let available = true;
    const onConsume = vi.fn(() => {
      if (!available) return false;
      available = false;
      return true;
    });
    renderChat(onRetry, {
      amrAuthRetryContinuation: {
        projectId: 'project-1',
        conversationId: 'conv-1',
        assistantId: 'msg-amr-auth',
        workspaceIdentityKey:
          'workspace-a:personal:member-a:owner:active:active:true:true',
        originMountId: 'mount-origin',
        accountIdAtArm: null,
        createdAtMs: Date.now(),
      },
      amrAuthRetryMountId: 'mount-fresh',
      amrAuthRetryWorkspaceIdentityKey:
        'workspace-a:personal:member-a:owner:active:active:true:true',
      onConsumeAmrAuthRetryContinuation: onConsume,
    });

    await observeStatus(signedIn);
    await observeStatus(signedIn);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-amr-auth' });
    // 第二次观测仍然会去问一次「还能兑现吗」,由 onConsume 说不,而不是靠 UI 记状态。
    expect(onConsume.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('waits for the current signed-in status to carry an account id', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    // 单发 —— App 那一侧的 `consumeAmrAuthRetryContinuation` 就是单发的:
    // 一份武装只能兑现一次。写成恒真会让「兑现了几次」这条判据失去意义。
    let available = true;
    const onConsume = vi.fn(() => {
      if (!available) return false;
      available = false;
      return true;
    });
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

    await observeStatus({ ...signedIn, user: null });

    expect(onConsume).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();

    await observeStatus(signedIn);

    expect(onConsume.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-amr-auth' });
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

  it('retries an unbound local project on the same mount only after signed-out -> signed-in', async () => {
    // 观测由 ChatPane 自己那条 500ms 轮询驱动(`observeStatus`),
    // 这一条要照的正是「哪几种观测**不足以**证明这次授权换了身份」。
    vi.useFakeTimers();
    const onRetry = vi.fn();
    // ⚠️ 武装那一半已随 pill 搬到 ProjectView(见文件抬头),所以这里直接把
    // 一份等价的 continuation 交给 pane,只测兑现侧的判据。
    const armed = {
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantId: 'msg-amr-auth',
      workspaceIdentityKey: 'none' as const,
      originMountId: 'mount-local',
    };
    let available = true;
    const onConsume = vi.fn(() => {
      if (!available) return false;
      available = false;
      return true;
    });
    const baseProps: Partial<ComponentProps<typeof ChatPane>> = {
      amrAuthRetryMountId: 'mount-local',
      amrAuthRetryWorkspaceIdentityKey: 'none',
      onConsumeAmrAuthRetryContinuation: onConsume,
    };
    const view = renderChat(onRetry, baseProps);

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
          ...armed,
          accountIdAtArm: null,
          createdAtMs: Date.now(),
        }}
      />,
    );

    // A signed-in poll by itself is not proof that this authorization attempt
    // changed identity, so it must not retry.
    await observeStatus(signedIn);
    expect(onRetry).not.toHaveBeenCalled();

    // A plain signed-out shell snapshot may predate this authorization attempt
    // and therefore cannot establish the transition either.
    await observeStatus(signedOut);
    await observeStatus(signedIn);
    expect(onRetry).not.toHaveBeenCalled();

    // Only a signed-out reading that this authorization attempt itself produced
    // (`loginInFlight`) witnesses the transition.
    await observeStatus({ ...signedOut, loginInFlight: true });
    await observeStatus(signedIn);
    await observeStatus(signedIn);

    expect(onConsume.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-amr-auth' });
  });

  it('does not retry while still signed out', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    renderChat(onRetry);

    await observeStatus({ ...signedOut, loginInFlight: true });

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not auto-retry when the shared AMR status already reports signed in', async () => {
    // Loop guard: when /status reports signed-in from the start (no signed-out
    // -> signed-in transition), a run that keeps failing AMR_AUTH_REQUIRED must
    // NOT auto-retry — otherwise each retry spawns a new run that fails again.
    vi.useFakeTimers();
    const onRetry = vi.fn();
    renderChat(onRetry);

    // Let the shared poll settle, then observe signed-in twice more.
    await observeStatus(signedIn);
    await observeStatus(signedIn);

    expect(onRetry).not.toHaveBeenCalled();
  });
});
