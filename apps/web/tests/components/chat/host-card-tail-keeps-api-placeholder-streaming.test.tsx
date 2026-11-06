// @vitest-environment jsdom
/**
 * API / BYOK 模式的流式指示,不许被宿主补发的卡从后面顶掉。
 *
 * ── 缺口 ──────────────────────────────────────────────────────────
 * `ChatPane.isAssistantMessageStreaming` 的最后一段兜底:
 *
 *     if (assistantMessageNeverHadARun(message)) return false;   // OPEND-2745
 *     if (message.id !== lastAssistantId) return false;          // ← 这一条
 *     if (!paneStreaming) return false;
 *     if (message.endedAt !== undefined) return false;
 *     return true;
 *
 * 这条兜底是 **API / BYOK 模式真占位唯一的流式来源**:那一档的真运行既没有 runId
 * 也没有 runStatus(`ProjectView.tsx` 建占位时写的是
 * `runStatus: config.mode === 'daemon' ? 'running' : undefined`),前面
 * `isActiveRunStatus(message.runStatus)` 那一关它一关都过不去,全靠这条兜底把面板级的
 * 「有一次运行正在跑」投影到自己身上。
 *
 * 而 `lastAssistantId` 认的是**流水里最后一条 assistant 消息,宿主卡也算**。记忆卡
 * (`useMemoryWrittenCard`)的提取是守护进程在子进程关闭**之后**才排队的,所以它必然
 * 落在上一轮产物消息的后面 —— 用户此时往往已经发出了下一轮。于是队尾是记忆卡、
 * `lastAssistantId` 指向记忆卡,正在流的那条占位 `id !== lastAssistantId` → 兜底失效
 * → **正在跑的那一轮不再显示任何流式指示**,屏幕上一动不动。
 *
 * ── 为什么 OPEND-2745 的反向锚点照不出这条 ────────────────────────
 * 那一节的占位是**队尾最后一条**,没有任何东西落在它后面;而这里的形状是「占位 +
 * 一张晚到的宿主卡」。两者差的正是这条兜底的入参。
 *
 * ── 判据 ──────────────────────────────────────────────────────────
 * 新增一条,不动原来那条:兜底认的仍然是「最后一条」,只是**宿主补发的卡对它是透明的**
 * —— 判据与两次先例都写在 `lastAssistantTurnId`。收走流式指示的仍然是**下一轮真的
 * 跑过的助手消息**,宿主卡只是不再冒充那个「下一轮」。
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

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import { memoryWrittenCardContent } from '../../../src/runtime/useMemoryWrittenCard';
import type { ChatMessage } from '../../../src/types';

afterEach(() => cleanup());

/** 卡的正文走**产线那支**生成器,不手搓 —— 形状变了这条要跟着红。 */
const MEMORY_CARD = memoryWrittenCardContent(
  {
    key: 'ext-host-card-tail',
    count: 1,
    entries: [{ id: 'rule_radius_12px', name: '圆角统一 12px', type: 'rule' }],
  },
  'Remembered 1 preference',
);

const userAsks = (id: string, at: number): ChatMessage => ({
  id,
  role: 'user',
  content: '再做一版',
  createdAt: at,
} as ChatMessage);

/**
 * API / BYOK 模式的乐观占位,**照 `ProjectView.tsx` 建占位时的形状**:
 * 有 startedAt,没有 runId、没有 runStatus、没有 endedAt。
 */
const apiPlaceholder = (): ChatMessage => ({
  id: 'assistant-api-placeholder',
  role: 'assistant',
  content: '',
  events: [],
  agentId: 'openai',
  agentName: 'GPT',
  createdAt: 1_700_000_010_000,
  startedAt: 1_700_000_010_000,
} as ChatMessage);

/**
 * 宿主补发的记忆卡,**照 `ProjectView` 的写法**:有 content、有一条 text 事件、
 * 有 agent 身份,但 runId / runStatus / startedAt / endedAt 一个都没有。
 */
const hostMemoryCard = (): ChatMessage => ({
  id: 'assistant-memory-card',
  role: 'assistant',
  content: MEMORY_CARD,
  events: [{ kind: 'text', text: MEMORY_CARD }],
  agentId: 'openai',
  agentName: 'GPT',
  createdAt: 1_700_000_011_000,
} as ChatMessage);

/** 一条真跑过、已经收尾的轮次 —— 用来证明「下一轮照旧收走流式指示」。 */
const finishedTurn = (id: string, at: number): ChatMessage => ({
  id,
  role: 'assistant',
  content: '做完了',
  events: [{ kind: 'text', text: '做完了' }],
  agentId: 'openai',
  agentName: 'GPT',
  runId: `run-${id}`,
  runStatus: 'succeeded',
  createdAt: at,
  startedAt: at,
  endedAt: at + 1_000,
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

describe('晚到的宿主卡不许把 API 模式的流式指示顶掉', () => {
  /*
   * 真机那一刻的形状:上一轮的记忆提取回报晚到,而用户已经发出了下一轮,
   * API 模式的乐观占位正在流。记忆卡因此排在占位**后面**。
   */
  const sequence = () => [
    userAsks('u-1', 1_700_000_000_000),
    apiPlaceholder(),
    hostMemoryCard(),
  ];

  it('正在跑的那条占位仍然显示流式', () => {
    renderChat(sequence(), true);

    expect(
      looksRunning('assistant-api-placeholder'),
      '晚到的记忆卡顶掉了队尾,正在跑的那一轮不再显示流式指示',
    ).toBe(true);
  });

  it('记忆卡自己照旧不转 —— OPEND-2745 不许跟着回来', () => {
    renderChat(sequence(), true);

    expect(
      looksRunning('assistant-memory-card'),
      '记忆卡画出了「进行中」,屏幕上同时有两个(OPEND-2745)',
    ).toBe(false);
  });

  it('面板不在流时,占位不会凭空转起来', () => {
    renderChat(sequence(), false);

    expect(
      looksRunning('assistant-api-placeholder'),
      '面板没在流,却给占位画了「进行中」—— 判据放得太松',
    ).toBe(false);
  });

  it('下一轮真的跑过的助手消息照旧把流式指示收走', () => {
    renderChat(
      [
        userAsks('u-1', 1_700_000_000_000),
        { ...apiPlaceholder(), endedAt: 1_700_000_010_500 } as ChatMessage,
        hostMemoryCard(),
        userAsks('u-2', 1_700_000_012_000),
        finishedTurn('assistant-next-turn', 1_700_000_013_000),
      ],
      true,
    );

    expect(
      looksRunning('assistant-api-placeholder'),
      '上一轮的占位还在转 —— 修复让入口变粘了,宿主卡后面已经有真的下一轮了',
    ).toBe(false);
  });
});
