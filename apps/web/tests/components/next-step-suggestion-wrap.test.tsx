// @vitest-environment jsdom
/**
 * OPEND-2558 之二:长建议必须**完整显示**,不许压成一行截掉。
 *
 * 现场(Plane 附件 `OPEND-2558-01-84bd24c7.png`):第二条被裁成
 * 「把文案和品牌信息替换成我的产品,保持 Ateli…」。行文字本身就是点下去要
 * 发出的那句话 —— 读不全就没法判断要不要点,截断等于把这一块的用途拿掉。
 *
 * 产品裁决:**换行**(不是两行 clamp,也不是 tooltip)。所以这里锁的是
 * 「压成一行」这件事本身被拆干净,而且**没有行数上限**。
 *
 * ## 截断有两个来源,都要堵
 *
 *  1. 组件自己:`.suggestionText` 的 `white-space: nowrap` + `text-overflow: ellipsis`
 *     —— 稿子 `.nexts button` 从来没有这两条;
 *  2. 全局泄漏:`styles/primitives.css` 的 `button { white-space: nowrap;
 *     height: 36px; line-height: 1; justify-content: center }`。稿子自己的
 *     button 复位(`components.css:170`)这四条**一条都没有**。
 *     全局那条对真正的单行按钮是对的,所以复位落在**组件这一层**,不动原语。
 *
 * ## 为什么必须注入 primitives.css
 *
 * 上一轮的教训:只注入 CSS Module 会量到一个不存在的产品(见
 * `next-step-suggestion-weight.test.tsx` 抬头)。这里按产品里的真实顺序铺全。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const GLOBAL_BUTTON_CSS = readFileSync(resolve(SRC, 'styles/primitives.css'), 'utf-8');
const MODULE_CSS = readFileSync(
  resolve(SRC, 'components/NextStepActions.module.css'),
  'utf-8',
);

/** 现场那条真的被截掉的建议。 */
const LONG = '把文案和品牌信息替换成我的产品,保持 Atelier 那一版的排版节奏和留白';

const MARKUP = `
  <div class="root">
    <div class="suggestions">
      <button type="button" class="suggestionRow" id="row">
        <svg viewBox="0 0 24 24"></svg><span class="suggestionText" id="text">${LONG}</span>
      </button>
    </div>
  </div>`;

beforeEach(() => {
  document.head.innerHTML = '';
  for (const css of [GLOBAL_BUTTON_CSS, MODULE_CSS]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
  document.body.innerHTML = MARKUP;
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

const row = () => getComputedStyle(document.getElementById('row')!);
const text = () => getComputedStyle(document.getElementById('text')!);

describe('下一步建议的长文案(OPEND-2558)', () => {
  it('行本身允许换行 —— 全局按钮的 nowrap 在组件这一层被复位', () => {
    expect(row().whiteSpace).not.toBe('nowrap');
  });

  it('文字层不再压一行、不再省略号', () => {
    expect(text().whiteSpace).not.toBe('nowrap');
    expect(text().textOverflow).not.toBe('ellipsis');
    expect(text().overflow).not.toBe('hidden');
  });

  it('行高自适应 —— 固定 36px 会把第二行裁掉', () => {
    expect(row().height).not.toBe('36px');
  });

  it('多行不挤在一起:行高走稿子的 --lh-row(1.5),不是全局按钮的 1', () => {
    expect(row().lineHeight).toBe('1.5');
  });

  it('多行顶对齐、左对齐 —— 箭头跟着第一行走,不飘到两行中间', () => {
    expect(row().justifyContent).not.toBe('center');
    expect(row().alignItems).not.toBe('center');
  });

  /*
   * 产品原话是「换行」,不是 clamp。所以**不许**有行数上限 ——
   * 这一条守住的是「别顺手又加回 `-webkit-line-clamp`」。
   */
  it('不设行数上限', () => {
    expect(MODULE_CSS).not.toMatch(/line-clamp/);
  });
});
