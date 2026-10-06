// @vitest-environment jsdom
/**
 * 一轮失败之后落下一张宿主补发的卡,〔重试〕不许跟着消失。
 *
 * ── 缺口 ──────────────────────────────────────────────────────────
 * `ChatPane.retryableAssistantMessage` 拿的是**转录的物理队尾**当锚点:
 *
 *     const last = messages[messages.length - 1];
 *     if (!last || last.role !== 'assistant') return null;
 *     if (last.id !== lastAssistantId) return null;
 *     return isRetryableAssistantTerminalFailure(last) ? last : null;
 *
 * 而宿主会在一轮之后**自己往流水里补一条 assistant 消息**:记忆卡
 * (`ProjectView` 的 `useMemoryWrittenCard` 批次)和品牌浏览器协助卡
 * (`brandBrowserAssist`)都走 `appendConversationMessage(...role: 'assistant'...)`,
 * `randomUUID()` 起 id,**没有** runId / runStatus / startedAt / endedAt。
 * 记忆提取更是守护进程在子进程关闭**之后**才排队的,所以它几乎总是落在刚结束的
 * 那一轮后面 —— 包括**刚失败**的那一轮。
 *
 * 卡一落地,队尾就不是那条失败消息了:`isRetryableAssistantTerminalFailure(卡)`
 * 为假 → `retryAssistant` 为 null → 整条恢复链全塌:
 * `runFailureUi`、`runFailureHasAction`、〔重试〕/〔续跑〕、以及
 * `errorCardOwnerId` 全部落空。**那一轮失败了,但用户点不到重试。**
 *
 * ── 判据 ──────────────────────────────────────────────────────────
 * 锚点仍然是队尾,只是**宿主补发的卡对它是透明的** —— 判据与先例都写在
 * `assistantMessageNeverHadARun` / `lastAssistantTurnId`。
 *
 * ⚠️ 这**不会**让〔重试〕变粘:用户发出下一句、或下一轮真的跑起来,锚点照旧
 * 移走。透明的只有宿主卡这一类,别的都拦得住。
 *
 * ⚠️ 邻居 `ChatPane.error-card-raw-text-never-rendered.test.tsx` 里那条
 * 「失败轮不在最后时本来就没有,改完仍然没有」钉的正是这里的**缺陷现状**
 * (它那一版只管原文不上卡面,把入口消失留在了范围外)。本文件把它翻成不变量,
 * 那条随之改写。
 */
import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/** 没人认领的码 —— 走 `resolveRunFailureUi` 末尾那张通用卡,主动作是〔重试〕。 */
const UNMAPPED_CODE = 'AGENT_EXIT_130';
const RAW_DETAIL = 'json-rpc id 4: opencode event stream: context deadline exceeded';

const failedTurn = (): ChatMessage => ({
  id: 'msg-failed',
  role: 'assistant',
  content: '',
  createdAt: 1_700_000_010_000,
  startedAt: 1_700_000_010_000,
  endedAt: 1_700_000_011_000,
  runId: 'run-1',
  runStatus: 'failed',
  agentId: 'amr',
  events: [{ kind: 'status', label: 'error', detail: RAW_DETAIL, code: UNMAPPED_CODE }],
} as unknown as ChatMessage);

/** 卡的正文走**产线那支**生成器,不手搓 —— 形状变了这条要跟着红。 */
const MEMORY_CARD = memoryWrittenCardContent(
  {
    key: 'ext-retry-tail',
    count: 1,
    entries: [{ id: 'rule_radius_12px', name: '圆角统一 12px', type: 'rule' }],
  },
  'Remembered 1 preference',
);

/**
 * 宿主在失败之后自己补发的那条助手消息。两种卡同一个形状,这里各造一张:
 * 记忆卡走产线生成器,品牌协助卡照 `ProjectView` 的 `brandBrowserAssist` 逐字。
 */
const hostMemoryCard = (): ChatMessage => ({
  id: 'msg-host-memory-card',
  role: 'assistant',
  content: MEMORY_CARD,
  createdAt: 1_700_000_012_000,
  agentId: 'amr',
  events: [{ kind: 'text', text: MEMORY_CARD }],
} as unknown as ChatMessage);

