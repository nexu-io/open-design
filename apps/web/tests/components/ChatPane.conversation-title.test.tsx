// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { trackRunFailedToastSurfaceView } from '../../src/analytics/events';
import type { RunFailureDetail } from '@open-design/contracts';
import type { AppConfig, ChatMessage, Conversation } from '../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  const localized: Record<string, string> = {
    'chat.conversationsSearchPlaceholder': 'Rechercher des conversations',
    'chat.conversationsNoMatches': 'Aucune conversation correspondante.',
  };
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return localized[key] ?? key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'fr', setLocale: () => undefined, t: translate }),
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

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Session rename was removed by design — chats are not renamed. These tests
// cover what the session switcher does keep: the icon-only history trigger
// opens a menu listing conversations, and selecting / deleting one calls back.
describe('ChatPane session switcher', () => {
  it('opens the conversation history menu from the icon trigger', () => {
    renderChatPane({
      conversations: [
        conversation({ id: 'conv-1', title: 'Contract review draft' }),
        conversation({ id: 'conv-2', title: 'Pricing page copy' }),
      ],
      activeConversationId: 'conv-1',
    });

    expect(screen.queryByTestId('conversation-history-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    expect(screen.getByTestId('conversation-history-menu')).toBeTruthy();
    expect(screen.getByTestId('conversation-select-conv-1').textContent).toBe('Contract review draft');
    expect(screen.getByTestId('conversation-select-conv-2').textContent).toBe('Pricing page copy');
  });

  it('localizes conversation search and its no-match state', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    const search = screen.getByPlaceholderText('Rechercher des conversations');
    fireEvent.change(search, { target: { value: 'aucun résultat' } });

    expect(screen.getByText('Aucune conversation correspondante.')).toBeTruthy();
  });

  it('selects a conversation from the history menu', () => {
    const onSelectConversation = vi.fn();
    renderChatPane({
      conversations: [
        conversation({ id: 'conv-1', title: 'Contract review draft' }),
        conversation({ id: 'conv-2', title: 'Pricing page copy' }),
      ],
      activeConversationId: 'conv-1',
      onSelectConversation,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-2'));

    expect(onSelectConversation).toHaveBeenCalledTimes(1);
    expect(onSelectConversation).toHaveBeenCalledWith('conv-2');
  });

  it('selects a conversation when its row metadata is clicked', () => {
    const onSelectConversation = vi.fn();
    renderChatPane({
      conversations: [
        conversation({ id: 'conv-1', title: 'Contract review draft' }),
        conversation({ id: 'conv-2', title: 'Pricing page copy', messageCount: 2 }),
      ],
      activeConversationId: 'conv-1',
      onSelectConversation,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    fireEvent.click(screen.getByTestId('conversation-meta-conv-2'));

    expect(onSelectConversation).toHaveBeenCalledTimes(1);
    expect(onSelectConversation).toHaveBeenCalledWith('conv-2');
    expect(screen.queryByTestId('conversation-history-menu')).toBeNull();
  });

  it('shows an untitled label for conversations without a title', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: null })],
      activeConversationId: 'conv-1',
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    expect(screen.getByTestId('conversation-select-conv-1').textContent).toBe('chat.untitledConversation');
  });

  it('does not expose any inline rename affordance', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    // The select button is a plain selector now — no rename input is rendered.
    expect(screen.queryByTestId('chat-active-conversation-rename-input')).toBeNull();
    expect(screen.queryByDisplayValue('Contract review draft')).toBeNull();
  });

  // 原来这一条钉的是 `AMR_INSUFFICIENT_BALANCE`。用户 2026-09-02 裁决之后,
  // 钱的事只剩升级卡一张,余额那条失败**不再画报错卡** —— 而这个 surface_view
  // 埋的正是「报错卡露出来了」,所以它跟着卡一起走了(见下一条断言)。
  // 埋点契约本身还要有人守,换一条同样走 AMR、同样出卡的失败(登录失效)来守。
  it('tracks run_failed_toast exposure for AMR sign-in guidance', async () => {
    render(
      <ChatPane
        messages={[
          failedAssistantMessage({
            id: 'msg-amr-auth',
            runId: 'run-amr-auth',
            code: 'AMR_AUTH_REQUIRED',
            agentId: 'amr',
          }),
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectKindForTracking="prototype"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        conversations={[conversation({ id: 'conv-1', title: 'Current' })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await waitFor(() => expect(trackRunFailedToastSurfaceView).toHaveBeenCalledTimes(1));
    expect(vi.mocked(trackRunFailedToastSurfaceView).mock.calls[0]![1]).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: 'AMR_AUTH_REQUIRED',
      project_id: 'project-1',
      project_kind: 'prototype',
      conversation_id: 'conv-1',
      assistant_message_id: 'msg-amr-auth',
      run_id: 'run-amr-auth',
    });
  });

  // 上一条的另一半:余额那条失败**故意**不再报这个 surface_view。
  // 写出来是为了让这次口径变化有据可查 —— 埋点少了一条不能只在数据看板上发现。
  it('no longer reports a run_failed_toast for the balance failure — the card is gone', async () => {
    render(
      <ChatPane
        messages={[
          failedAssistantMessage({
            id: 'msg-amr-balance',
            runId: 'run-amr-balance',
            code: 'AMR_INSUFFICIENT_BALANCE',
            agentId: 'amr',
          }),
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectKindForTracking="prototype"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        conversations={[conversation({ id: 'conv-1', title: 'Current' })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('chat-log')).toBeTruthy());
    expect(trackRunFailedToastSurfaceView).not.toHaveBeenCalled();
  });

  // 同上:这颗〔去充值〕原来钉在 `AMR_INSUFFICIENT_BALANCE` 上,现在那一档整张卡
  // 都不画了。深链本身(profile 作用域的控制台地址)仍然是产品行为,由另一条同样
  // 走「充值」主动作的失败来守 —— 工作区额度用尽。
  it('opens the profile-scoped console from the AMR recharge action', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <ChatPane
        messages={[
          failedAssistantMessage({
            id: 'msg-amr-credits',
            runId: 'run-amr-credits',
            failureDetail: 'workspace_credits_exhausted',
            agentId: 'amr',
          }),
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        conversations={[conversation({ id: 'conv-1', title: 'Current' })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } } } as unknown as AppConfig}
      />,
    );

    const rechargeAction = screen.getByText('chat.amrError.rechargeCta');
    const retryAction = screen.getByText('promptTemplates.retry');
    expect(rechargeAction.parentElement).toBe(retryAction.parentElement);
    expect(
      rechargeAction.parentElement?.closest('[data-user-action-footer="true"]'),
    ).toBeTruthy();

    fireEvent.click(rechargeAction);

    const [consoleUrl, target, features] = openSpy.mock.calls[0] ?? [];
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
    const parsedConsoleUrl = new URL(String(consoleUrl));
    // Top-up reports on the console dashboard now, not a wallet page.
    expect(`${parsedConsoleUrl.origin}${parsedConsoleUrl.pathname}`).toBe(
      'https://vela.powerformer.net/dashboard',
    );
    // The plain top-up entry must NOT carry the upgrade intent — it opens the
    // console to add credit, not the plan catalog.
    expect(parsedConsoleUrl.searchParams.get('billing')).toBeNull();
    expect(parsedConsoleUrl.searchParams.get('od_entry_source')).toBe('chat_error_recharge');
  });

  it('opens public Pricing from the AMR tier upgrade action', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <ChatPane
        messages={[
          failedAssistantMessage({
            id: 'msg-amr-upgrade',
            runId: 'run-amr-upgrade',
            code: 'AMR_TIER_UPGRADE_REQUIRED',
            agentId: 'amr',
          }),
        ]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        conversations={[conversation({ id: 'conv-1', title: 'Current' })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } } } as unknown as AppConfig}
      />,
    );

    fireEvent.click(screen.getByText('chat.amrBalanceGate.plansCta'));

    const [plansUrl, target, features] = openSpy.mock.calls[0] ?? [];
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
    const parsedPlansUrl = new URL(String(plansUrl));
    expect(`${parsedPlansUrl.origin}${parsedPlansUrl.pathname}`).toBe(
      'https://open-design.ai/pricing/',
    );
    expect(parsedPlansUrl.searchParams.get('billing')).toBeNull();
    expect(parsedPlansUrl.searchParams.get('od_entry_source')).toBe('chat_error_upgrade');
  });
});

function renderChatPane(props: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
}) {
  return render(chatPaneElement(props));
}

function chatPaneElement({
  conversations,
  activeConversationId,
  onSelectConversation,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
}) {
  return (
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId={activeConversationId}
      onSelectConversation={onSelectConversation ?? vi.fn()}
      onDeleteConversation={vi.fn()}
    />
  );
}

function conversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    projectId: 'project-1',
    title: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function failedAssistantMessage({
  id,
  runId,
  code,
  failureDetail,
  agentId,
}: {
  id: string;
  runId: string;
  code?: string;
  // 契约上这一格是封闭集合而不是自由字符串,夹具跟着走 —— 写成 string
  // 的话拼错一个原因名不会有人发现,而这个文件的断言正是按原因分档的。
  failureDetail?: RunFailureDetail;
  agentId: string;
}): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId,
    runStatus: 'failed',
    agentId,
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'AMR balance empty',
        ...(code ? { code } : {}),
        ...(failureDetail ? { failureDetail } : {}),
      },
    ],
  };
}
