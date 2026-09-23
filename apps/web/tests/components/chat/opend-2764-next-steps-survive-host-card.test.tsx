// @vitest-environment jsdom
/**
 * OPEND-2764 —「[ChatPanel] PPT 生成成功且已产生 next_steps 事件,但下一步引导未展示」
 *
 * ── 工单症状(QA,Beta 0.21.1-beta.7)────────────────────────────────
 * PPT 已成功交付,运行事件里也确实有一条 `next_steps`(三条中文建议),但 ChatPanel
 * 一条下一步引导都没画。屏幕上成功消息之后只剩「已记住 N 条偏好」那张记忆卡和完成态。
 *
 * ── 根因:和 OPEND-2745 / OPEND-2644 同一处判据缺口 ──────────────────
 * 记忆卡是**宿主自己补发的一条助手消息**(`ProjectView` 拿到 `useMemoryWrittenCard`
 * 的批次后 `appendConversationMessage`,没有 runId / runStatus / startedAt / endedAt)。
 * 提取跑在轮次结束**之后**,所以它必然落在产物那条消息后面。
 *
 * 而下一步引导整块(可见性 `showNextStepActions`,以及 `suggestions` / `onSuggestion`
 * 两个 prop 的发放)都压在 `!!isLast` 上,`isLast` 又是 `ChatPane` 的
 * `lastAssistantId` ——**整条流水里最后一条 assistant 消息**。记忆卡一落,产物那条
 * 就不再是最后一条,三条建议被整块摘掉。
 *
 * 同一个形状已经被修过两次,都不是从 `isLast` 本身下手,而是把「最后一条」换成
 * 真正想问的那个问题:
 *  · OPEND-2644 —— 问卷可否作答,换成「用户有没有从这里走过去」(`nextUserContent`);
 *  · OPEND-2745 —— 要不要报运行态,换成「这条消息有没有过一次运行」
 *    (`assistantMessageNeverHadARun`)。
 * 这一条是第三次。判据一样:宿主补发的卡是**上一轮的附属组件,不是新的一轮**
 * (2745 的裁决原话),所以它不该改变「哪一轮是这条会话的当前落点」。
 *
 * ── 这份红测钉的是**平价**,不是「引导要一直在」────────────────────
 * ⚠️ 先说清楚基线,免得反向锚点钉成幻觉:今天**用户发了下一句话并不会**把上一轮
 * 的引导收走(`[user, deck, user2]` 实测仍然出),真正收走它的是**下一轮助手消息**。
 * 所以本单的不变量不是「什么时候出」,而是:
 *
 *     **插一条宿主补发的卡,不改变下一步引导出不出。**
 *
 * 两个方向都要钉:插了卡不该让引导消失(工单症状),也不该让引导从此赖着不走
 * (修复过头)。下面每一对用例就是同一个序列的「无卡 / 有卡」两版,断言两者相等。
 */

