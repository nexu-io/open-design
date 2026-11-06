// @vitest-environment jsdom
/**
 * 发送失败时那颗「重试」必须**看得见**(交付稿组件 1 · 第 49 / 50 / 51 格)。
 *
 * ## 这一条要挡的是什么
 *
 * 稿子把「藏」写在**孩子**身上,并且把重试排除在外:
 *
 *     .msg-act .tm,
 *     .msg-act button:not(.keep) { opacity: 0; pointer-events: none; … }
 *     .msg-row:hover .msg-act .tm,
 *     .msg-row:hover .msg-act button:not(.keep) { opacity: 1; pointer-events: auto; }
 *
 * 产品把它写在了**父级**身上(`.msg.user .user-actions { opacity: 0 }`),
 * 于是整行连着重试一起被藏掉 —— 消息没发出去,屏幕上什么都不出,
 * 得先把鼠标移上去才知道有这么一颗按钮。而 `ChatPane.tsx` 那颗按钮旁边的注释
 * 写的正是「不跟着 hover 出没」,**代码意图和 CSS 互相打架**。
 *
 * ## 尺子:为什么量的是「祖先连乘」而不是按钮自己的 opacity
 *
 * `opacity` **不继承**,它建的是合成组:父级 0 的时候孩子自己仍然算出 `1`,
 * 但屏幕上什么都没有。所以直接 `getComputedStyle(retry).opacity` 会读到 `1`,
 * 是一个**永远绿的假读数** —— 实测过:修之前它就是 `1`。
 * 判据因此是「从按钮一路乘到消息根」的**有效不透明度**,两端都钉死字面值:
 * 重试 `1`、时间与复制 `0`。不断言「两者相等」——都算成 `auto` / 同值时那种
 * 断言永远通过。
 *
 * 层叠按 `index.css` 的**真实导入顺序**整条注入(`readExpandedIndexCss()`),
 * 不是只塞 `chat.css`:本仓在「只 diff CSS 文本、没量层叠」上栽过 11 次,
 * 而 `.user-actions` 这一族在 chat.css 里本来就写了不止一处。
 *
 * hover 档 jsdom 匹配不了伪类,所以把整份表里的 `:hover` 换成一个探针类再注入。
 * `:hover` 与类的特异性同为 (0,1,0),换法不改变任何一场层叠对决,
 * 换完之后读到的仍然是**计算值**。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import { readExpandedIndexCss } from '../../helpers/read-expanded-css';
import type { ChatMessage } from '../../../src/types';

/** hover 档的探针类。`:hover` 与 `.x` 同为 (0,1,0),替换不动层叠。 */
const HOVER_PROBE = 'od-probe-hover';

const INDEX_CSS = readExpandedIndexCss();

function injectStyles(mode: 'rest' | 'hover'): void {
  const style = document.createElement('style');
  style.textContent =
    mode === 'hover' ? INDEX_CSS.replace(/:hover\b/g, `.${HOVER_PROBE}`) : INDEX_CSS;
  style.dataset.odTestSheet = mode;
  document.head.appendChild(style);
}

const failedUser: ChatMessage = {
  id: 'user-send-failed-1',
  role: 'user',
  content: '照这两张图复刻。',
  createdAt: 1_700_000_000_000,
  sendFailed: true,
};

