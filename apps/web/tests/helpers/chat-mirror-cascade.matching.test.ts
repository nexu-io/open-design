// @vitest-environment jsdom
/**
 * 量尺的第二个零件:**哪几条规则算匹配上了**。
 *
 * ── 和特异性那份的分工 ──────────────────────────────────────────────
 * `chat-mirror-cascade.specificity.test.ts` 校的是「一条规则有多重」。
 * 本份校的是「这条规则到底算不算数」—— 前者算错权重,后者**整条规则错位**,
 * 后者更阴:规则一丢,尺上读成「根本没人声明这个属性」,一条真实的层叠渗漏
 * 就成了假绿;规则一旦错配到别的元素上,又会凭空造出一个不存在的读数。
 *
 * ── 病根 ────────────────────────────────────────────────────────────
 * `matchingBranch` 曾经用裸 `selector.split(',')` 拆选择器列表。可逗号在
 * `:is()` / `:not()` / `:has()` / `:where()` 的括号里**也是合法的**,一刀切下去
 * 就把一条规则剁成了几截残句。残句的下场有三种,三种都错:
 *   ① 抛异常 → 被 `catch` 吞掉 → 这一截没了;
 *   ② jsdom(nwsapi)**宽容地补上右括号** → 悄悄变成一条语义更窄的选择器;
 *   ③ 残句本身**碰巧是一条合法选择器**(`li`、`td`、`.ds-modal-backdrop` …)
 *      → 规则被安到一批**完全无关**的元素上。
 * ③ 最毒:它不报错、不留痕,直接凭空造读数。
 *
 * ── 样本都取自真表,没有合成 ──────────────────────────────────────
 * · `src/styles/viewer/code.css:331` `.markdown-rendered :where(p, li, …) > code`
 *   —— 一条规则同时踩了漏配和误配:该拿的 `<code>` 拿不到,不该拿的 `<li>` 拿到了。
 * · `src/styles/modal-window-drag.css:20-41` `:where(.modal-backdrop, …)::before`
 *   —— 本该只画在 `::before` 上的 56px 拖拽条,漏到了 backdrop 元素自己身上。
 *
 * 全 `src/styles` 里这样的规则共 4 条(另两条声明的属性不在 `expand()` 的
 * 词汇表里,量不出来,见交付说明)。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNSET, createResolver } from './chat-mirror-cascade';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const TARGETS = [
  'padding-top',
  'border-top-width',
  'border-top-style',
  'font-size',
  'height',
] as const;

const CSS = createResolver(
  [read('src/styles/tokens.css'), read('src/styles/base.css'), read('src/styles/viewer/code.css')],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

const MODAL = createResolver(
  [read('src/styles/tokens.css'), read('src/styles/base.css'), read('src/styles/modal-window-drag.css')],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/* ── `code.css:331-339` 的原值(逐字取自真表) ────────────────────────
 * .markdown-rendered :where(p, li, blockquote, th, td, h1…h6) > code {
 *   padding: 0.13em 0.38em;  border: 1px solid …;  font-size: 0.86em;  … }
 * 只挑字面量,不挑 `var()` 背书的那几个 —— 行内 code 的三个 token 定义在
 * code.css 自己的 `:root` 里而不是 tokens/base,`deref` 够不着,拿它们断言
 * 会把「层叠错了」和「变量没解开」两件事混在一起。 */
const INLINE_CODE = { paddingTop: '0.13em', borderWidth: '1px', borderStyle: 'solid', fontSize: '0.86em' };
/** `code.css:296` `.markdown-rendered code { font-size: 12.5px }` —— 被上面那条盖住的底档。 */
const CODE_BASE_FONT = '12.5px';

function markdownTree(): { code: Element; li: Element } {
  document.body.innerHTML = `
    <div class="markdown-rendered">
      <ul><li id="li">前面一段 <code id="code">inline</code></li></ul>
    </div>`;
  return { code: document.getElementById('code')!, li: document.getElementById('li')! };
}

