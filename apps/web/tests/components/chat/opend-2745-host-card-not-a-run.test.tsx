// @vitest-environment jsdom
/**
 * OPEND-2745 —「[ChatPanel][运行状态] 去掉记忆」
 *
 * ── 工单症状(QA,Beta 0.21.1-beta.7)────────────────────────────────
 * 用户提交后 ChatPanel 里**同时出现两个「进行中」**:上面是真实任务,下面又单独
 * 冒出来一条记忆消息;而且那条消息**把 `<od-card type="memory-applied">…</od-card>`
 * 的原文直接摊在屏幕上**。实际只有一次运行。
 *
 * ── 一个根因,两个症状 ──────────────────────────────────────────────
 * 记忆卡是宿主自己补发的一条助手消息(`ProjectView` 收到 `useMemoryWrittenCard`
 * 的批次后 `appendConversationMessage`),它**从来不是一次运行**:没有 runId、
 * 没有 runStatus、没有 startedAt / endedAt。
 *
 * 而 `ChatPane.isAssistantMessageStreaming` 的兜底是:
 *
 *     if (message.id !== lastAssistantId) return false;
 *     if (!paneStreaming) return false;
 *     if (message.endedAt !== undefined) return false;
 *     return true;                                   // ← 就是这一条
 *
 * 这条兜底本来是给**真运行的乐观占位**用的 —— API / BYOK 模式下
 * (`ProjectView.tsx:8142` 的 `runStatus: config.mode === 'daemon' ? 'running' : undefined`)
 * 那条占位消息确实既没有 runId 也没有 runStatus,全靠它显示流式。但它认的是
 * 「最后一条 + 面板在流」,**根本没问这条消息自己有没有过一次运行**。
 *
 * 于是:提取是在轮次结束**之后**才回报的(守护进程在子进程关闭时才排队),用户往往
 * 已经发出了下一轮 —— 记忆卡这时落进流水,成了「最后一条助手消息」,面板又正在流,
 * 它就被当成了那条正在跑的消息。接下来:
 *
 *  ① `AssistantMessage` 据此把 `turnRunStatus` 定成 `running`,画出执行记录壳
 *     (转球 + 一直往上走的秒表)—— 这就是**第二个「进行中」**,而且它没有 runId,
 *     永远不会结束;
 *  ② 运行中的正文归壳内(D43),而壳内那段叙述走的是 `ThinkingMarkdown`,
 *     **整条链上没有任何一处 `splitOnOdCards`** —— 于是 od-card 被当成纯 markdown
 *     文本渲染出来,标签原文就摊到了屏幕上。这就是**泄漏**。
 *
 * 所以泄漏不是「另一个 bug」,是①的直接后果:一旦这条消息不再被当成正在跑的运行,
 * 正文就回到壳外的普通 `prose-block`,`splitOnOdCards` → `OdCardView` 照常生效。
 *
 * ── 裁决 ──────────────────────────────────────────────────────────
 * 产品 2026-09-07:「**去修吧,先打补丁保证能正常运行,不要做大的重构**」。
 * 所以这里**不删卡、不删 `useMemoryWrittenCard`、不动消息编排、不动 daemon**,
 * 只在渲染层把判据补齐。卡本身是为 OPEND-2607 加的(一轮写进三条规则、库从 22
 * 涨到 25,而流水里什么都看不到),删了等于把 2607 重新打开。
 *
 * ── 反向锚点 ──────────────────────────────────────────────────────
 * 「没有 runId / runStatus 就不算在跑」这句话**不能**直接写成判据:API / BYOK 模式
 * 的真占位消息正是这个形状,写成那样会把那一档的流式指示整个关掉。区分它俩的是
 * **有没有 startedAt** —— 每条真占位都写了它(`ProjectView.tsx:8143`、
 * `DesignSystemFlow.tsx`、`workspace/useConversationChat.ts`),宿主补发的卡一条都没有。
 * 本文件最后一节就是那条反向锚点。
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
import { afterEach, describe, expect, it } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

/** 卡的正文走**产线那支**生成器,不手搓 —— 形状变了这条要跟着红。 */
const MEMORY_CARD = memoryWrittenCardContent(
  {
    key: 'ext-opend-2745',
    count: 2,
    entries: [
      { id: 'rule_shared_product_card', name: '商品卡做成共享组件', type: 'rule' },
      { id: 'rule_radius_12px', name: '圆角统一 12px', type: 'rule' },
    ],
  },
  'Remembered 2 preferences',
);

const userAsks = (id: string, at: number): ChatMessage => ({
  id, role: 'user', content: '再做一版', createdAt: at,
} as ChatMessage);

/** 用户刚发出去、正在跑的那一轮 —— 真实运行,有 runId 有 runStatus。 */
const liveTurn = (): ChatMessage => ({
  id: 'assistant-live-run',
  role: 'assistant',
  content: '在做了',
  events: [{ kind: 'text', text: '在做了' }],
  agentId: 'claude',
  agentName: 'Claude',
  runId: 'run-live',
  runStatus: 'running',
  createdAt: 1_700_000_010_000,
  startedAt: 1_700_000_010_000,
} as ChatMessage);

/**
 * 宿主补发的记忆卡,**照 `ProjectView.tsx:5494` 的写法**:
 * 有 content、有一条 text 事件、有 agent 身份,
 * 但没有 runId / runStatus / startedAt / endedAt。
 */
