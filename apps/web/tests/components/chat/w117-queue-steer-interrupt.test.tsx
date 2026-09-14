// @vitest-environment jsdom
/**
 * OPEND-2602 · 呈现那一半:**队列行领头那颗按下去会中断当前运行。**
 *
 * ## 为什么这颗是这样的
 *
 * 它原来走的是「把消息写进 agent 子进程还开着的 stdin」(`steerChatRun`)。
 * 两件实测事实把这条路判了死刑:
 *   1. 27 个 runtime 里只有 `claude` / `codebuddy` 的 `promptInputFormat` 是
 *      `stream-json`,其余 25 个这颗按钮压根不出现;
 *   2. 拿装机的真 claude 2.1.259 做对照:轮次跑到一半写进 stdin 的 user 帧
 *      CLI 完全没处理(等 180s 进程活着不动),同一条在 `result` 帧之后写进去
 *      才正常起第二轮 —— 而 daemon 恰恰在 `usage` 时就关 stdin。
 *
 * 产品裁决(2026-09-03):这颗改成**中断当前运行 + 立刻发出这条**。
 *
 * ## 这一页今天还守什么
 *
 * 只剩一条,但它是这一族里别处没有的:**带附件 / 带批注那一行也拿到这颗**。
 * 原来的排除理由是「引导只送得动一帧纯文本,附件根本过不去」;改走中断 + 重发
 * 之后走的是完整发送路径,附件和批注原样跟着走,那条理由不成立了。
 *
 * 原先这一页还钉着两件事,都已经作废:
 *   · hover 三处说「会中断当前运行」(`chat.queuedSteerInterrupts`)——
 *     那句是稿子之外后加的。交付稿
 *     (`729fa43ce7:docs/design/chat-panel-next.html` 组件 17「Queue」)写的是
 *     `aria-label="引导对话" data-tip="引导对话"`,2026-09-08 收敛回稿子。
 *     三处名字现由 `queue-steer-single-button.test.tsx` 逐字钉。
 *   · 「没有在跑的一轮时退回纯图标的『发送』」—— 那副退回态整个撤了
 *     (同一次裁决:「引导对话就是原本的立即发送」),稿子里也从来没有它。
 *
 * `chat.queuedSteerInterrupts` 这条文案本身没有删(和它同族的
 * `Unsupported` / `Closed` / `Failed` / `TextOnly` 一样是**休眠件**),
 * 中英措辞由 `tests/i18n/queue-steer-terminology.test.ts` 继续钉着。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ChatCommentAttachment } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { QueuedSendStrip } from '../../../src/components/ChatPane';
import { en } from '../../../src/i18n/locales/en';

type StripProps = Parameters<typeof QueuedSendStrip>[0];

/** 只有 id 是这一页用得上的字段,其余按契约补齐即可。 */
function commentAttachment(id: string): ChatCommentAttachment {
  return {
    id,
    order: 0,
    filePath: 'index.html',
    elementId: 'el-1',
    selector: '#el-1',
    label: '标题',
    comment: '这里',
    currentText: '旧文案',
    pagePosition: { x: 0, y: 0 } as ChatCommentAttachment['pagePosition'],
    htmlHint: '',
  };
}

const STEER_LABEL = en['chat.queuedSteer'];

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

// 这个配置没开自动 cleanup(见 ChatPane.streaming.test.tsx 也是手动 cleanup)。
afterEach(cleanup);

describe('OPEND-2602:队列行领头那颗按下去中断当前运行', () => {
  it('先证明这把尺子够得着 —— 按钮上那行可见文字在词典里非空', () => {
    // 标尺是 undefined 的话,下面那条 `toBe(STEER_LABEL)` 会变成空断言。
    expect(typeof STEER_LABEL).toBe('string');
    expect((STEER_LABEL ?? '').length).toBeGreaterThan(0);
  });

  it('带附件 / 带批注那一行也拿到这颗 —— 中断 + 重发把附件原样带走', () => {
    const onSendNow = vi.fn();
    renderStrip({
      onSendNow,
      items: [
        { id: 'text-only', prompt: '再紧凑一点' },
        {
          id: 'with-attachment',
          prompt: '按这张图改',
          attachments: [{ path: 'a.png', name: 'a.png', kind: 'image' }],
        },
        {
          id: 'with-comment',
          prompt: '按这条批注改',
          commentAttachments: [commentAttachment('c1')],
        },
      ],
    });

    // 三行一模一样:同一颗按钮、同一个名字,没有哪一行被降级。
    const steers = screen.getAllByTestId('chat-queued-send-steer');
    expect(steers).toHaveLength(3);
    for (const steer of steers) {
      expect(steer.textContent?.trim()).toBe(STEER_LABEL);
    }
    // 退回态那颗无标签图标键已经撤了,一个都不许剩。
    expect(screen.queryAllByTestId('chat-queued-send-now')).toHaveLength(0);

    // 而且带附件那一行点下去真的把**它自己**发出去,不是发了第一条。
    fireEvent.click(steers[1]!);
    expect(onSendNow).toHaveBeenCalledTimes(1);
    expect(onSendNow).toHaveBeenCalledWith('with-attachment');
  });
});
