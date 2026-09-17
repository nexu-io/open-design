/**
 * Upgrade 那颗按钮的**配色契约**,以及它必须赢得过共享 Button 的 primary。
 *
 * ## 一、契约翻了个面(PR #7170)
 *
 * 旧稿:黑底 + 绿字 —— `--upgrade-ink: #00FF08` 只落在字和那枚闪光上。
 * 新稿:**绿底 + 深字** —— 设计源把这颗变量整个改了名和用途:
 *
 *   - :root { --upgrade-ink: #00FF08 }        →  :root { --upgrade-surface: #00FF08 }
 *   + .up .up-bottom .btn.mod-primary,
 *   + .up .up-bottom .btn.mod-primary:hover { background: var(--upgrade-surface);
 *   +                                          color: var(--upgrade-button-ink) }
 *
 * 也就是说这一颗现在是整张深色卡上**唯一的亮块**:卡面是 #121212,按钮是那支绿,
 * 字反过来用卡面那支深灰。谁是底、谁是墨,和旧稿正好相反 ——
 * 只改一半(比如底改绿了字还是白)得到的是绿底白字,对比度掉到几乎读不出来。
 * 所以底色和墨色两条都要断言,不能只钉一条。
 *
 * ## 二、层叠那一课**没有**过期
 *
 * 用户 2026-08-27 真机量过一次:变量本身是好的,但两条规则**特异性相同**,
 * 靠 import 顺序决胜负 ——
 *   `.button_…`      → `color: var(--bg)`      (0,1,0)  共享 Button primary
 *   `.UpgradeCard_…` → 我们的                   (0,1,0)
 * 同分时后加载的赢,于是绿被刷回白。**文本 diff 照不出来,只有量计算样式才看得见。**
 *
 * 契约翻面之后这一课只增不减:现在要压过去的是 `background` 和 `color` 两条,
 * 而共享 primary 两条都写了(`.primary { background: var(--text-strong); color: var(--bg) }`)。
 * 修法照搬稿子的祖先链 —— 稿子那条是 `.up .up-bottom .btn.mod-primary`,**三个类**。
 *
 * 判据钉在「选择器里带不带祖先」上:CSS Module 的类名带哈希,断言具体像素在 jsdom
 * 里拿不到(`var()` 不解析),而祖先是特异性的来源。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/UpgradeCard.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 只切顶层逗号 —— `:is(.a, .b)` 里的逗号是参数分隔,一刀切会造出假选择器 */
function splitTopLevel(head: string): string[] {
  const out: string[] = [];
  let depth = 0, buf = '';
  for (const ch of head) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

interface Rule { selectors: string[]; body: string }

const rules: Rule[] = CSS.split('}')
  .map((block) => {
    const [head, body] = block.split('{');
    if (body === undefined) return null;
    return {
      selectors: splitTopLevel(head ?? '')
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
      body,
    };
  })
  .filter((r): r is Rule => r !== null && r.selectors.length > 0);

/** 声明落在 `.cta` 上的每一条规则 */
const ctaRules = rules.filter((r) => r.selectors.some((s) => /\.cta\b/.test(s)));
const ctaSelectors = ctaRules.flatMap((r) => r.selectors).filter((s) => /\.cta\b/.test(s));

/** `.cta` 规则里声明了某个属性的那些 */
function ctaRulesDeclaring(prop: string): Rule[] {
  const re = new RegExp(`(^|;)\\s*${prop}\\s*:`, 'm');
  return ctaRules.filter((r) => re.test(r.body));
}

describe('Upgrade 按钮 · 绿是底,不是墨', () => {
  it('确实存在给 .cta 上色的规则 —— 找不到就说明改名了,后面几条会空转', () => {
    expect(ctaSelectors.length).toBeGreaterThan(0);
  });

  it('绿落在 background 上', () => {
    const backgrounds = ctaRulesDeclaring('background');
    expect(backgrounds.length).toBeGreaterThan(0);
    // 那支绿仍然是同一个色号(#00FF08),只是从墨变成了面。
    expect(
      backgrounds.some((r) => /--(?:chat-)?upgrade-(?:surface|ink)/.test(r.body)),
    ).toBe(true);
  });

  it('墨改成深色 —— 不再是那支绿,也不能留着共享 primary 的白', () => {
    const inks = ctaRulesDeclaring('color');
    expect(inks.length).toBeGreaterThan(0);
    expect(inks.some((r) => /--upgrade-button-ink/.test(r.body))).toBe(true);
  });

  it('每一条 .cta 规则都带卡片祖先 —— 不靠 import 顺序取胜', () => {
    for (const s of ctaSelectors) {
      expect(s).toMatch(/\.up\b[\s>]/);
    }
  });

  it('hover 也要写一遍 —— 稿子注释:不覆盖的话鼠标压上去底和墨都会掉回去', () => {
    const hover = ctaRules.filter((r) => r.selectors.some((s) => /:hover/.test(s)));
    expect(hover.length).toBeGreaterThan(0);
    expect(hover.some((r) => /background\s*:/.test(r.body))).toBe(true);
    expect(hover.some((r) => /color\s*:/.test(r.body))).toBe(true);
  });

  it('尺寸换成底排那一档 —— 44px 的触达高度,不再是卡头里那枚 8px 方块', () => {
    // 旧稿这颗单独站在卡头右侧,四边等距 8px。搬到底排后稿子给的是
    // `min-height: 44px; padding: 12px 16px 12px 12px`,而 `.btn` 基底的
    // 固定 36px 高必须先松开,否则 min-height 永远不生效。
    const sized = ctaRulesDeclaring('min-height');
    expect(sized.some((r) => /min-height\s*:\s*44px/.test(r.body))).toBe(true);
    expect(ctaRulesDeclaring('height').some((r) => /(^|;)\s*height\s*:\s*auto/m.test(r.body)))
      .toBe(true);
  });

  it('闪光那枚跟着放大到 20px —— 稿子 `.up .up-bottom .btn svg`', () => {
    expect(CSS).toMatch(/\.up[^{]*\.cta\s+svg[^{]*\{[^}]*width:\s*20px/);
  });
});
