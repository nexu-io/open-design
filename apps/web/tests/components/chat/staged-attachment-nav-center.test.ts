/**
 * 附件托盘的翻页箭头必须**跟卡片那一行垂直居中**。
 *
 * 产品的原话:「这个怎么靠顶了,不是应该在附件那一行垂直居中吗」。
 *
 * 真机量过(headless Chrome + CDP,真 CSS 真 DOM):圆片中心 y=39,卡片中心
 * y=53.5 —— **高了 14.5px**,肉眼就是贴着顶。根因不在 `align-items`,那一行写着
 * `align-items: center`;根因是 **`inset-block: 0` 撑不开一个 `<button>`**:
 * Chrome 仍按内容给它 36px 的高(托盘是 62px),然后把这 36px 钉在 `top: 0`。
 * 于是箭头只占了上半截 —— 连它那段用来盖住半张卡的渐变也只盖了上半截。
 *
 * 所以要显式要一个高度。给了高度之后还差最后 1.5px:托盘那一行的上下内边距
 * 是不对称的(`4px … 1px`),箭头压在它上面,不跟着padding的话「居中」会落在
 * 卡片带的上方 1.5px。所以箭头得**照抄托盘的纵向内边距**。
 *
 * jsdom 排不出版,但这两笔账能算,而且都是可证伪的:
 *   · 没有显式高度 → 回到 36px 贴顶那个 bug;
 *   · 两处纵向 padding 对不上 → 「居中」就不在卡片带的中线上。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 注释里带着 `.att-nav { display: none }` 这种示例,先剥掉再当 CSS 解析,
// 否则示例里的花括号会把规则切错位置。
const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/chat.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 这个选择器**实际吃到**的所有声明,按源码顺序接起来。
 *
 * 不能只找「第一条写着这个选择器的规则」:同一个选择器会同时出现在共享的
 * 那条选择器列表里、和后面单独收窄的那条里,两者特异性相同、后写的赢。
 * 只看前一条会把后一条的修正整个漏掉。
 */
function declarationsFor(selector: string): string {
  const bodies: string[] = [];
  for (const [, selectorList, body] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (selectorList ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) bodies.push(body ?? '');
  }
  expect(bodies.length, `找不到 ${selector} 的规则`).toBeGreaterThan(0);
  return bodies.join('\n');
}

/**
 * 这个选择器最终吃到的纵向内边距 [上, 下]。`padding` 和 `padding-block`
 * 都算,后写的赢 —— 跟浏览器一样。
 */
function blockPadding(body: string): [string, string] {
  let out: [string, string] | null = null;
  for (const [, prop, value] of body.matchAll(/(?:^|[;{\s])(padding|padding-block):\s*([^;]+);/g)) {
    const parts = (value ?? '').trim().split(/\s+/);
    if (prop === 'padding-block') {
      out = [parts[0]!, parts[1] ?? parts[0]!];
    } else if (parts.length <= 2) {
      out = [parts[0]!, parts[0]!];
    } else {
      out = [parts[0]!, parts[2]!];
    }
  }
  expect(out, '这条规则既没有 padding 也没有 padding-block').not.toBeNull();
  return out!;
}

describe('附件托盘的翻页箭头', () => {
  it('显式要一个高度 —— inset-block 撑不开 button', () => {
    const body = declarationsFor('.composer-att-wrap .msg-att-nav');
    // 绝对定位 + 上下贴边仍然是对的,只是它不够。
    expect(body, '箭头要浮在这一行上面,不挤占布局').toMatch(/position:\s*absolute/);
    expect(body).toMatch(/inset-block:\s*0/);
    // 这一条才是修复本身:Chrome 不会用 top/bottom 把 <button> 拉开,
    // 少了它箭头就退回 36px 贴顶(真机量到高了 14.5px)。
    expect(
      body,
      'inset-block:0 撑不开 <button>,必须显式给高度,否则箭头贴顶、渐变也只盖半截',
    ).toMatch(/(?:^|[;\s])(?:block-size|height):\s*100%/);
    // 圆片靠 flex 居中,这一条不能丢。
    expect(body).toMatch(/align-items:\s*center/);
  });

  it('箭头照抄托盘那一行的纵向内边距,居中才落在卡片带上', () => {
    const row = blockPadding(declarationsFor('.composer-att'));
    const nav = blockPadding(declarationsFor('.composer-att-wrap .msg-att-nav'));
    // 托盘的上下内边距本来就不对称(4px / 1px)。箭头压在它上面,
    // 不跟着抄,"居中"就会落在卡片带中线的上方。
    expect(nav, `托盘是 ${row.join(' / ')},箭头是 ${nav.join(' / ')} —— 对不上就不在一条中线上`)
      .toEqual(row);
  });
});
