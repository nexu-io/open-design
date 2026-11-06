// @vitest-environment jsdom
/**
 * 回合状态行右端的时间(设计稿 15-1)。
 *
 * 两个真实的失败点,都不是「样式没写」:
 *  ① 时间只传给了「没有反馈按钮」那条分支 —— 而**常见路径是有反馈按钮的那条**,
 *     它走 `{...footerProps}`,漏一个字段就整块不出。
 *  ② 就算传到了,外层若是 `inline-flex + max-width`,整行只有两百来像素,
 *     中间的弹簧撑不开,时间贴不到右端 —— 「满宽」这条得由 CSS 保证。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, '../../../src/components/AssistantMessage.tsx'), 'utf-8');
// 注释里出现的字样不算数(这条规则的注释里正好解释了为什么去掉 max-width)
const CSS = readFileSync(resolve(here, '../../../src/styles/viewer/theater.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('回合状态行的时间', () => {
  it('两条分支都要把 createdAt 传下去 —— 有反馈按钮的那条才是常见路径', () => {
    const inFooterProps = /footerProps=\{\{[\s\S]*?\}\}/.exec(SRC)?.[0] ?? '';
    expect(inFooterProps, 'footerProps 里没有 createdAt').toContain('createdAt');
  });

  it('这一行要能撑满,时间才贴得到右端', () => {
    // 外层若限宽,弹簧就没有空间可撑
    const wrap = /\.assistant-feedback-wrap\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(wrap, '外层还限着宽,时间贴不到右端').not.toMatch(/max-width/);
  });
});
