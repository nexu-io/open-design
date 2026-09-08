// @vitest-environment jsdom
//
// 红测(**T61**):**升级卡是「那一轮的凭据」,不是「当前余额的读数」。**
//
// 产品口述 2026-09-07,逐字:「这个额度小于 <2 的卡片,应该只有一轮会话结束才
// 出现,不要在运行中出现。然后第一轮结束后出现这个卡片,就固定在那了,第二轮运行
// 期间卡片不能移动到第二轮下面,除非第二轮结束后,余额还是不足,那就显示第二个
// 卡片。这个卡片在轮次后最好能固定一下,它就好像历史记录一样,存档在当时状态了,
// 不能说我干个啥把当时的失败态搞丢了,我往回看那一轮为啥失败了根本没有依据和
// 想不起来啊」。
//
// 拆成四条:
//   ① 只在一轮结束后出现,运行中不出现
//   ② 出现后锚定在那一轮下面,不随新一轮移动
//   ③ 第二轮结束后余额仍不足 → 另出一张新的(不是把旧的挪下来)
//   ④ 它是那一刻的存档,值不随后续余额变化而改写
//
// 断言的是**渲染出来的东西**:从真实的 `<ChatPane>` 出发,给它产品真实会给的
// props,数 DOM 里有几张卡、各自坐在谁下面、上面写的是多少钱。
//
// ⚠️ 「一轮结束」的判据是 **daemon 给出的终态**,三种都算:`succeeded` /
// `failed` / `canceled`。只认「成功完成」会把「跑挂了」和「被用户按停」这两种
// 最需要留凭据的收尾漏掉 —— 那恰恰是产品说的「往回看那一轮为啥失败了」。
//
// ⚠️ 与 2026-09-02 那条不矛盾:那条说的是**同一时刻同一档不要两块 UI**
// (`w62-mid-run-balance-card.test.tsx` 守着),本页说的是**不同轮次各自一张**。

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** 一条助手消息 = 一轮。`runStatus` 就是这一轮此刻的收尾状态。 */
function turn(id: string, runStatus: ChatMessage['runStatus']): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: `turn ${id}`,
    createdAt: 1,
    runId: `run-${id}`,
    runStatus,
    agentId: 'amr',
    events: [],
    ...(runStatus === 'succeeded' || runStatus === 'failed' || runStatus === 'canceled'
      ? { endedAt: 2 }
      : {}),
  } as ChatMessage;
}

function renderChat(opts: {
  messages?: ChatMessage[];
  amrBalanceCardUsd?: number | null;
  amrBalanceCardAnchorMessageId?: string | null;
}) {
  const view = render(<Pane {...opts} />);
  return {
    ...view,
    rerender: (next: typeof opts) => view.rerender(<Pane {...next} />),
  };
}

function Pane(opts: {
  messages?: ChatMessage[];
  amrBalanceCardUsd?: number | null;
  amrBalanceCardAnchorMessageId?: string | null;
}) {
  return (
    <ChatPane
      messages={opts.messages ?? []}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      amrBalanceCardUsd={opts.amrBalanceCardUsd ?? null}
      amrBalanceCardAnchorMessageId={opts.amrBalanceCardAnchorMessageId ?? null}
      onOpenSettings={vi.fn() as never}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />
  );
}

function cards(): HTMLElement[] {
  return screen.queryAllByTestId('chat-upgrade-card');
}