const hostBrandAssistCard = (): ChatMessage => ({
  id: 'msg-host-brand-card',
  role: 'assistant',
  content: 'chat.brandBrowserAssistMessage\n\n<od-card type="brand-browser-assist">{}</od-card>',
  createdAt: 1_700_000_012_000,
  agentId: 'amr',
  events: [{ kind: 'text', text: 'chat.brandBrowserAssistMessage' }],
} as unknown as ChatMessage);

const userAsks = (id: string, at: number): ChatMessage => ({
  id, role: 'user', content: '再做一版', createdAt: at,
} as unknown as ChatMessage);

/** 一条真跑过、跑成功的下一轮 —— 用来证明锚点照旧会被真的下一轮收走。 */
const succeededTurn = (): ChatMessage => ({
  id: 'msg-next-turn',
  role: 'assistant',
  content: '做完了',
  createdAt: 1_700_000_014_000,
  startedAt: 1_700_000_014_000,
  endedAt: 1_700_000_015_000,
  runId: 'run-2',
  runStatus: 'succeeded',
  agentId: 'amr',
  events: [{ kind: 'text', text: '做完了' }],
} as unknown as ChatMessage);

function renderChat(messages: ChatMessage[]) {
  return render(
    <ChatPane
      messages={messages}
      streaming={false}
      error={RAW_DETAIL}
      errorSourceAssistantId="msg-failed"
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
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

const retryButton = (container: HTMLElement) =>
  container.querySelector('[data-testid="chat-error-retry"]');

describe('量法自检:这套夹具确实画得出〔重试〕', () => {
  it('失败轮就是队尾时,〔重试〕在场', () => {
    const { container } = renderChat([userAsks('u-1', 1_700_000_000_000), failedTurn()]);
    expect(
      retryButton(container),
      '夹具本身就画不出〔重试〕—— 下面每一条都会假绿,先修夹具',
    ).not.toBeNull();
  });
});

describe('宿主补发的卡不许把〔重试〕挤掉', () => {
  it('记忆卡落在失败轮后面,〔重试〕仍然在', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      failedTurn(),
      hostMemoryCard(),
    ]);
    expect(
      retryButton(container),
      '晚到的记忆卡顶掉了队尾,那一轮失败了但用户点不到〔重试〕',
    ).not.toBeNull();
  });

  it('品牌协助卡也一样 —— 判据认的是「这条消息有没有跑过」,不是它是哪张卡', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      failedTurn(),
      hostBrandAssistCard(),
    ]);
    expect(retryButton(container), '品牌协助卡顶掉了队尾,〔重试〕消失').not.toBeNull();
  });

  it('连着落两张宿主卡也一样', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      failedTurn(),
      hostMemoryCard(),
      hostBrandAssistCard(),
    ]);
    expect(retryButton(container), '两张宿主卡叠在队尾,〔重试〕消失').not.toBeNull();
  });
});

describe('反向:入口不许变粘', () => {
  it('宿主卡后面已经有真的下一轮时,〔重试〕收走', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      failedTurn(),
      hostMemoryCard(),
      userAsks('u-2', 1_700_000_013_000),
      succeededTurn(),
    ]);
    expect(
      retryButton(container),
      '下一轮已经跑成功了,上一轮的〔重试〕还挂着 —— 判据放得太松',
    ).toBeNull();
  });

  it('用户已经发出下一句(还没有助手消息)时,〔重试〕收走', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      failedTurn(),
      hostMemoryCard(),
      userAsks('u-2', 1_700_000_013_000),
    ]);
    expect(
      retryButton(container),
      '用户已经走过去了,〔重试〕还挂着 —— 宿主卡透明不等于用户消息也透明',
    ).toBeNull();
  });

  it('整条会话只有宿主卡时,没有哪一轮可以重试', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      hostMemoryCard(),
    ]);
    expect(retryButton(container), '一轮都没跑过,却给出了〔重试〕').toBeNull();
  });

  it('队尾那一轮跑成功了,宿主卡后面也不该冒出〔重试〕', () => {
    const { container } = renderChat([
      userAsks('u-1', 1_700_000_000_000),
      succeededTurn(),
      hostMemoryCard(),
    ]);
    expect(retryButton(container), '成功的一轮被判成了可重试的失败').toBeNull();
  });
});
