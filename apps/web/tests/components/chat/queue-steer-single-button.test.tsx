// @vitest-environment jsdom
/**
 * 队列行的领头动作键**只有一颗**,而且永远叫「引导对话」。
 *
 * ## 裁决
 *
 * 产品 2026-09-08 当面拍板:「引导对话就是原本的立即发送啊,只不过我们换了个
 * 名字跟 codex 客户端对齐了下」。也就是说 —— 这两副面孔从来不是两件事:
 * `ProjectView` 给这两个 prop 的实参**是同一个函数** `sendQueuedChatSendNow`,
 * 它自己按 `currentConversationBusy` 分支(在跑就先掐掉再发,没在跑就直接发)。
 * 二选一的三元式换掉的只有名字、一个门(`canSteerCurrentTurn`)和埋点的
 * `element` 值,按下去发生的事一模一样。
 *
 * 所以那个门去掉,两副面孔并成一颗。
 *
 * ## 稿子怎么画的
 *
 * `git show 729fa43ce7:docs/design/chat-panel-next.html` 组件 17「Queue」
 * (`data-od-id="cmp-queue"`)。三行队列样例,每一行的动作组里都是同一颗:
 *
 *     <button type="button" class="mod-tip-e mod-steer"
 *             aria-label="引导对话" data-tip="引导对话"><svg/><span>引导对话</span></button>
 *
 * 两件事要看清:
 *   · 稿子里**没有**只有图标的「立即发送」那一颗 —— 退回态本就不该存在;
 *   · `data-tip` 就是「引导对话」四个字。挂在 hover 上的
 *     `chat.queuedSteerInterrupts`(「会中断当前运行」)是后来加的,不是稿子。
 *
 * ## 这一页量的是什么
 *
 * **没有可中断的一轮**时(宿主不给 `onSteer` 那种旧形态,如今只给
 * `onSendNow`)队列行第一颗仍旧必须是**带可见文字标签**的「引导对话」,
 * 而不是无标签的图标键。这正是并按钮之前会红的那一格:改之前这一路走的是
 * 三元式的 else 分支,画出来的是 22×22 的纯图标 `chat-queued-send-now`。
 *
 * 顺序(引导 → 编辑 → 删除,OPEND-2715)由
 * `tests/components/ChatPane.queued-action-order.test.tsx` 主钉,这里再复述
 * 一遍是因为「并按钮」最容易顺手把领头那一格挪走。
 *
 * 这一页取代了 `queue-steer.test.tsx`(已删):那一页整篇量的都是「两副面孔
 * 各自长什么样、点下去分别走哪条回调」,被测的那个分叉本身没有了,它的
 * 三条用例(名字、可见标签、点下去真的发出去)在这里各有对应。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { I18nProvider } from '../../../src/i18n';
import { QueuedSendStrip } from '../../../src/components/ChatPane';
import { en } from '../../../src/i18n/locales/en';

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

afterEach(cleanup);

describe('队列行领头动作键:并成一颗「引导对话」', () => {
  it('先证明这把尺子够得着 —— 稿子那句文案在词典里确实存在且非空', () => {
    // 键写错时 `en[key]` 是 undefined,下面几条 `toBe(STEER)` 会变成
    // 「undefined === undefined」那种看不出问题的空断言。
    expect(typeof en['chat.queuedSteer']).toBe('string');
    expect((en['chat.queuedSteer'] ?? '').length).toBeGreaterThan(0);
  });

  it('没有可中断的一轮时,领头那颗仍旧是带文字标签的「引导对话」', () => {
    renderStrip();

    const steer = screen.getByTestId('chat-queued-send-steer');
    // 稿子 `<svg/><span>引导对话</span>`:图标之外还有一段**可见**文字。
    expect(steer.textContent?.trim()).toBe(en['chat.queuedSteer']);
    expect(steer.querySelector('svg')).not.toBeNull();
    // 退回态那颗无标签图标键在稿子里根本不存在。
    expect(screen.queryByTestId('chat-queued-send-now')).toBeNull();
  });

  it('三处名字都按稿子写「引导对话」,不写那句「会中断当前运行」', () => {
    renderStrip();

    const steer = screen.getByTestId('chat-queued-send-steer');
    const expected = en['chat.queuedSteer'];
    // 稿子 `aria-label="引导对话" data-tip="引导对话"` —— 逐字。
    expect(steer.getAttribute('aria-label')).toBe(expected);
    expect(steer.getAttribute('data-tooltip')).toBe(expected);
    expect(steer.getAttribute('title')).toBe(expected);
    // 反向:后加的那句长文案不许再出现在这颗上。
    expect(steer.getAttribute('aria-label')).not.toBe(en['chat.queuedSteerInterrupts']);
  });

  it('只有一颗:两副面孔的类名不再分家,带标签的样式永远生效', () => {
    renderStrip();

    const steer = screen.getByTestId('chat-queued-send-steer');
    expect(steer.classList.contains('chat-queued-send-action')).toBe(true);
    expect(steer.classList.contains('chat-queued-send-action-steer')).toBe(true);
    // 一行里领头的动作键有且只有一颗。
    expect(screen.getAllByTestId('chat-queued-send-steer')).toHaveLength(1);
  });

  it('点下去把这一条发出去(宿主那一端自己决定要不要先掐掉在跑的一轮)', () => {
    const onSendNow = vi.fn();
    renderStrip({ onSendNow });

    fireEvent.click(screen.getByTestId('chat-queued-send-steer'));
    expect(onSendNow).toHaveBeenCalledTimes(1);
    expect(onSendNow).toHaveBeenCalledWith('q1');
  });

  it('顺序没被并按钮打乱:引导 → 编辑 → 删除(OPEND-2715)', () => {
    renderStrip();

    const labels = [...document.querySelectorAll('.chat-queued-send-action')].map(
      (el) => el.getAttribute('aria-label') ?? '',
    );
    expect(labels).toEqual([
      en['chat.queuedSteer'],
      en['chat.queuedEdit'],
      en['chat.comments.remove'],
    ]);
  });
});
