// @vitest-environment jsdom
//
// 红测:运行报错卡上**不再有「错误详情」折叠**(用户 2026-08-27「这个错误详情
// 先不要了,干掉吧」)。
//
// 卡上原来挂着两块:一颗 `run-error__source-toggle`(文案走 `brand.viewDetails`)
// 和它展开后的 `run-error__diagnostic` 原文块。两块一起下线。
//
// 这个文件里三条断言互为对照,缺一条都会让「没有折叠」变成空洞断言:
//   1. 折叠没了 —— 改之前红;
//   2. **同一张卡**照旧有标题、那句人话、〔联系支持〕、〔导出日志〕——
//      少了这条,整张卡没渲染时第 1 条照样绿;
//   3. `brand.viewDetails` 这个 key 在**插件建议卡**那一路仍然出现 ——
//      少了这条,把 key 连根删掉也照样绿。
import { cleanup, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

// 身份翻译:断言直接钉 key,既读得出「用的是哪条文案」,也让第 3 条对照
// 变成「这个 key 还在被消费」的直接证据。
const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
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
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 一段真实形状的上游原文。它以前会出现在折叠里的 `<pre>` 中。
const RAW_STDERR =
  'Error: spawn ENOENT\n    at ChildProcess._handle.onexit (node:internal/child_process:286:19)';

function failedMessage(): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work.',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: 'claude',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: RAW_STDERR,
        code: 'AGENT_EXECUTION_FAILED',
        stderrTail: 'deepseek-harness: EACCES /usr/local/bin/dsh',
      },
    ],
  } as ChatMessage;
}

function renderChat(message: ChatMessage) {
  return render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

function runErrorCard(container: HTMLElement): HTMLElement {
  const card = container.querySelector<HTMLElement>('[data-user-action-card="run-recovery"]');
  expect(card).toBeTruthy();
  return card!;
}

describe('报错卡:「错误详情」折叠已下线', () => {
  it('卡上没有〔查看详情〕折叠,也没有诊断原文块', () => {
    const { container } = renderChat(failedMessage());
    const card = runErrorCard(container);

    // 折叠的三件套:触发按钮、它的壳、以及展开后的原文块。
    expect(within(card).queryByRole('button', { name: 'brand.viewDetails' })).toBeNull();
    expect(card.querySelector('.run-error__source')).toBeNull();
    expect(card.querySelector('.run-error__source-toggle')).toBeNull();
    expect(card.querySelector('.run-error__diagnostic')).toBeNull();
    // 卡上不该再有任何折叠壳 —— 这张卡只剩「标题 + 人话 + 一排按钮」。
    expect(card.querySelector('.accordion-collapsible')).toBeNull();
    expect(card.querySelector('pre')).toBeNull();
  });

  it('上游原文一个字都不出现在卡上(折叠没了,不是被摊开了)', () => {
    const { container } = renderChat(failedMessage());
    const card = runErrorCard(container);

    expect(card.textContent).not.toContain('spawn ENOENT');
    expect(card.textContent).not.toContain('EACCES');
    expect(card.textContent).not.toContain('error_code');
  });

  // 正向对照:没有这一条,「找不到折叠」在整张卡压根没渲染时也会绿。
  it('同一张卡照旧有标题、那句人话、〔联系支持〕和〔导出日志〕', () => {
    const { container } = renderChat(failedMessage());
    const card = runErrorCard(container);

    expect(card.textContent).toContain('chat.runError.title.generic');

    const description = card.querySelector('[data-testid="chat-run-error-description"]');
    expect(description).toBeTruthy();
    expect(description!.textContent).toBe('chat.runError.fallbackMessage');

    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
  });
});

// 第二条正向对照:`brand.viewDetails` 是**共享 key**,报错卡只是它的消费者之一。
// 插件建议卡(`AssistantMessage` 里的 `SkillPluginCandidateCard`)照旧要有它。
describe('brand.viewDetails 的其他消费者没有被连带删掉', () => {
  it('插件建议卡上仍然有〔查看详情〕折叠', () => {
    const message = {
      id: 'msg-plugin',
      role: 'assistant',
      content: '',
      createdAt: 1,
      runStatus: 'succeeded',
      events: [
        {
          kind: 'plugin_candidate',
          candidateId: 'candidate-1',
          title: 'Design review helper',
          description: 'Turn this repository workflow into a reusable helper.',
        },
      ],
      producedFiles: [],
    } as unknown as ChatMessage;

    const { container } = render(
      <AssistantMessage message={message} streaming={false} projectId="proj-1" />,
    );

    const card = container.querySelector<HTMLElement>(
      '[data-user-action-card="plugin-suggestion"]',
    );
    expect(card).toBeTruthy();
    expect(within(card!).getByRole('button', { name: 'brand.viewDetails' })).toBeTruthy();
  });
});
