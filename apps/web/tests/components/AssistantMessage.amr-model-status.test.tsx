// @vitest-environment jsdom

/**
 * AMR 的回合下面不再挂一行 `model <模型 id>`。
 *
 * ── 它是谁画的 ────────────────────────────────────────────────
 * 这一行**不是模型自己写的**,是我们画的,而且只在 AMR(ACP)这一路出现:
 *
 *   1. `apps/daemon/src/agent-protocol/acp/session.ts`(654 / 949 / 1013 三处)
 *      在 `session/new`、`session/set_model` 完成、以及选型失败回落时,各发一次
 *      `{ type: 'status', label: 'model', model: <当前模型> }`。走 ACP 的 runtime
 *      才有这条 —— claude / codex / opencode 那些 stdout 协议的 runtime 一条都不发。
 *   2. `apps/web/src/providers/daemon.ts` 的 `translateAgentEvent` 把 `model` 字段
 *      折进 `detail`,变成 `{ kind: 'status', label: 'model', detail: 'deepseek-v4-flash' }`。
 *   3. `AssistantMessage` 把它当成一条普通状态行,渲染成
 *      `<span class="status-label">model</span><span class="status-detail">deepseek-v4-flash</span>`,
 *      落在 `.assistant-flow` 的最后一个孩子 —— 也就是「某一轮的最下面」。
 *
 * 真机上抓到的原样(AMR + deepseek-v4-flash):
 *   <div class="status-pill" data-testid="status-pill" data-status="model">
 *     <span class="status-label">model</span>
 *     <span class="status-detail" data-testid="status-detail">deepseek-v4-flash</span>
 *   </div>
 *
 * ── 为什么去掉 ────────────────────────────────────────────────
 * 它无条件出现在产品界面上(没有任何 NODE_ENV / debug 开关),而模型身份在
 * 输入区的模型芯片上已经写着了。用户 2026-08-27:「这个模型的标识可以去掉」。
 *
 * 只是**不画**,事件本身照发 —— daemon 的
 * `run-analytics-observability.ts` 仍按 `label === 'model'` 归因。
 *
 * ── 正向对照 ──────────────────────────────────────────────────
 * 「界面上没有 model 标识」这条断言,组件整个没画出来时也会绿。所以每一条
 * 都配一句「这一轮的正文确实渲染出来了」。
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

const PROSE = 'Two quick questions before I start.';

/**
 * 正文的正向对照不能用 `getByText` —— 逐字浮现(`useCharReveal`)会把还在写的
 * 那一段按字拆成一串 `<span>`,`getByText` 的整段匹配从此找不到它(§F-16)。
 * 改成在整棵树的 `textContent` 上找,拆不拆都成立。
 *
 * 这一条**必须留着**:它证明这一轮确实渲染出来了。少了它,下面那些
 * 「没有 model 标识」的断言在整条消息压根没画时也会绿。
 */
const hasProse = (c: HTMLElement): boolean => (c.textContent ?? '').includes(PROSE);
const MODEL_ID = 'deepseek-v4-flash';

/** 一条 AMR(ACP)回合:daemon 先报选定的模型,再流正文。 */
function amrMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-amr',
    role: 'assistant',
    agentId: 'amr',
    content: PROSE,
    runStatus: 'completed',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [
      { kind: 'status', label: 'model', detail: MODEL_ID },
      { kind: 'text', text: PROSE },
    ] as ChatMessage['events'],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

describe('AMR 回合不再挂「model <id>」标识', () => {
  it('模型 id 不出现在对话里(正文照常渲染)', () => {
    const { container } = render(
      <AssistantMessage
        message={amrMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    // 正向对照:这一轮真的画出来了,不是整个组件没渲染
    expect(hasProse(container)).toBe(true);
    expect(screen.queryByText(MODEL_ID)).toBeNull();
  });

  it('那一行状态行本身不存在 —— 标签与 detail 都不留', () => {
    const { container } = render(
      <AssistantMessage
        message={amrMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(hasProse(container)).toBe(true);
    expect(container.querySelector('[data-status="model"]')).toBeNull();
    // 拆开也不行:`model` 是字面量 label、id 是变量,按整串搜是搜不到的
    const labels = [...container.querySelectorAll('.status-label')].map((n) => n.textContent);
    expect(labels).not.toContain('model');
    const details = [...container.querySelectorAll('[data-testid="status-detail"]')]
      .map((n) => n.textContent);
    expect(details).not.toContain(MODEL_ID);
  });

  it('还在流的那一轮同样不出(真机上就是在这个阶段看见的)', () => {
    const { container } = render(
      <AssistantMessage
        message={amrMessage({ runStatus: 'running' })}
        streaming
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(hasProse(container)).toBe(true);
    expect(container.querySelector('[data-status="model"]')).toBeNull();
  });

  it('别的状态行没被顺手清掉 —— 带 detail 的产品状态照旧', () => {
    const { container } = render(
      <AssistantMessage
        message={amrMessage({
          events: [
            { kind: 'status', label: 'model', detail: MODEL_ID },
            { kind: 'status', label: 'done', detail: 'Published to the gallery' },
            { kind: 'text', text: PROSE },
          ] as ChatMessage['events'],
        })}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-status="model"]')).toBeNull();
    expect(container.querySelector('[data-status="done"]')).toBeTruthy();
    expect(screen.getByText('Published to the gallery')).toBeTruthy();
  });
});
