// @vitest-environment jsdom
/**
 * B11 「引导对话」 —— 队列行第三颗按钮的**两副面孔**。
 *
 * 产品裁决(OPEND-2602,2026-09-03)之后,这颗按下去干的事是**中断正在跑的
 * 那一轮,然后立刻发出这条**。所以两副面孔的差别不再是「打断 / 不打断」,
 * 而是「此刻有没有一轮可中断」:
 *   · 有 → 它叫「引导对话」,带可见文字标签,hover 说会中断当前运行;
 *   · 没有 → 它**连名字一起**退回普通的「发送」,只有图标。
 *
 * 这一页守的是「名字不冒名顶替」。带附件那一行现在**也**是引导态
 * (中断 + 重发把附件原样带走),连同 hover 文案一起,由
 * `w117-queue-steer-interrupt.test.tsx` 单独钉;这里不重复。
 *
 * ## 为什么「名字」和「点了会发生什么」拆成两条用例
 *
 * 这两件事以前挤在同一个 `it()` 里:一边断言 tooltip 写着「当前 agent 不支持
 * 中途插话」,一边断言点下去走的是 `onSendNow`。两条断言各自都对,合在一起
 * 恰恰把缺陷钉成了「当前行为」—— 屏幕上唯一看得见的那段文字在回答
 * 「这颗**为什么不是**引导对话」,可它占的是「这颗按钮**叫什么**」的位置,
 * 而按钮真正干的事(停掉这一轮、重新发一条)一个字都没写。
 *
 * 所以拆开:一条只问名字,一条只问行为(点了确实发出去)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import { QueuedSendStrip } from '../../../src/components/ChatPane';

type StripProps = Parameters<typeof QueuedSendStrip>[0];

function renderStrip(overrides: Partial<StripProps> = {}) {
  const props: StripProps = {
    items: [{ id: 'q1', prompt: '把首屏文案改短一点' }],
    onEdit: () => {},
    onRemove: () => {},
    onReorder: () => {},
    onSendNow: () => {},
    ...overrides,
  };
  return render(
    <I18nProvider>
      <QueuedSendStrip {...props} />
    </I18nProvider>,
  );
}

// 这个配置没开自动 cleanup(见 ChatPane.streaming.test.tsx 也是手动 cleanup),
// 不清的话上一条用例的 DOM 还挂着,getAllByTestId 会把它一起数进来。
afterEach(cleanup);

describe('队列行第三颗:引导对话', () => {
  it('有一轮可中断时这颗是「引导对话」,点它走中断那条路', () => {
    const onSteer = vi.fn();
    const onSendNow = vi.fn();
    renderStrip({ onSteer, onSendNow });

    const steer = screen.getByTestId('chat-queued-send-steer');
    // 屏幕上可见的那行字仍旧是「引导对话」——「会中断当前运行」只在 hover 里,
    // 由 w117 那一页逐字钉。
    expect(steer.textContent?.trim()).toBe('Steer this turn');
    expect(screen.queryByTestId('chat-queued-send-now')).toBeNull();

    fireEvent.click(steer);
    expect(onSteer).toHaveBeenCalledTimes(1);
    expect(onSteer.mock.calls[0]?.[0]).toMatchObject({ id: 'q1' });
    // 引导态点下去只能走这一条,不许顺手也点一遍退回态那个回调。
    expect(onSendNow).not.toHaveBeenCalled();
  });

  // ——— 名字 ———

  it('没有可中断的一轮时,这颗的名字退回「发送」—— 三处名字说的是同一件事', () => {
    renderStrip();

    expect(screen.queryByTestId('chat-queued-send-steer')).toBeNull();
    const sendNow = screen.getByTestId('chat-queued-send-now');
    expect(sendNow.getAttribute('aria-label')).toBe('Send');
    expect(sendNow.getAttribute('data-tooltip')).toBe('Send');
    expect(sendNow.getAttribute('title')).toBe('Send');
  });

  // ——— 点下去会发生什么 ———

  it('退回态点下去,这条真的发出去', () => {
    const onSendNow = vi.fn();
    renderStrip({ onSendNow });

    fireEvent.click(screen.getByTestId('chat-queued-send-now'));
    expect(onSendNow).toHaveBeenCalledWith('q1');
  });
});