describe('选择器列表按括号深度拆,不是裸 split(",")', () => {
  it('平台前提:jsdom **认得** 这两条完整选择器(否则下面全是空过)', () => {
    const { code, li } = markdownTree();
    const full = '.markdown-rendered :where(p, li, blockquote, th, td, h1, h2, h3, h4, h5, h6) > code';
    expect(code.matches(full), 'jsdom 认不出 :where() 了 —— 先修这里,别改断言').toBe(true);
    expect(li.matches(full)).toBe(false);
  });

  /*
   * 红点一(**漏配**)。`<code>` 的十一条分支里没有一条匹配得上它:
   * `.markdown-rendered :where(p` 被 nwsapi 宽容补括号后只剩 `p` 的语义,
   * `li`/`td`/`h1…h5` 都够不着 `<code>`,`h6) > code` 直接抛异常被吞。
   * 于是这颗行内 code 在尺上**一格内距、一条描边都没有**,字号还掉回被盖住的底档。
   */
  it('该拿的拿得到:`.markdown-rendered` 里的行内 `<code>` 吃到 code.css:331 那条', () => {
    const { code } = markdownTree();
    const got = CSS.resolved(code);
    expect(got['padding-top']).toBe(INLINE_CODE.paddingTop);
    expect(got['border-top-width']).toBe(INLINE_CODE.borderWidth);
    expect(got['border-top-style']).toBe(INLINE_CODE.borderStyle);
    // 同为 (0,1,1) 打平,331 写在 296 后面所以赢 —— 读回底档就是没匹配上
    expect(got['font-size'], `读回 ${CODE_BASE_FONT} 说明 331 那条压根没匹配上`).toBe(
      INLINE_CODE.fontSize,
    );
  });

  /*
   * 红点二(**误配**)。同一条规则拆出来的 `li` 是一条**合法**选择器,
   * 于是这条本该只管 `> code` 的规则被整条安到 `<li>` 上 —— 凭空多出
   * 一份内距、一条描边、一个字号。这一格不报错、不留痕。
   */
  it('不该拿的拿不到:同一棵树里的 `<li>` **不会**被安上行内 code 的那身皮', () => {
    const { li } = markdownTree();
    const got = CSS.resolved(li);
    expect(got['padding-top'], 'code.css:331 漏到 <li> 上了').toBe(UNSET);
    expect(got['border-top-width']).toBe(UNSET);
    expect(got['font-size']).toBe(UNSET);
  });

  /*
   * 红点三(**误配**,另一张表另一种形状)。`:where(…)::before` 的十一个类名
   * 各自被拆成一条裸类选择器,于是本该画在 `::before` 上的 56px 拖拽条
   * 落到了 backdrop 元素**自己**身上。真浏览器里这条规则永远够不着元素本体。
   */
  it('`::before` 的声明不会漏到元素本体上(modal-window-drag.css:20-41)', () => {
    document.body.innerHTML = `<div class="ds-modal-backdrop" id="bd"></div>`;
    const backdrop = document.getElementById('bd')!;
    expect(
      MODAL.resolved(backdrop).height,
      '`:where(…)::before` 的 height 漏到 backdrop 元素本体上了',
    ).toBe(UNSET);
  });

  /*
   * 防真空:上面三条都靠 `resolved()` 读数,而 `resolved()` 只输出 `targets`
   * 里的属性。要是解析器压根没读到 code.css,三条会一起「空过成绿」。
   */
  it('防真空:解析器确实读到了 code.css(否则上面几条会一起假绿)', () => {
    const selectors = CSS.rules.map((r) => r.selector);
    expect(selectors).toContain('.markdown-rendered code');
    expect(selectors).toContain(
      '.markdown-rendered :where(p, li, blockquote, th, td, h1, h2, h3, h4, h5, h6) > code',
    );
  });
});
