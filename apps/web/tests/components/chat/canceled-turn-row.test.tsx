// @vitest-environment jsdom
/**
 * 被中断的那一轮的回合状态行(交付稿 15-6 / 镜像陈列页第 #39 格)。
 *
 * 稿子这一格的 DOM 只有四样东西:
 *
 *     <span class="fin mod-stop"><i></i>已手动停止</span>
 *     <button 复制><button 新开会话>
 *     <span class="sp"></span><span class="tm">14:32</span>
 *
 * 三条要守的不变量,每条都在产线上真的错过:
 *
 *  ① **状态词**是「已手动停止」——「说清是谁停的」。产品原来是「已取消」。
 *     稿子在 CSS 注释里把理由写了两遍,顺带点名反对「仍有未完成任务」那种限定语:
 *     剩没剩、剩几步,上面那段执行记录本来就写着。
 *
 *  ② **赞 / 踩不出**。中断的一轮没有「答得好不好」可评 —— 它压根没答完。
 *     产品的 `isFeedbackEligible` 把 `canceled` 当成终态放行,两枚照常渲染。
 *     这条只能从**渲染**上守:jsdom 不算层叠,CSS 断言在这里等于没有。
 *
 *  (P0-24 Q6:页脚状态词已去掉,①③ 只剩文案键与历史记录;状态在壳头。)
 *
 *  ③ **状态词是 `--text-muted` 的中性灰**,不是 `--text-faint`。
 *     这条是纯层叠事故,规则文本上一个字都看不出来:
 *         theater.css   `.assistant-footer[data-canceled="true"] .assistant-label`  (0,3,0)
 *         routines.css  `.app .assistant-footer .assistant-label`                   (0,3,0)
 *     特异性打平,`index.css` 又把 routines 排在 theater **后面** —— 旧皮肤那份
 *     `color: var(--text-faint)`(#bdbdbd)赢,稿子要的 #5c5c5c 永远到不了屏幕上。
 *     真 Chrome 上量到的就是 `rgb(189, 189, 189)`。
 *     所以这一条按**层叠结果**判:把 index.css 的导入顺序照搬一遍,
 *     用 `matches()` 挑出真的命中这枚 label 的规则,再按 (特异性, 顺序) 决出胜者。
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { en } from '../../../src/i18n/locales/en';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
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

function turn(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '列表页复刻到一半。',
    startedAt: 1700000000,
    endedAt: 1700000042,
    createdAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage) {
  return render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
}

describe('中断的一轮 · 状态词', () => {
  it('回合末尾不再出「任务已停止」(P0-24)', () => {
    // P0-24 Q6:停止只由壳头说,页脚不再有状态词。
    const { container } = renderTurn(turn({ runStatus: 'canceled' }));
    expect(container.querySelector('[data-testid="assistant-label"]')).toBeNull();
    expect(container.textContent).not.toContain(en['assistant.canceledLabel']);
  });

  it('文案落在 `assistant.canceledLabel` 上,逐字与稿子相同', () => {
    // 产品《报错文案｜精简版》S24c「用户主动停止」:标题「任务已停止」(正文另见 `assistant.canceledDetail`)。
    expect(zhCN['assistant.canceledLabel']).toBe('任务已停止');
    expect(zhCN['assistant.canceledDetail']).toBe('本次运行已按你的操作停止。');
  });

  it('旧会话同时带 no_result 时仍按手动停止处理,不回退成红色运行失败', () => {
    const { container } = renderTurn(turn({
      runStatus: 'canceled',
      resultDeliveryState: 'no_result',
      events: [
        { kind: 'tool_use', id: 'read-before-stop', name: 'Bash', input: { command: 'ls' } },
        {
          kind: 'tool_result',
          toolUseId: 'read-before-stop',
          content: 'partial output',
          isError: false,
        },
      ],
    }));

    // P0-24 Q6:页脚不再出「任务已停止」,停止由壳头说。
    expect(container.querySelector('[data-testid="assistant-label"]')).toBeNull();
    // 壳头报的是终态本身。OPEND-2626 之前这里是 `chat.record.running`,
    // 和一个真的在跑的回合共用同一个词;这一条要守的「不退成红色运行失败」没变。
    expect(container.textContent).toContain(en['chat.record.turnStopped']);
    expect(container.textContent).not.toContain(en['chat.record.running']);
    expect(container.textContent).not.toContain(en['chat.record.failedTurn']);
  });
});

describe('中断的一轮 · 只留 复制 / Fork', () => {
  it('赞 / 踩两枚不出 —— 这一轮没答完,没有「答得好不好」可评', () => {
    const { container } = renderTurn(turn({ runStatus: 'canceled' }));
    expect(container.querySelector('[data-testid="assistant-feedback-positive"]')).toBeNull();
    expect(container.querySelector('[data-testid="assistant-feedback-negative"]')).toBeNull();
    // 正面断言,免得「整行没渲染出来」也让上面两条空过。
    expect(container.querySelector('[data-testid="assistant-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-copy-markdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-fork-button"]')).toBeTruthy();
  });

  it('跑通的那一轮照样出赞 / 踩 —— 不许一刀切', () => {
    const { container } = renderTurn(turn({ id: 'm-ok', runStatus: 'succeeded' }));
    expect(container.querySelector('[data-testid="assistant-feedback-positive"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-feedback-negative"]')).toBeTruthy();
  });
});

// P0-24 Q6: the settled status word this measured was removed; status lives in the turn header.