/** `b` 在文档里排在 `a` 后面。用原生的位序比较,不靠 innerHTML 里找子串。 */
function comesAfter(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('T61 ① 运行中不出现', () => {
  it('锚点那一轮还在跑:读数已经有了,也一张卡都不画', () => {
    renderChat({
      messages: [turn('a1', 'running')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });

    expect(cards()).toHaveLength(0);
  });

  it('锚点那一轮还在排队:同样不画', () => {
    renderChat({
      messages: [turn('a1', 'queued')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });

    expect(cards()).toHaveLength(0);
  });
});

describe('T61 ① 轮次结束后出现 —— 三种终态都算结束', () => {
  it.each([
    ['succeeded' as const],
    ['failed' as const],
    ['canceled' as const],
  ])('%s 也是「这一轮结束了」', (status) => {
    const { rerender } = renderChat({
      messages: [turn('a1', 'running')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    expect(cards()).toHaveLength(0);

    rerender({
      messages: [turn('a1', status)],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });

    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.textContent).toContain('$1.50');
  });
});

describe('T61 ② 锚定在那一轮下面,不随新一轮移动', () => {
  it('卡坐在锚点那一轮下面,而不是整条流水的末尾', () => {
    const { rerender } = renderChat({
      messages: [turn('a1', 'running')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    rerender({
      messages: [turn('a1', 'succeeded')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });

    // 第二轮起跑:锚点换人,读数换成第二轮那次闸门读到的。
    rerender({
      messages: [turn('a1', 'succeeded'), turn('a2', 'running')],
      amrBalanceCardUsd: 1.2,
      amrBalanceCardAnchorMessageId: 'a2',
    });

    // 第二轮还在跑 —— 仍然只有第一轮那一张。
    expect(cards()).toHaveLength(1);
    // 且它**在第二轮上面**:没有被挪到第二轮下面去。
    expect(comesAfter(cards()[0]!, screen.getByTestId('assistant-a2'))).toBe(true);
    expect(comesAfter(screen.getByTestId('assistant-a1'), cards()[0]!)).toBe(true);
  });
});

describe('T61 ③ 第二轮结束仍不足:再出一张新的', () => {
  it('两轮各一张,不是把旧的挪下来', () => {
    const { rerender } = renderChat({
      messages: [turn('a1', 'running')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    rerender({
      messages: [turn('a1', 'succeeded')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    rerender({
      messages: [turn('a1', 'succeeded'), turn('a2', 'running')],
      amrBalanceCardUsd: 1.2,
      amrBalanceCardAnchorMessageId: 'a2',
    });
    rerender({
      messages: [turn('a1', 'succeeded'), turn('a2', 'succeeded')],
      amrBalanceCardUsd: 1.2,
      amrBalanceCardAnchorMessageId: 'a2',
    });

    const shown = cards();
    expect(shown).toHaveLength(2);
    // 顺序 = 轮次顺序,各自坐在自己那一轮下面。
    expect(shown[0]!.textContent).toContain('$1.50');
    expect(shown[1]!.textContent).toContain('$1.20');
    expect(comesAfter(shown[0]!, screen.getByTestId('assistant-a2'))).toBe(true);
    expect(comesAfter(screen.getByTestId('assistant-a2'), shown[1]!)).toBe(true);
  });
});

describe('T61 ④ 存档:值不随后续余额变化而改写', () => {
  it('后来余额涨了(读数换了)也不改写第一轮那张卡的数字', () => {
    const { rerender } = renderChat({
      messages: [turn('a1', 'running')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    rerender({
      messages: [turn('a1', 'succeeded')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    // 第二轮的闸门读到 $0.40 —— 那是第二轮的事,和第一轮那张卡无关。
    rerender({
      messages: [turn('a1', 'succeeded'), turn('a2', 'running')],
      amrBalanceCardUsd: 0.4,
      amrBalanceCardAnchorMessageId: 'a2',
    });

    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.textContent).toContain('$1.50');
  });

  it('余额恢复到放行档(读数清空)之后,历史那张卡仍在 —— 失败态不许被抹掉', () => {
    const { rerender } = renderChat({
      messages: [turn('a1', 'running')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    rerender({
      messages: [turn('a1', 'succeeded')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });
    // 充值之后再发一轮:闸门放行,读数被撤掉。
    rerender({
      messages: [turn('a1', 'succeeded'), turn('a2', 'succeeded')],
      amrBalanceCardUsd: null,
      amrBalanceCardAnchorMessageId: null,
    });

    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.textContent).toContain('$1.50');
    expect(comesAfter(cards()[0]!, screen.getByTestId('assistant-a2'))).toBe(true);
  });
});

describe('T61 · 没有轮次可锚的那一档仍然落在流水末尾', () => {
  /*
   * 拦截档(`gate.kind === 'hard'`)会把已经画出去的那一轮**收回**
   * (`ProjectView.retractPaintedTurn`)—— 没有 run,也就没有轮次可锚。
   * 这一档保持原样:读数直接摆在流水末尾。既有用例
   * (`ChatPane.wired-cards.test.tsx` / `w62-mid-run-balance-card.test.tsx`)
   * 守的就是这条路,本页顺带钉一次,免得改锚定时把它一起改掉。
   */
  it('没有锚点时,读数照旧画在流水末尾', () => {
    renderChat({
      messages: [turn('a1', 'succeeded')],
      amrBalanceCardUsd: 0,
      amrBalanceCardAnchorMessageId: null,
    });

    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.getAttribute('data-out')).toBe('true');
    expect(comesAfter(screen.getByTestId('assistant-a1'), cards()[0]!)).toBe(true);
  });

  it('锚点那条消息不在这条会话里(切走了)时,不画', () => {
    renderChat({
      messages: [turn('b1', 'succeeded')],
      amrBalanceCardUsd: 1.5,
      amrBalanceCardAnchorMessageId: 'a1',
    });

    expect(cards()).toHaveLength(0);
  });
});
