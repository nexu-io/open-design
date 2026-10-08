// @vitest-environment jsdom

import { beforeAll, afterEach, describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

/*
 * H3 的 A/B 开关 —— `msg-enter` 入场动画能不能在运行时摘掉。
 *
 * 为什么要这个开关:两次冻结现场里 `.msg.user` / `.msg.assistant` 上都留着
 * `transform: matrix(1,0,0,1,0,0)`(单位矩阵),来源就是 `msg-enter` 的
 * `fill: both` —— 动画跑完把最终 transform 留在了元素上,而那个元素正是内容
 * 不断增高的那一个。这里**只测开关**,不测「摘掉之后冻结是否消失」。
 *
 * ── 为什么敢用 getComputedStyle ──────────────────────────────────
 * 同目录其它样式用例走的是「读 CSS 文本 + 自己解析」,因为 jsdom 不解 `var()`、
 * 不做逻辑属性。但 `animation` 简写这一条 jsdom 是真会层叠的(实测:特异性
 * 高的那条能压过后写的低特异性规则),而这一族要照的恰恰是「最终哪条赢了」——
 * 只断言文本里出现过 `animation: none`,证明不了它真的盖得住 `.msg`。
 *
 * 喂进去的是**整张展开后的 `index.css`**(按产品的 @import 顺序),不是单独一份
 * chat.css —— 这样「后面某张表又把 .msg 的动画写回来了」也照得出来。
 */

const MSG_ENTER_DISABLED_ATTRIBUTE = 'data-od-msg-enter-disabled';

let styleEl: HTMLStyleElement;

beforeAll(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = readExpandedIndexCss();
  document.head.appendChild(styleEl);
});

afterEach(() => {
  document.documentElement.removeAttribute(MSG_ENTER_DISABLED_ATTRIBUTE);
  document.body.innerHTML = '';
});

function renderMessage(role: 'user' | 'assistant'): HTMLElement {
  document.body.innerHTML = `<div class="chat-log"><div class="msg ${role}" id="msg">hi</div></div>`;
  const el = document.getElementById('msg');
  if (!el) throw new Error('fixture did not render');
  return el;
}

describe('H3 开关:msg-enter 入场动画(open-design:disable-msg-enter-animation)', () => {
  it('默认(根节点上没有属性):消息照常跑 msg-enter,并且带 fill: both', () => {
    for (const role of ['user', 'assistant'] as const) {
      const animation = getComputedStyle(renderMessage(role)).animation;
      expect(animation).toContain('msg-enter');
      // `both` 就是把最终 transform 留在元素上的那一半 —— 它必须还在,
      // 否则这个开关就没有可关的东西了。
      expect(animation).toContain('both');
    }
  });

  it('属性挂上之后:两种角色的消息都不再有任何动画', () => {
    document.documentElement.setAttribute(MSG_ENTER_DISABLED_ATTRIBUTE, '1');
    for (const role of ['user', 'assistant'] as const) {
      const animation = getComputedStyle(renderMessage(role)).animation;
      expect(animation).not.toContain('msg-enter');
      expect(animation.trim()).toBe('none');
    }
  });

  it('属性摘掉之后动画立刻回来(A/B 不是单向门)', () => {
    document.documentElement.setAttribute(MSG_ENTER_DISABLED_ATTRIBUTE, '1');
    expect(getComputedStyle(renderMessage('assistant')).animation.trim()).toBe('none');

    document.documentElement.removeAttribute(MSG_ENTER_DISABLED_ATTRIBUTE);
    expect(getComputedStyle(renderMessage('assistant')).animation).toContain('msg-enter');
  });

  it('只掐 .msg 的入场动画,不误伤旁边的动画(加载态还得会动)', () => {
    document.documentElement.setAttribute(MSG_ENTER_DISABLED_ATTRIBUTE, '1');
    document.body.innerHTML =
      '<div class="chat-log"><div class="chat-loading-mark"><span></span></div></div>';
    const dot = document.querySelector<HTMLElement>('.chat-loading-mark span');
    if (!dot) throw new Error('fixture did not render');
    expect(getComputedStyle(dot).animation).toContain('chat-loading-dot');
  });
});