const hostMemoryCard = (): ChatMessage => ({
  id: 'assistant-memory-card',
  role: 'assistant',
  content: MEMORY_CARD,
  events: [{ kind: 'text', text: MEMORY_CARD }],
  agentId: 'claude',
  agentName: 'Claude',
  createdAt: 1_700_000_011_000,
} as ChatMessage);

function renderChat(messages: ChatMessage[], streaming: boolean) {
  return render(
    <ChatPane
      messages={messages}
      streaming={streaming}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />,
  );
}

function messageRow(id: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-assistant-message-id="${id}"]`);
  if (!row) throw new Error(`夹具里没有这条助手消息:${id} —— 先修夹具,别改断言`);
  return row;
}

/** 这条消息在屏幕上有没有「进行中」的样子(执行记录壳那颗转球)。 */
function looksRunning(id: string): boolean {
  return messageRow(id).querySelector('[data-orb]') !== null;
}

describe('OPEND-2745 宿主补发的记忆卡不是一次运行', () => {
  /*
   * 真机那一刻的形状:上一轮的提取回报晚到,而用户已经发出了下一轮。
   * 记忆卡因此成了「最后一条助手消息」,面板正在流。
   */
  const sequence = () => [
    userAsks('u-1', 1_700_000_000_000),
    liveTurn(),
    hostMemoryCard(),
  ];

  it('只有一个「进行中」—— 记忆卡不跟着面板一起转', () => {
    renderChat(sequence(), true);

    // 正向锚点:真跑的那一轮**确实**在转。少了它,下面那条可以因为
    // 「整个执行记录壳压根没渲染」而假绿。
    expect(looksRunning('assistant-live-run'), '真实运行没有显示进行中 —— 夹具坏了').toBe(true);

    expect(
      looksRunning('assistant-memory-card'),
      '记忆卡也画出了「进行中」,屏幕上同时有两个(OPEND-2745)',
    ).toBe(false);
  });

  it('记忆卡渲染成「已记住 N 条偏好」那张卡,而不是 od-card 标签原文', () => {
    renderChat(sequence(), true);

    const row = messageRow('assistant-memory-card');
    expect(
      row.querySelector('[data-od-card="memory-applied"]'),
      '记忆卡没走 OdCard 的渲染分支(OPEND-2745)',
    ).not.toBeNull();
    expect(
      row.textContent ?? '',
      'od-card 标签原文被摊给用户看了(OPEND-2745)',
    ).not.toContain('<od-card');
  });

  it('轮次跑完之后照旧 —— 这一条钉住修复没有把卡本身弄没(OPEND-2607)', () => {
    renderChat([
      userAsks('u-1', 1_700_000_000_000),
      { ...liveTurn(), runStatus: 'succeeded', endedAt: 1_700_000_012_000 } as ChatMessage,
      hostMemoryCard(),
    ], false);

    expect(
      document.querySelector('[data-od-card="memory-applied"]'),
      '记忆卡不见了 —— OPEND-2607 会跟着回来',
    ).not.toBeNull();
    expect(screen.getByText('Remembered 2 preferences')).toBeTruthy();
  });
});

describe('OPEND-2745 没跑过的消息不报运行终态', () => {
  it('宿主补发的卡不挂「已完成」——它没有一轮可以完成', () => {
    render(
      <AssistantMessage
        message={hostMemoryCard()}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast
      />,
    );
    // 卡还在(不是整块没渲染,那样断言会假绿)
    expect(document.querySelector('[data-od-card="memory-applied"]')).not.toBeNull();
    expect(
      screen.queryByText(en['assistant.doneLabel']),
      '一条从来没有跑过的消息挂着「已完成」,读起来就是又一轮(OPEND-2745)',
    ).toBeNull();
  });

  it('真跑完的那一轮照旧挂「已完成」—— 修复不许顺手把它一起关掉', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-real-turn',
          role: 'assistant',
          content: '做完了',
          events: [{ kind: 'text', text: '做完了' }],
          runId: 'run-1',
          runStatus: 'succeeded',
          createdAt: 1_700_000_000_000,
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_003_000,
        } as ChatMessage}
        streaming={false}
        projectId="project-1"
        conversationId="conv-1"
        isLast
      />,
    );
    expect(screen.getByText(en['assistant.doneLabel'])).toBeTruthy();
  });
});

/**
 * ⚠️ **反向锚点 —— 少了这一节,修复可以退化成「没有 runStatus 就不算在跑」,
 * 而那会把 API / BYOK 模式的流式指示整个关掉,且只看正向用例的套件全绿。**
 *
 * `ProjectView.tsx:8142` 逐字:`runStatus: config.mode === 'daemon' ? 'running' : undefined`。
 * 也就是说 API 模式下**真运行**的乐观占位消息同样没有 runId、没有 runStatus,
 * 它靠的正是 `isAssistantMessageStreaming` 那条兜底。它和宿主补发的卡唯一的区别
 * 是 **`startedAt`**:真占位写了,补发的卡没有。
 */
describe('API 模式真运行的乐观占位仍然显示流式', () => {
  it('没有 runId / runStatus,但有 startedAt —— 它是一次真的运行', () => {
    renderChat([
      userAsks('u-1', 1_700_000_000_000),
      {
        id: 'assistant-api-placeholder',
        role: 'assistant',
        content: '',
        events: [],
        agentId: 'openai',
        agentName: 'GPT',
        createdAt: 1_700_000_010_000,
        startedAt: 1_700_000_010_000,
      } as ChatMessage,
    ], true);

    expect(
      looksRunning('assistant-api-placeholder'),
      'API 模式的真运行不显示流式了 —— 修复收得太紧',
    ).toBe(true);
  });
});
