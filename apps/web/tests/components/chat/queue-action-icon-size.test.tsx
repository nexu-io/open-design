// @vitest-environment jsdom
/**
 * 队列行动作键的**最终**尺寸(PR #7170 `components.css`)。
 *
 * 稿子把 `.qops button svg` 从 12 提到 **14**,而手柄 `.grip svg` 留在 12 ——
 * 拖动手柄是「抓手」,动作是「按钮」,两者本来就不该同一号。
 *
 * ## 为什么必须量最终计算样式
 *
 * 队列在 `styles/chat.css` 里被写了**两遍**:前一块(卡片时代那一版)和后面
 * 按稿子还原的覆盖层。两块都声明 `width` / svg 尺寸,而且**后一块把手柄和动作键
 * 并成了一条选择器**。所以「改一个数」这件事在源码上看永远是对的,真正的问题是
 * 层叠走完之后落在元素上的是谁。这里用真实的 `QueuedSendStrip` 渲染 + 把
 * chat.css 整份塞进文档,问 `getComputedStyle` 要答案 —— 不看源码顺序。
 *
 * (jsdom 跑层叠、但不算布局也不解析 `var()`;这里量的都是字面像素值,够用。
 *  真实渲染另有无头 Chrome 复验。)
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

function box(el: Element): { w: string; h: string } {
  const style = getComputedStyle(el);
  return { w: style.width, h: style.height };
}

describe('队列行的动作键尺寸(层叠走完之后)', () => {
  it('动作键的图标是 14,手柄的图标仍是 12', () => {
    renderStrip();
    const handle = document.querySelector('.chat-queued-send-drag-handle svg')!;
    const actions = [...document.querySelectorAll('.chat-queued-send-action svg')];
    expect(actions.length).toBeGreaterThan(0);

    expect(box(handle)).toEqual({ w: '12px', h: '12px' });
    for (const icon of actions) {
      expect(box(icon)).toEqual({ w: '14px', h: '14px' });
    }
  });

  it('动作键的命中框是 22×22,手柄是 16×22 —— 两者不共用一条宽度', () => {
    renderStrip();
    const handle = document.querySelector('.chat-queued-send-drag-handle')!;
    const action = document.querySelector('.chat-queued-send-action')!;
    expect(box(action)).toEqual({ w: '22px', h: '22px' });
    expect(box(handle)).toEqual({ w: '16px', h: '22px' });
  });

  it('动作组定宽,不跟着正文伸缩(稿子 `.qops { flex: none }`)', () => {
    renderStrip();
    const group = document.querySelector('.chat-queued-send-actions')!;
    const style = getComputedStyle(group);
    expect(`${style.flexGrow} ${style.flexShrink}`).toBe('0 0');
  });

  /*
   * 只对齐视觉,不动能力:队列今天比稿子那一行**更全**(可编辑、可重排、
   * 可引导当前回合、可立即发送)。图标改大一号绝不能顺手把哪一颗按钮拿掉。
   */
  it('三颗动作一颗不少:编辑 / 移除 / 引导(或退回立即发送)', () => {
    renderStrip({ onSteer: () => {} });
    expect(document.querySelectorAll('.chat-queued-send-action').length).toBe(3);
    expect(screen.getByTestId('chat-queued-send-steer')).toBeTruthy();

    cleanup();
    renderStrip();
    expect(document.querySelectorAll('.chat-queued-send-action').length).toBe(3);
    expect(screen.getByTestId('chat-queued-send-now')).toBeTruthy();
  });
});
