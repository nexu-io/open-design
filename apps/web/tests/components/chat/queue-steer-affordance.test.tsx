// @vitest-environment jsdom
/**
 * 队列行领头那颗按钮的**可辨识度**(稿子 `.qops button.mod-steer`)。
 *
 * ## 缺的是什么
 *
 * 这颗曾经和编辑 / 移除长得**一模一样**:同一个 `arrow-up` 图标、同样的
 * 22×22 命中框,自己叫什么只藏在 tooltip 里。稿子给「引导对话」配了
 * **文字标签**(`<svg/><span>引导对话</span>`),正是为了让这一行把它说出来。
 *
 * 这一页原来还量「两副面孔在屏幕上不再是同一个东西」—— 那个分叉
 * (有一轮可中断画「引导对话」,没有则退回无标签的「立即发送」)已经在
 * 2026-09-08 被产品裁掉,两边喂的本来就是同一个回调。剩下的量法不变:
 * 带标签那一颗的宽度必须放开,其余动作键仍是 22px。
 *
 * ## 为什么量最终计算样式
 *
 * `styles/chat.css` 里队列被写了两遍:前一块(约 2440 行)和按稿子还原的覆盖层
 * (约 3620 行)。两块都声明 `width`,同优先级,后者只靠源码顺序赢。带标签的
 * `width: auto` 必须排在覆盖层**之后**才落得到元素上 —— 源码里看着写对了、
 * 层叠走完却输掉,是这个文件的常态。所以这里问 `getComputedStyle` 要答案,
 * 而且钉的是**字面值**(`'auto'` / `'22px'`),不是「和另一颗相等」:
 * 两边都算出 `auto` 时那种断言永远通过,照不出任何回归。
 *
 * (jsdom 跑层叠、不算布局也不解析 `var()`;这里量的都是字面值,够用。)
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { QueuedSendStrip } from '../../../src/components/ChatPane';

const CHAT_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/chat.css'),
  'utf-8',
);

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = CHAT_CSS;
  document.head.appendChild(style);
});

afterEach(cleanup);

function renderStrip(overrides: Partial<Parameters<typeof QueuedSendStrip>[0]> = {}) {
  render(
    <I18nProvider>
      <QueuedSendStrip
        items={[{ id: 'q1', prompt: '把首屏文案改短一点' }]}
        onEdit={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onSendNow={() => {}}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe('队列行的「引导对话」可供性', () => {
  it('它自己说出名字:按钮里有可见文字,编辑 / 移除仍旧只有图标', () => {
    renderStrip();
    const steer = screen.getByTestId('chat-queued-send-steer');
    // 稿子 `<svg/><span>引导对话</span>` —— 图标之外还有一段**可见**文字。
    // 钉的是「屏幕上写着它的名字」,所以只认非空(语言由 locale 决定,
    // 写死某一种语言的字面量只会在换语言时假红)。
    const label = steer.textContent?.trim() ?? '';
    expect(label.length).toBeGreaterThan(0);
    // 无障碍名和屏幕上那行字**逐字相同**(稿子 `aria-label="引导对话"
    // data-tip="引导对话"`)。屏幕写一句、读屏念另一句是 WCAG 2.5.3
    // (Label in Name)那一条;这里连「以它起手」都不够,要求相等。
    expect(steer.getAttribute('aria-label')).toBe(label);

    // 反向对照:同一行里另外两颗按钮一个字都没有,所以「有文字」确实是
    // 这一颗独有的可供性,不是队列行里人人都有。
    const others = [...document.querySelectorAll('.chat-queued-send-action')].filter(
      (el) => el !== steer,
    );
    expect(others.length).toBe(2);
    for (const el of others) {
      expect(el.textContent?.trim()).toBe('');
    }
  });

  it('带标签的那一颗拿到自己的类名', () => {
    renderStrip();
    const steer = screen.getByTestId('chat-queued-send-steer');
    expect(steer.classList.contains('chat-queued-send-action')).toBe(true);
    expect(steer.classList.contains('chat-queued-send-action-steer')).toBe(true);

    // 这个类名是**独占**的:编辑 / 移除拿到它就会跟着变成宽度放开的形态。
    const others = [...document.querySelectorAll('.chat-queued-send-action')].filter(
      (el) => el !== steer,
    );
    for (const el of others) {
      expect(el.classList.contains('chat-queued-send-action-steer')).toBe(false);
    }
  });

  it('层叠走完:带标签的那一颗宽度放开,其余动作键仍是 22px', () => {
    renderStrip();
    const steer = screen.getByTestId('chat-queued-send-steer');
    const steerStyle = getComputedStyle(steer);
    // 稿子 `.qops button.mod-steer { width: auto; padding: 0 4px }` —— 覆盖层
    // (约 3620 行)的 `width: 22px` 必须被这一条压掉,否则标签被裁掉一半。
    expect(steerStyle.width).toBe('auto');
    // 纯图标形态下盒子不能比别的动作键小,所以留一条地板。
    expect(steerStyle.minWidth).toBe('22px');
    expect(steerStyle.display).toBe('inline-flex');
    expect(steerStyle.gap).toBe('4px');
    expect(steerStyle.paddingLeft).toBe('4px');
    expect(steerStyle.paddingRight).toBe('4px');
    expect(steerStyle.paddingTop).toBe('0px');
    expect(steerStyle.paddingBottom).toBe('0px');
    expect(steerStyle.whiteSpace).toBe('nowrap');
    // `height: 22px` 只在前一块(约 2440 行)声明过,覆盖层没有重复它 ——
    // 新规则不许把它带走,否则整行高度跟着塌。
    expect(steerStyle.height).toBe('22px');

    // 编辑 / 移除两颗一个字都不许动。
    const others = [...document.querySelectorAll('.chat-queued-send-action')].filter(
      (el) => !el.classList.contains('chat-queued-send-action-steer'),
    );
    expect(others.length).toBe(2);
    for (const el of others) {
      const style = getComputedStyle(el);
      expect(style.width).toBe('22px');
      expect(style.height).toBe('22px');
    }
  });

  it('图标仍在,而且仍是 14px —— 标签是加出来的,不是换掉图标', () => {
    renderStrip();
    const icon = screen.getByTestId('chat-queued-send-steer').querySelector('svg');
    expect(icon).not.toBeNull();
    const style = getComputedStyle(icon!);
    expect(style.width).toBe('14px');
    expect(style.height).toBe('14px');
  });
});