/** 产线 DOM,不手捏 —— 手捏的夹具会和真实结构悄悄分叉。 */
function mountFailedMessage(): void {
  const { container } = render(
    <ChatPane
      messages={[failedUser]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onResendUserMessage={vi.fn()}
      onStop={vi.fn()}
      conversations={[]}
      activeConversationId="conversation-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
    />,
  );
  // 陈列页与产线都把面板挂在 `.app` 下面;少了它,后面几张表根本不参赛。
  const app = document.createElement('div');
  app.className = 'app';
  document.body.appendChild(app);
  app.appendChild(container);
}

/**
 * 从 `el` 一路乘到 `.msg`(含)的有效不透明度。
 *
 * `opacity` 不继承但会层层相乘 —— 这正是本 bug 的形状:按钮自己是 1,
 * 父级是 0,屏幕上是 0。
 */
function effectiveOpacity(el: Element): number {
  let node: Element | null = el;
  let acc = 1;
  while (node) {
    const raw = getComputedStyle(node).opacity;
    const one = raw === '' ? 1 : Number.parseFloat(raw);
    acc *= Number.isNaN(one) ? 1 : one;
    if (node.classList.contains('msg')) break;
    node = node.parentElement;
  }
  return acc;
}

const retryButton = () => screen.getByTestId('user-send-failed');
const copyButton = () => document.querySelector<HTMLElement>('.msg.user .user-copy-btn')!;
const timeStamp = () => document.querySelector<HTMLElement>('.msg.user .user-actions-time')!;

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-od-test-sheet]').forEach((n) => n.remove());
  document.querySelectorAll('.app').forEach((n) => n.remove());
});

describe('这把尺子看得见缺陷', () => {
  beforeEach(() => {
    injectStyles('rest');
    mountFailedMessage();
  });

  it('按钮自己的 opacity 是一个假读数 —— 藏在祖先身上时它照样算 1', () => {
    // 这条不是需求,是**尺子的自证**:如果哪天有人把断言写成
    // `getComputedStyle(retry).opacity`,它在坏掉的实现上也会绿。
    const own = getComputedStyle(retryButton()).opacity;
    expect(own === '' || own === '1').toBe(true);
  });

  it('这行三样东西真的在同一条祖先链上', () => {
    const row = retryButton().parentElement!;
    expect(row.classList.contains('user-actions')).toBe(true);
    expect(copyButton().parentElement).toBe(row);
    expect(timeStamp().parentElement).toBe(row);
  });
});

describe('静止态:重试常驻,时间与复制让位', () => {
  beforeEach(() => {
    injectStyles('rest');
    mountFailedMessage();
  });

  it('重试的有效不透明度是 1 —— 消息一失败就看得见,不用先 hover', () => {
    expect(effectiveOpacity(retryButton())).toBe(1);
  });

  it('重试能点 —— 没有任何一层把它的 pointer-events 关掉', () => {
    expect(getComputedStyle(retryButton()).pointerEvents).toBe('auto');
  });

  it('时间的有效不透明度是 0', () => {
    expect(effectiveOpacity(timeStamp())).toBe(0);
  });

  it('复制的有效不透明度是 0', () => {
    expect(effectiveOpacity(copyButton())).toBe(0);
  });

  it('看不见的那两样点不到 —— 稿子把 pointer-events 一起关了', () => {
    expect(getComputedStyle(timeStamp()).pointerEvents).toBe('none');
    expect(getComputedStyle(copyButton()).pointerEvents).toBe('none');
  });

  it('那一行仍然占着 30px —— 浮出时这一行不跳', () => {
    const row = retryButton().parentElement!;
    expect(getComputedStyle(row).minHeight).toBe('30px');
  });
});

describe('hover 态:时间与复制浮出,重试不变', () => {
  beforeEach(() => {
    injectStyles('hover');
    mountFailedMessage();
    document.querySelector('.msg.user .user-text-wrap')!.classList.add(HOVER_PROBE);
  });

  it('时间浮到 1', () => {
    expect(effectiveOpacity(timeStamp())).toBe(1);
  });

  it('复制浮到 1', () => {
    expect(effectiveOpacity(copyButton())).toBe(1);
  });

  it('浮出来之后点得到', () => {
    expect(getComputedStyle(timeStamp()).pointerEvents).toBe('auto');
    expect(getComputedStyle(copyButton()).pointerEvents).toBe('auto');
  });

  it('重试还是 1 —— 它本来就没藏过,hover 不该是它的开关', () => {
    expect(effectiveOpacity(retryButton())).toBe(1);
  });
});
