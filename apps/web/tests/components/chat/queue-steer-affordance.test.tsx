// @vitest-environment jsdom
/**
 * 队列行第三颗按钮的**可辨识度**(稿子 `.qops button.mod-steer`)。
 *
 * ## 缺的是什么
 *
 * 第三颗按钮有两副面孔:能引导当前回合时它是「引导对话」(消息塞进正在跑的那一轮,
 * 一个字都不打断),不能引导时它退回「立即发送」(先停掉在跑的那一轮再发)。
 * 两条路在 `ProjectView` 里是**完全不同的两件事** —— 一条走 `steerChatRun`,
 * 一条走 `handleStop()` + 重排队列。
 *
 * 而这两副面孔在屏幕上曾经**一模一样**:同一个 `arrow-up` 图标、同样的 22×22 命中框,
 * 差别只藏在 tooltip 里。更糟的是这两颗**永不同时出现**(三元式二选一),
 * 所以用户连「和旁边那颗比一比」的机会都没有 —— 他没有任何办法知道按下去是
 * 「插一句」还是「掐掉重来」。稿子给「引导对话」配了**文字标签**,
 * 正是为了让这一行自己说出它现在是哪一副面孔。
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
  it('引导态自己说出名字:按钮里有可见文字,退回态没有', () => {
    renderStrip({ onSteer: () => {} });
    const steer = screen.getByTestId('chat-queued-send-steer');
    // 稿子 `<svg/><span>引导对话</span>` —— 图标之外还有一段**可见**文字。
    // 钉的是「屏幕上写着它的名字」,所以只认非空(语言由 locale 决定,
    // 写死某一种语言的字面量只会在换语言时假红)。
    const label = steer.textContent?.trim() ?? '';
    expect(label.length).toBeGreaterThan(0);
    // OPEND-2602 之后无障碍名换成了 hover 那句「会中断当前运行」,不再和可见
    // 文字逐字相等。但它必须**以可见文字起手** —— 屏幕上写着「引导对话」、
    // 读屏念出来的却完全是另一句话,是 WCAG 2.5.3(Label in Name)那一条。
    const accessibleName = steer.getAttribute('aria-label') ?? '';
    expect(accessibleName.startsWith(label)).toBe(true);
    expect(accessibleName.length).toBeGreaterThan(label.length);

    cleanup();
    renderStrip();
    // 退回态是普通的「立即发送」,稿子里它和编辑 / 移除一样只有图标。
    const sendNow = screen.getByTestId('chat-queued-send-now');
    expect(sendNow.textContent?.trim()).toBe('');
  });

  it('两副面孔在屏幕上不再是同一个东西', () => {
    renderStrip({ onSteer: () => {} });
    const steerLabel = screen.getByTestId('chat-queued-send-steer').textContent?.trim() ?? '';
    cleanup();
    renderStrip();
    const sendNowLabel = screen.getByTestId('chat-queued-send-now').textContent?.trim() ?? '';
    expect(steerLabel).not.toBe(sendNowLabel);
  });

  it('带标签的那一颗拿到自己的类名', () => {
    renderStrip({ onSteer: () => {} });
    const steer = screen.getByTestId('chat-queued-send-steer');
    expect(steer.classList.contains('chat-queued-send-action')).toBe(true);
    expect(steer.classList.contains('chat-queued-send-action-steer')).toBe(true);

    cleanup();
    renderStrip();
    expect(
      screen.getByTestId('chat-queued-send-now').classList.contains('chat-queued-send-action-steer'),
    ).toBe(false);
  });

  it('层叠走完:带标签的那一颗宽度放开,其余动作键仍是 22px', () => {
    renderStrip({ onSteer: () => {} });
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

  it('退回态的那一颗完全没被新规则碰到', () => {
    renderStrip();
    const sendNow = screen.getByTestId('chat-queued-send-now');
    const style = getComputedStyle(sendNow);
    expect(style.width).toBe('22px');
    expect(style.height).toBe('22px');
  });

  it('图标仍在,而且仍是 14px —— 标签是加出来的,不是换掉图标', () => {
    renderStrip({ onSteer: () => {} });
    const icon = screen.getByTestId('chat-queued-send-steer').querySelector('svg');
    expect(icon).not.toBeNull();
    const style = getComputedStyle(icon!);
    expect(style.width).toBe('14px');
    expect(style.height).toBe('14px');
  });
});
