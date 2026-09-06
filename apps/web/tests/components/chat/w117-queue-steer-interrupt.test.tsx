// @vitest-environment jsdom
/**
 * 红测(OPEND-2602 · 呈现那一半):**队列行第三颗按钮按下去会中断当前运行。**
 *
 * ## 为什么改
 *
 * 这颗原来走的是「把消息写进 agent 子进程还开着的 stdin」(`steerChatRun`)。
 * 两件实测事实把这条路判了死刑:
 *   1. 27 个 runtime 里只有 `claude` / `codebuddy` 的 `promptInputFormat` 是
 *      `stream-json`,其余 25 个这颗按钮压根不出现;
 *   2. 拿装机的真 claude 2.1.259 做对照:轮次跑到一半写进 stdin 的 user 帧
 *      CLI 完全没处理(等 180s 进程活着不动),同一条在 `result` 帧之后写进去
 *      才正常起第二轮 —— 而 daemon 恰恰在 `usage` 时就关 stdin。
 *
 * 产品裁决(2026-09-03):这颗改成**中断当前运行 + 立刻发出这条**,
 * hover 文案要说出「会中断」这件事。
 *
 * ## 这一页守什么
 *
 * · **可见文字**仍是「引导对话」(`chat.queuedSteer`)—— 产品只说改 hover。
 * · **hover 三处**(`title` / `data-tooltip` / `aria-label`)统一换成新键,
 *   而且那句话真的在说「会中断」,不是随便换了个字符串。
 * · **带附件那一行也出现这颗** —— 原来的排除理由是「引导只送得动一帧纯文本,
 *   附件根本过不去」;现在这颗走的是中断 + 重发,附件原样跟着走,理由已经不成立。
 * · 反向对照:没有在跑的一轮时(主人不给 `onSteer`),这颗退回纯图标的
 *   「发送」,名字、行为一个字都不变。
 *
 * ## 防假绿
 *
 * 断言钉的是 **en 词典里那条真实字符串**,不是「和 label 不同」这种真空条件:
 * 键不存在时 `en['chat.queuedSteerInterrupts']` 是 `undefined`,而
 * `getAttribute` 拿回的是当前实现的 `'Steer this turn'` —— 两边都不是
 * `undefined`,断言照得出来。为保险再先钉一次「这条文案本身非空」。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ChatCommentAttachment } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { QueuedSendStrip } from '../../../src/components/ChatPane';
import { en } from '../../../src/i18n/locales/en';
import { zhCN } from '../../../src/i18n/locales/zh-CN';

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
const STEER_TOOLTIP = en['chat.queuedSteerInterrupts'];

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

describe('OPEND-2602:队列行第三颗按下去中断当前运行', () => {
  it('新文案本身立得住:非空,且和按钮上那行可见文字不是同一句', () => {
    // 先把「量法看得见」证明掉 —— 后面几条断言都拿 STEER_TOOLTIP 当标尺,
    // 标尺是 undefined 的话它们会变成看不出问题的空断言。
    expect(typeof STEER_TOOLTIP).toBe('string');
    expect((STEER_TOOLTIP ?? '').length).toBeGreaterThan(0);
    expect(STEER_TOOLTIP).not.toBe(STEER_LABEL);
  });

  it('文案说的真的是「会中断当前运行」,不是换了个说法的同义词', () => {
    // 产品口述的两种语言各钉一次内容,免得「新键存在」被当成「文案对」。
    expect(STEER_TOOLTIP).toMatch(/interrupt|stop/i);
    expect(zhCN['chat.queuedSteerInterrupts']).toContain('中断');
  });

  it('按钮上可见的那行字仍是「引导对话」', () => {
    renderStrip({ onSteer: () => {} });
    const steer = screen.getByTestId('chat-queued-send-steer');
    expect(steer.textContent?.trim()).toBe(STEER_LABEL);
  });

  it('hover 三处统一说「会中断当前运行」', () => {
    renderStrip({ onSteer: () => {} });
    const steer = screen.getByTestId('chat-queued-send-steer');
    expect(steer.getAttribute('title')).toBe(STEER_TOOLTIP);
    expect(steer.getAttribute('data-tooltip')).toBe(STEER_TOOLTIP);
    expect(steer.getAttribute('aria-label')).toBe(STEER_TOOLTIP);
  });

  it('带附件那一行也拿到这颗 —— 中断 + 重发把附件原样带走', () => {
    const onSteer = vi.fn();
    const onSendNow = vi.fn();
    renderStrip({
      onSteer,
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

    // 三行全是引导态,一个退回态都不剩。
    expect(screen.getAllByTestId('chat-queued-send-steer')).toHaveLength(3);
    expect(screen.queryAllByTestId('chat-queued-send-now')).toHaveLength(0);

    // 而且点下去走的确实是这条路,不是名字变了、行为还留在「立即发送」上。
    fireEvent.click(screen.getAllByTestId('chat-queued-send-steer')[1]!);
    expect(onSteer).toHaveBeenCalledTimes(1);
    expect(onSteer.mock.calls[0]?.[0]).toMatchObject({ id: 'with-attachment' });
    expect(onSendNow).not.toHaveBeenCalled();
  });

  // ——— 反向对照:没有在跑的一轮 ———

  it('没有在跑的一轮时,这颗退回纯图标的「发送」,名字和行为都不变', () => {
    const onSendNow = vi.fn();
    renderStrip({ onSendNow });

    expect(screen.queryByTestId('chat-queued-send-steer')).toBeNull();
    const sendNow = screen.getByTestId('chat-queued-send-now');
    // 退回态没有可见文字,tooltip 就是它唯一的名字 —— 那一格只写它按下去干的事。
    expect(sendNow.textContent?.trim()).toBe('');
    expect(sendNow.getAttribute('title')).toBe(en['chat.send']);
    expect(sendNow.getAttribute('data-tooltip')).toBe(en['chat.send']);
    expect(sendNow.getAttribute('aria-label')).toBe(en['chat.send']);
    // 「会中断当前运行」是引导态的话,不许漏到这一颗上。
    expect(sendNow.getAttribute('title')).not.toBe(STEER_TOOLTIP);

    fireEvent.click(sendNow);
    expect(onSendNow).toHaveBeenCalledWith('q1');
  });
});
