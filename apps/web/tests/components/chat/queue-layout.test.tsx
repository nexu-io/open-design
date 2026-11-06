// @vitest-environment jsdom
/**
 * 队列那一行的**排版模型**。
 *
 * 原来这一行是栅格,这条用例守的是「声明的轨道数 ≥ 实际孩子数」——
 * 少一条轨道,多出来的那个孩子会掉到下一行,或者把中间列撑成几百像素。
 *
 * 现在按稿子换成了 flex(`.queue .q { display: flex; align-items: flex-start; gap: 8px }`)。
 * 失效模式跟着换了形状:flex 默认不换行,危险变成「正文那一段没声明 flex:1,
 * 被旁边几个定宽的孩子挤扁」。所以判据也跟着换 —— 行是 flex、不换行,
 * 而正文是**唯一**会伸缩的那一段。
 *
 * 这一条仍然不测像素:jsdom 算不出布局,但这笔账能算。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/chat.css'),
  'utf-8',
);

/** 取某个选择器**第一条**规则体(本文件里这几个类都只有一处声明这些属性) */
function ruleBody(selector: string): string {
  const re = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`);
  const hit = re.exec(CSS);
  expect(hit, `找不到 ${selector} 的规则`).not.toBeNull();
  return hit?.[1] ?? '';
}

/** 取某个选择器**最后一条**规则体 —— 稿子那一块(`.queue .q`)排在文件尾部,
 *  内距 / 间距由它说了算。 */
function lastRuleBody(selector: string): string {
  const re = new RegExp(`(?:^|\\n)\\${selector}\\s*\\{([^}]*)\\}`, 'g');
  let last: string | undefined;
  for (const hit of CSS.matchAll(re)) last = hit[1];
  expect(last, `找不到 ${selector} 的规则`).toBeDefined();
  return last ?? '';
}

describe('队列行的排版', () => {
  it('按稿子走 flex,而且不换行', () => {
    const body = ruleBody('.chat-queued-send-row');
    expect(body, '这一行应当是 flex(稿子 `.queue .q`)').toMatch(/display:\s*flex/);
    expect(body, 'flex 默认就不换行;显式 wrap 会让多出来的孩子掉到下一行').not.toMatch(
      /flex-wrap:\s*wrap/,
    );
  });

  it('只有正文那一段伸缩,手柄 / 动作都定宽', () => {
    expect(ruleBody('.chat-queued-send-main'), '正文要吃掉剩余宽度').toMatch(/flex:\s*1/);
    expect(ruleBody('.chat-queued-send-drag-handle'), '手柄定宽').toMatch(/flex:\s*0 0 auto/);
    expect(ruleBody('.chat-queued-send-actions'), '动作定宽').toMatch(/flex:\s*0 0 auto/);
  });

  /* K1(参照 #8165 提交 1):队列行紧凑成 `gap: 4px; padding: 6px 4px`,
     序号那一格连同 `.chat-queued-send-index` 规则一起去掉。 */
  it('行是紧凑内距,没有序号那一格', () => {
    const body = lastRuleBody('.chat-queued-send-row');
    expect(body).toMatch(/gap:\s*4px/);
    expect(body).toMatch(/padding:\s*6px 4px/);
    expect(CSS).not.toMatch(/\.chat-queued-send-index/);
  });
});
