// @vitest-environment jsdom
/**
 * 整轮失败的那一轮:**壳头说「运行失败」,页脚就不再出回合状态行**(B18)。
 *
 * ── 缺陷长什么样 ────────────────────────────────────────────────────
 * 一轮跑挂了,壳头写着「运行失败」。用户**接着再发一条消息**之后,这一轮的页脚
 * 上多出一枚「✓ 已完成」—— 同一屏上,壳头说失败、页脚说成功,还戴着成功那一档
 * 的绿勾。
 *
 * ── 为什么发了下一条才出现 ──────────────────────────────────────────
 * `hideRunStatus` 的第一条例外是「这一轮拥有那张报错卡」,而报错卡的归属
 * (`ChatPane` 的 `errorCardOwnerId`)要求这条失败助手消息**正好是转录的最后一条**。
 * 追加任何一条消息(哪怕只是用户自己发的)→ 归属变 null → 例外不再命中 →
 * 状态行照常渲染。而页脚那条文案阶梯里只有 `canceled` 一个终态,`failed` 一个字
 * 都没有,于是直落最后那个 `doneLabel`。
 *
 * ── 判据出处(逐条,不是「看起来重复」)────────────────────────────
 *  · `specs/current/chat-panel-next.md` B18:「整轮失败:执行记录头「运行失败」
 *    默认收起,下面出组件 19 报错卡…**不出回合状态行**」
 *  · `specs/current/chat-panel-dev-design.md` 状态机:「运行失败(默认收起,
 *    报错卡接手)」+ 场景表「失败 | … | 壳头「运行失败」收起 + 报错卡,
 *    **无回合状态行**」
 *  · `specs/current/chat-panel-next-review.md` B18 同条
 *
 * ⚠️ **空流那一档不在此列**。API 空回复把这一轮也写成 `runStatus: 'failed'`
 * (`ProjectView.tsx` 的 `emptyApiResponse` 分支),但它的状态词是「没有输出」,
 * 由 `e2e/ui/api-empty-response.test.ts` 那条 P0 钉死。下面第 4 条对照就是把那条
 * 判据下沉到这一层,免得改这里时把它撞红。
 *
 * ⚠️ **看不见 ≠ 没问题**:非最后一轮时这一行是 `opacity: 0`
 * (`styles/viewer/composio.css`,OPEND-2542),hover / focus 才显形。jsdom 不算
 * 层叠所以照得到;换 Playwright 复现必须先 hover 那条消息。
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

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

/** 一条真的跑过、真的挂了的轮次:壳里有事、有起止时刻、带上游那条 error。 */
function failedTurn(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-failed',
    role: 'assistant',
    content: '列表页复刻到一半。',
    runStatus: 'failed',
    startedAt: 1700000000,
    endedAt: 1700000042,
    createdAt: 1700000042,
    events: [
      { kind: 'tool_use', id: 'read-before-fail', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool_result', toolUseId: 'read-before-fail', content: 'partial output', isError: false },
      { kind: 'status', label: 'error', detail: 'upstream connection reset' },
    ] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

/**
 * 「用户已经发过下一条」的那一帧:报错卡不再归这一轮
 * (`errorCardOwnerId = null`),这一轮也不再是转录末尾(`isLast = false`)。
 */
function renderAfterFollowUp(message: ChatMessage, errorCardOwnerId: string | null = null) {
  return render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast={false}
      projectId="p1"
      errorCardOwnerId={errorCardOwnerId}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
}

describe('整轮失败 · 回合状态行', () => {
  it('壳头说「运行失败」的同一屏上,页脚不出回合状态行', () => {
    const { container } = renderAfterFollowUp(failedTurn());

    // ① 同屏取证先行:先证明壳头**确实**在说运行失败,
    //    否则下面那条 `toBeNull()` 在一个空组件上也会绿。
    expect(
      container.textContent,
      '壳头没说「运行失败」—— 这一帧压根不是缺陷现场,下面的断言会空过',
    ).toContain(en['chat.record.failedTurn']);

    // ② 正题:这一轮不出回合状态行。
    expect(
      container.querySelector('[data-testid="assistant-label"]'),
      '壳头说失败,页脚同时挂了一个状态词 —— 同屏自相矛盾',
    ).toBeNull();
  });

  it('那个词今天读到的字面就是 Done —— 失败轮不许戴成功那一档的字', () => {
    const { container } = renderAfterFollowUp(failedTurn());
    const label = container.querySelector('[data-testid="assistant-label"]');
    expect(label?.textContent ?? null).not.toBe(en['assistant.doneLabel']);
  });

  it('让位的只是那个状态词,整行照旧出:复制 / Fork / 赞踩都还在', () => {
    const { container } = renderAfterFollowUp(failedTurn());
    // 没有这一条,「整行根本没渲染」也能让上面两条空过。
    expect(container.querySelector('[data-testid="assistant-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-copy-markdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-fork-button"]')).toBeTruthy();
    // 失败是终态,`isFeedbackEligible` 照旧放行 —— 让位的只有那个状态词。
    expect(container.querySelector('[data-testid="assistant-feedback-positive"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-feedback-negative"]')).toBeTruthy();
  });
});

describe('整轮失败 · 静态对照(证明没一刀切)', () => {
  it('跑通的那一轮照旧是「已完成」', () => {
    const { container } = renderAfterFollowUp(
      failedTurn({ id: 'm-ok', runStatus: 'succeeded', events: [] as ChatMessage['events'] }),
    );
    const label = container.querySelector('[data-testid="assistant-label"]');
    expect(label?.textContent).toBe(en['assistant.doneLabel']);
  });

  it('手动停止的那一轮照旧是「已手动停止」', () => {
    const { container } = renderAfterFollowUp(
      failedTurn({ id: 'm-stop', runStatus: 'canceled', events: [] as ChatMessage['events'] }),
    );
    const label = container.querySelector('[data-testid="assistant-label"]');
    expect(label?.textContent).toBe(en['assistant.canceledLabel']);
  });

  it('API 空回复虽然也是 failed,状态词照旧是「没有输出」', () => {
    // 出处:`ProjectView.tsx` 的 `emptyApiResponse` 分支把空流写成
    // `runStatus:'failed'` + `status(label:'empty_response')`;
    // `e2e/ui/api-empty-response.test.ts` 那条 P0 明令这格显示「No output」、
    // 且 `Done` 计数为 0。这里把那条判据下沉到便宜层。
    const { container } = renderAfterFollowUp(
      failedTurn({
        id: 'm-empty',
        events: [
          { kind: 'status', label: 'empty_response', detail: 'claude-sonnet' },
          { kind: 'text', text: 'The provider ended the request without any output.' },
        ] as ChatMessage['events'],
      }),
    );
    const label = container.querySelector('[data-testid="assistant-label"]');
    expect(label?.textContent).toBe(en['assistant.emptyResponseLabel']);
  });

  it('报错卡还归这一轮时,让位的理由仍是 B36 那条,不是新加的这条', () => {
    // `hideRunStatus` 的第一条例外(`chat-panel-feedback.md` B36)不能被顺手改掉:
    // 报错卡在场时这一行本来就该让位,和这一轮成功与否无关。
    const { container } = renderAfterFollowUp(failedTurn(), 'm-failed');
    expect(container.querySelector('[data-testid="assistant-label"]')).toBeNull();
  });
});
