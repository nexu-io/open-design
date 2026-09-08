// @vitest-environment jsdom
/**
 * 失败卡那一排三颗按钮**必须同一副壳**。
 *
 * 用户 2026-08-27:「这个按钮圆角明显跟别的不一样呢,你看看设计稿呢?」+「1:1 还原」。
 * 真机量到:
 *   联系支持  radius 999px  padding 4px 11px   ← 共享 `Button size="sm"`
 *   导出日志  radius 999px  padding 4px 11px   ← 共享 `Button size="sm"`
 *   重试      radius  4px   padding 6px 14px   ← 裸 `<button class="chat-error-action">`
 *
 * 稿子对这一排的规定(`chat-panel-next.html:3360-3377`):
 *   `.btn { padding: 6px 14px; border-radius: var(--radius-pill); font-weight: 600 }`
 *   `.btn.mod-sm { padding: 4px 11px; font-size: var(--t-mini) }`
 *   `.btn.mod-primary { background: var(--text-strong); color: var(--bg) }`
 * —— 三颗都是 `.btn`,差别只在 primary / secondary 和有没有 `mod-sm`。
 * 我们那颗重试压根没走这条路,所以圆角、内距、字重全都自成一套。
 *
 * 判据钉在「**用的是不是同一个原语**」上,不钉具体像素:
 * CSS Module 的类名带哈希,jsdom 也不解析 `var()`,量像素只会得到空值。
 * 同一个原语 ⇒ 同一套 radius/padding,这是共享组件的全部意义。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button } from '@open-design/components';

afterEach(cleanup);

/** 共享 Button 在 `size="sm"` 下渲染出来的类名指纹 */
function buttonFingerprint(): string[] {
  render(<Button variant="primary" size="sm">probe</Button>);
  const el = screen.getByText('probe').closest('button')!;
  return String(el.className).trim().split(/\s+/);
}

describe('失败卡三颗按钮同壳', () => {
  it('共享 Button 的类名指纹里有可辨认的前缀 —— 后面几条靠它比对', () => {
    const fp = buttonFingerprint();
    expect(fp.length).toBeGreaterThan(0);
    expect(fp.some((c) => /button/i.test(c))).toBe(true);
  });

  it('源码里那颗重试**不能**是裸 button', () => {
    const src = readChatPane();
    // 裸 button + 手写类名 = 自成一套壳,正是这次的病灶
    expect(src).not.toMatch(/className="chat-error-action chat-error-retry"/);
  });

  /*
   * ⚠️ 这条判据翻过两次,但这份文件真正要守的东西没变:**同一副壳、同一套
   * radius/padding**。
   *
   * OPEND-2772(T68)让重试不再写死 primary;OPEND-2807 把卡收成三颗之后,
   * 第三颗只在**跑在 Cloud 上**时是重试(BYOK 那一侧是〔切换到 Cloud〕),
   * 两者互斥,所以重试重新写死 `variant="primary"` —— 它就是这张卡的那颗 CTA。
   *
   * 「恰好三颗、且是哪三颗」由 `opend-2807-error-card-three-actions.test.tsx` 钉。
   */
  it('重试要走报错卡动作组件,而且是这张卡的那颗主按钮', () => {
    const src = readChatPane();
    const near = sliceAround(src, "promptTemplates.retry");
    expect(near).toMatch(/<RunErrorCardAction/);
    expect(near).toMatch(/variant="primary"/);
    // 三颗按钮的第三颗由「跑在不在 Cloud 上」二选一,别的判据一律不许再插进来
    expect(src).toMatch(/const showRetryCta = !showCloudSwitchCta;/);
  });

  it('旁边两颗同样走报错卡动作组件 —— 尺寸不再由调用方各写一份', () => {
    const src = readChatPane();
    const near = sliceAround(src, 'chat-error-contact-support');
    expect(near).toMatch(/<RunErrorCardAction/);

    const actionSrc = readRunErrorCard();
    expect(actionSrc).toMatch(/<Button[\s\S]*size="sm"/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readChatPane(): string {
  return readFileSync(resolve(__dirname, '../../../src/components/ChatPane.tsx'), 'utf8');
}

function readRunErrorCard(): string {
  return readFileSync(resolve(__dirname, '../../../src/components/chat/RunErrorCard.tsx'), 'utf8');
}

/** 取某个锚点前后各 700 字符 —— 断言只看那一颗按钮,不被全文件干扰 */
function sliceAround(src: string, anchor: string): string {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error(`anchor not found: ${anchor}`);
  return src.slice(Math.max(0, i - 700), i + 200);
}
