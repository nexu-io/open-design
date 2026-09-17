/**
 * 执行记录壳**内**的工具行:边框 / 底色 / 圆角一律抹掉 —— 失败行也不例外。
 *
 * 这条只能从**层叠优先级**上守,不能从规则文本上守:
 * 交付稿里两条规则同时命中失败行 ——
 *   `.fold .body.mod-stack > *  { border:0; background:none; … }`   (0,3,0)
 *   `.tool.is-fail              { background: var(--red-bg); … }`   (0,2,0)
 * 前者赢,所以壳里的失败行**只有图标和「失败」两个字是红的**,底是透明的
 * (在真稿上量过:`background: rgba(0,0,0,0)`、`border: 0px none`)。
 *
 * 我搬这条规则时把 `.fold ` 祖先漏掉了,特异性从 (0,3,0) 掉到 (0,2,0),
 * 和 `.tool.fail` 打平之后按源码顺序判 —— 红底就漏了出来,整行铺红。
 * 单测和陈列页都看不出来(它们不算层叠),是产品在真实页面上一眼看出来的。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/components/chat/primitives/record.module.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 只数 (类 + 伪类 + 属性) 那一档 —— 这一族选择器里没有 id,元素名也不参与胜负 */
function classSpecificity(selector: string): number {
  return (selector.match(/\.[A-Za-z0-9_-]+|\[[^\]]+\]|:[a-z-]+(?:\([^)]*\))?/g) ?? []).length;
}

function ruleFor(selector: string): { selector: string; body: string } {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of (m[1] ?? '').split(',')) {
      if (one.split(/\s+/).join(' ').trim() === selector) {
        return { selector, body: (m[2] ?? '').replace(/\s+/g, ' ').trim() };
      }
    }
  }
  throw new Error(`找不到规则:${selector}`);
}

describe('执行记录壳内的层叠', () => {
  it('「抹掉边框底色」那条必须压过失败行的红底', () => {
    const reset = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ sel: (m[1] ?? '').replace(/\s+/g, ' ').trim(), body: (m[2] ?? '') }))
      .find((r) => /\.body\.stack\s*>\s*\*/.test(r.sel) && /background:\s*none/.test(r.body));
    expect(reset, '找不到那条 reset 规则').toBeTruthy();

    const fail = ruleFor('.tool.fail');
    expect(fail.body).toMatch(/background:/);

    // 平手会按源码顺序判,那就不是「规则说了算」而是「谁写在后面说了算」——
    // 必须严格大于。
    expect(classSpecificity(reset!.sel)).toBeGreaterThan(classSpecificity(fail.selector));
  });
});