// jsdom 没有 HTMLElement.prototype.scrollTo —— ChatPane 的滚动逻辑会碰它。
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import type { AppConfig, ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

/** 工单里那一轮的三条建议(中文,PPT 精修方向)。 */
const SUGGESTIONS = [
  '把封面页换成深色底并加一张主视觉',
  '给每页补一条页脚页码',
  '把数据页的柱状图改成折线图',
];

/** 卡的正文走**产线那支**生成器,不手搓 —— 形状变了这条要跟着红。 */
const MEMORY_CARD = memoryWrittenCardContent(
  {
    key: 'ext-opend-2764',
    count: 1,
    entries: [{ id: 'rule_deck_dark_cover', name: '封面偏好深色', type: 'rule' }],
  },
  'Remembered 1 preference',
);

const userAsks = (id: string, at: number): ChatMessage =>
  ({ id, role: 'user', content: '做一份产品介绍 PPT', createdAt: at } as ChatMessage);

/**
 * 成功交付 PPT 的那一轮:真运行、succeeded、有产物,并且带着 daemon 下发的
 * `next_steps` 事件(工单里 events.jsonl 第 28068 条)。
 */
const deliveredDeckTurn = (): ChatMessage =>
  ({
    id: 'assistant-deck-run',
    role: 'assistant',
    content: '已经做好了。',
    agentId: 'claude',
    agentName: 'Claude',
    runId: 'run-deck',
    runStatus: 'succeeded',
    createdAt: 1_700_000_010_000,
    startedAt: 1_700_000_010_000,
    endedAt: 1_700_000_090_000,
    producedFiles: [
      {
        name: 'deck.html',
        path: 'deck.html',
        size: 4096,
        mtime: 1_700_000_090_000,
        kind: 'html',
        mime: 'text/html',
      },
    ],
    events: [
      { kind: 'text', text: '已经做好了。' },
      { kind: 'next_steps', suggestions: SUGGESTIONS },
    ],
  } as ChatMessage);

/**
 * 宿主补发的记忆卡,**照 `ProjectView.tsx` 的写法**:有 content、有一条 text 事件、
 * 有 agent 身份,但没有 runId / runStatus / startedAt / endedAt。
 */
const hostMemoryCard = (): ChatMessage =>
  ({
    id: 'assistant-memory-card',
    role: 'assistant',
    content: MEMORY_CARD,
    events: [{ kind: 'text', text: MEMORY_CARD }],
    agentId: 'claude',
    agentName: 'Claude',
    createdAt: 1_700_000_095_000,
  } as ChatMessage);

/** 记忆卡之后用户又发起、并且真的跑完的下一轮。 */
const secondTurn = (): ChatMessage =>
  ({
    id: 'assistant-second-run',
    role: 'assistant',
    content: '改好了。',
    agentId: 'claude',
    agentName: 'Claude',
    runId: 'run-2',
    runStatus: 'succeeded',
    createdAt: 1_700_000_110_000,
    startedAt: 1_700_000_110_000,
    endedAt: 1_700_000_120_000,
    events: [{ kind: 'text', text: '改好了。' }],
  } as ChatMessage);

function renderChat(messages: ChatMessage[]) {
  return render(
    <ChatPane
      messages={messages}
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

/** 产物那一轮下面此刻挂没挂着三条建议。 */
function deckShowsSuggestions(): boolean {
  const row = document.querySelector<HTMLElement>(
    '[data-assistant-message-id="assistant-deck-run"]',
  );
  if (!row) throw new Error('夹具里没有产物那条消息 —— 先修夹具,别改断言');
  return row.querySelector('[data-testid="next-step-suggestions"]') !== null;
}

/**
 * 同一个序列跑两遍:一遍不插宿主卡,一遍插。返回两次「引导出没出」。
 *
 * 断言写成两者**相等**,而不是各自等于某个写死的真假值 —— 这样基线以后怎么变
 * (产品改「什么时候出引导」的规则),这条不变量都还站得住:宿主卡必须是透明的。
 */
function withAndWithoutHostCard(
  before: ChatMessage[],
  after: ChatMessage[],
): { without: boolean; with_: boolean } {
  renderChat([...before, ...after]);
  const without = deckShowsSuggestions();
  cleanup();

  renderChat([...before, hostMemoryCard(), ...after]);
  const with_ = deckShowsSuggestions();
  cleanup();

  return { without, with_ };
}

describe('OPEND-2764 宿主补发的记忆卡不该改变下一步引导的去留', () => {
  it('正向锚点:产物交付成功、带 next_steps —— 引导本来就该出', () => {
    renderChat([userAsks('u-1', 1_700_000_000_000), deliveredDeckTurn()]);

    expect(deckShowsSuggestions(), '夹具坏了 —— 连基线都不出引导,下面几条会假绿').toBe(true);
    expect(screen.getByTestId('next-step-suggestion-0').textContent).toContain(SUGGESTIONS[0]!);
  });

  it('刚交付完 —— 插不插记忆卡,引导都在(工单症状)', () => {
    const { without, with_ } = withAndWithoutHostCard(
      [userAsks('u-1', 1_700_000_000_000), deliveredDeckTurn()],
      [],
    );

    expect(without, '基线自己就不出引导 —— 夹具坏了').toBe(true);
    expect(
      with_,
      '产物交付成功、next_steps 事件也在,宿主补发的记忆卡把三条引导挤没了(OPEND-2764)',
    ).toBe(without);
  });

  it('记忆卡自己不认领引导 —— 它没有产物也没有建议', () => {
    renderChat([
      userAsks('u-1', 1_700_000_000_000),
      deliveredDeckTurn(),
      hostMemoryCard(),
    ]);

    // 卡确实渲染了(否则下面这条会因为「整条消息没画」而假绿)
    expect(
      document.querySelector('[data-od-card="memory-applied"]'),
      '夹具坏了 —— 记忆卡根本没渲染',
    ).not.toBeNull();

    const cardRow = document.querySelector<HTMLElement>(
      '[data-assistant-message-id="assistant-memory-card"]',
    );
    expect(
      cardRow!.querySelector('[data-testid="next-step-suggestions"]'),
      '引导跑到记忆卡那条消息上去了',
    ).toBeNull();
  });
});

/**
 * ⚠️ **反向锚点 —— 少了这一节,修复可以退化成「引导一旦出现就永远赖着」,
 * 而只看正向用例的套件会全绿。**
 *
 * 真正把上一轮的引导收走的是**下一轮助手消息**(基线实测:`[user, deck, user2]`
 * 仍然出引导,`[user, deck, user2, secondRun]` 才收走)。宿主卡不许干扰这一条 ——
 * 两个方向都不许:既不能提前收走,也不能拦住该收的时候。
 */
describe('OPEND-2764 下一轮落地之后,旧那一轮照旧要收起来', () => {
  it('后面又跑了真的一轮 —— 插不插记忆卡,旧那一轮的引导都收走', () => {
    const { without, with_ } = withAndWithoutHostCard(
      [userAsks('u-1', 1_700_000_000_000), deliveredDeckTurn()],
      [userAsks('u-2', 1_700_000_100_000), secondTurn()],
    );

    expect(without, '基线里下一轮没能收走旧引导 —— 夹具坏了').toBe(false);
    expect(
      with_,
      '修复把引导变成粘的了:下一轮已经落地,旧那一轮还挂着三条引导',
    ).toBe(without);
  });

  it('用户只发了下一句、助手还没回 —— 插不插记忆卡,行为一致', () => {
    const { without, with_ } = withAndWithoutHostCard(
      [userAsks('u-1', 1_700_000_000_000), deliveredDeckTurn()],
      [userAsks('u-2', 1_700_000_100_000)],
    );

    expect(
      with_,
      '宿主卡改变了「用户刚发出下一句」这一档的引导去留 —— 它应该是透明的',
    ).toBe(without);
  });
});
