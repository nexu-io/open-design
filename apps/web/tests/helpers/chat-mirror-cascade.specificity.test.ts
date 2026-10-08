/**
 * 给量尺本身做的校准 —— `chat-mirror-cascade.ts` 的 `specificity()`。
 *
 * ── 为什么这一份必须存在 ────────────────────────────────────────────
 * chat-mirror 一族的判据全都是「哪条规则最终赢了」,而「赢」由特异性决定。
 * 量尺自己算错一格,会**同时**造两种事故:
 *   · 假红:一条在真浏览器里正确的规则被判成压不过 → 有人去改本来对的产品代码;
 *   · 假绿:一条真实的层叠渗漏被判成压得过 → bug 留在线上,测试还报平安。
 * 所以量尺不能只被间接使用,必须自己被喂**规范里有明确答案**的选择器。
 *
 * ── 判据出处(逐条标注,不自造) ────────────────────────────────────
 * [S15]  Selectors Level 4 §15 Calculating a selector's specificity
 *        https://drafts.csswg.org/selectors-4/#specificity-rules
 *        · count the number of ID selectors in the selector (= A)
 *        · count the number of class selectors, attributes selectors, and
 *          pseudo-classes in the selector (= B)
 *        · count the number of type selectors and pseudo-elements in the
 *          selector (= C)
 *        · ignore the universal selector
 * [S15-ctx] 同节「A few pseudo-classes provide "evaluation contexts"」:
 *        · The specificity of an :is(), :not(), or :has() pseudo-class is
 *          replaced by the specificity of the most specific complex selector
 *          in its selector list argument.
 *        · Analogously, the specificity of an :nth-child() or
 *          :nth-last-child() selector is the specificity of the pseudo-class
 *          itself (counting as one pseudo-class selector) plus the specificity
 *          of the most specific complex selector in its selector list
 *          argument (if any).
 *        · The specificity of a :where() pseudo-class is replaced by zero.
 * [S15-ex] 同节两个示例块(下面 §规范原样例 两组逐字照抄,一个字没改)。
 * [S15-list] 同节:「If the selector is a selector list, this number is
 *        calculated for each selector in the list. For a given matching
 *        process against the list, the specificity in effect is that of the
 *        most specific selector in the list that matches.」
 * [S15-cmp] 同节:三元组按 A → B → C 逐位比较。
 * [P4-8] CSS Pseudo-Elements Level 4 §8 Compatibility Syntax
 *        https://drafts.csswg.org/css-pseudo-4/#compat
 *        「user agents must also accept the previous one-colon notation
 *         (:before, :after, :first-letter, :first-line) for the ::before,
 *         ::after, ::first-letter, and ::first-line pseudo-elements.」
 *        → 单冒号的这四个是**伪元素**,按 [S15] 落在 C,不是 B。
 *
 * ── 量法 ────────────────────────────────────────────────────────────
 * `specificity()` 对外给的是打包好的整数(A·10000 + B·100 + C),因为层叠
 * 排序只需要一个可比的标量。本文件把它拆回三元组再断言 —— 断言写成
 * `(A,B,C)` 才对得上规范原文,失败时也一眼看得出错在哪一格。
 */
import { describe, expect, it } from 'vitest';
import { specificity } from './chat-mirror-cascade';

/**
 * 把 `specificity()` 打包的整数拆回 `(A, B, C)`。
 * 进制照 helper 自己的 `A * 10_000 + B * 100 + C`。
 */
function abc(selector: string): [number, number, number] {
  const n = specificity(selector);
  return [Math.floor(n / 10_000), Math.floor((n % 10_000) / 100), n % 100];
}

/** 表驱动:每行一条选择器 + 规范给的三元组 + 依据。 */
function table(rows: ReadonlyArray<readonly [string, [number, number, number], string]>): void {
  for (const [selector, expected, why] of rows) {
    it(`${selector}  →  (${expected.join(',')})   [${why}]`, () => {
      expect(abc(selector)).toEqual(expected);
    });
  }
}

describe('规范原样例:§15 第二个示例块(逐字照抄,含注释里的 a/b/c)', () => {
  table([
    ['*', [0, 0, 0], 'S15-ex  /* a=0 b=0 c=0 */'],
    ['LI', [0, 0, 1], 'S15-ex  /* a=0 b=0 c=1 */'],
    ['UL LI', [0, 0, 2], 'S15-ex  /* a=0 b=0 c=2 */'],
    ['UL OL+LI', [0, 0, 3], 'S15-ex  /* a=0 b=0 c=3 */'],
    ['H1 + *[REL=up]', [0, 1, 1], 'S15-ex  /* a=0 b=1 c=1 */'],
    ['UL OL LI.red', [0, 1, 3], 'S15-ex  /* a=0 b=1 c=3 */'],
    ['LI.red.level', [0, 2, 1], 'S15-ex  /* a=0 b=2 c=1 */'],
    ['#x34y', [1, 0, 0], 'S15-ex  /* a=1 b=0 c=0 */'],
    ['#s12:not(FOO)', [1, 0, 1], 'S15-ex  /* a=1 b=0 c=1 */'],
    ['.foo :is(.bar, #baz)', [1, 1, 0], 'S15-ex  /* a=1 b=1 c=0 */'],
  ]);
});

describe('规范原样例:§15 第一个示例块(evaluation contexts 的四条)', () => {
  table([
    ['a:is(em, #foo)', [1, 0, 1], 'S15-ex :is(em,#foo) 是 (1,0,0);这里另加一个 a 便于和裸 :is 分开'],
    [':is(em, #foo)', [1, 0, 0], 'S15-ex 原文:「has a specificity of (1,0,0)—like an ID selector (#foo)」'],
    ['.qux:where(em, #foo#bar#baz)', [0, 1, 0], 'S15-ex 原文:「only the .qux outside the :where() contributes」'],
    [':nth-child(even of li, .item)', [0, 2, 0], 'S15-ex 原文:「like a class selector (.item) plus a pseudo-class」'],
    [':not(em, strong#foo)', [1, 0, 1], 'S15-ex 原文:「like a tag selector (strong) combined with an ID selector (#foo)」'],
  ]);
});

describe(':not() —— 伪类本身不计,只取参数里最重的那条 [S15-ctx]', () => {
  table([
    // 本轮的病灶。真浏览器 (0,4,0):.qf-chip + :hover + :not(:disabled) 里的
    // :disabled + .qf-chip-box。`:not` 自己**不占**那第五格。
    ['.qf-chip:hover:not(:disabled) .qf-chip-box', [0, 4, 0], 'S15-ctx + S15'],
    ['button:hover:not(:disabled)', [0, 2, 1], 'S15-ctx:`:not` 不计,`:disabled` 计 B;`button` 计 C'],
    ['.a:not(.b)', [0, 2, 0], 'S15-ctx:.a + 参数 .b'],
    [':not(.a, .b.c)', [0, 2, 0], 'S15-ctx:取最重的 .b.c'],
    [':not(.a, #b)', [1, 0, 0], 'S15-ctx:取最重的 #b'],
    [':not(div)', [0, 0, 1], 'S15-ctx:参数是类型选择器,落在 C'],
    ['.qf-custom-collapsible:not(.open)', [0, 2, 0], '产线选择器(composio.css);S15-ctx'],
  ]);
});

describe(':is() / :matches() —— 同 :not 的规矩 [S15-ctx]', () => {
  table([
    ['.a:is(.b, #c)', [1, 1, 0], 'S15-ctx:取最重的 #c'],
    ['.a:is(em)', [0, 1, 1], 'S15-ctx:参数是类型选择器,落在 C'],
    ['.a:matches(.b, #c)', [1, 1, 0], ':matches() 是 :is() 的旧名,规矩相同'],
  ]);
});

describe(':where() —— 恒为 (0,0,0) [S15-ctx]', () => {
  table([
    [':where(#a#b#c)', [0, 0, 0], 'S15-ctx:「replaced by zero」'],
    [':where(#a) .b', [0, 1, 0], '只有 :where 外面的 .b 算数'],
    [':where(:not(#a))', [0, 0, 0], '整段归零,里面嵌什么都一样'],
    [':where(:is(:not(#a)))', [0, 0, 0], '嵌三层仍然归零'],
    // 产线选择器:primitives.css / packages/components 的全局按钮默认值。
    [':where(button:hover:not(:disabled))', [0, 0, 0], '产线选择器;S15-ctx'],
    [':where([data-chat-root]) button', [0, 0, 1], '产线选择器(chat.css);只剩 button 的 C'],
  ]);
});

describe(':has() —— 同 :is/:not 的规矩 [S15-ctx]', () => {
  table([
    ['.a:has(#b)', [1, 1, 0], 'S15-ctx:取参数最重的 #b'],
    ['.a:has(> .b)', [0, 2, 0], 'S15-ctx:组合符不计,只有 .b 算数'],
    ['.a:has(.b, #c)', [1, 1, 0], 'S15-ctx:取最重的 #c'],
    ['.question-form:has(.question-form-foot) > .question-form-head', [0, 3, 0], '产线选择器(composio.css)'],
    // 产线里嵌得最深的一条(chat.css)。B = .chat-composer-fixed-layer +
    // .staged-context-row + :has(…) 里的 .staged-context--workspace +
    // :not(:has(> :not(.staged-context--workspace))) 里最终的那一个类。
    [
      '.chat-composer-fixed-layer .staged-context-row:has(> .staged-context--workspace):not(:has(> :not(.staged-context--workspace)))',
      [0, 4, 0],
      '产线选择器(chat.css);S15-ctx 逐层套用',
    ],
  ]);
});

describe('嵌套:evaluation context 里再套 evaluation context [S15-ctx]', () => {
  table([
    [':not(:is(.a, #b))', [1, 0, 0], '参数 :is(.a,#b) 自己是 (1,0,0)'],
    ['.x:not(:where(#a))', [0, 1, 0], ':where 归零 → :not 的参数是 (0,0,0),只剩 .x'],
    [':is(:has(.a))', [0, 1, 0], '逐层取最重'],
    [':not(:not(#a))', [1, 0, 0], '两层 :not 都不自计,最终是 #a'],
  ]);
});

describe('伪元素落在 C,不是 B [S15 + P4-8]', () => {
  table([
    ['.a::before', [0, 1, 1], 'S15:「type selectors and pseudo-elements」= C'],
    ['p::first-line', [0, 0, 2], 'S15:p 一格 + ::first-line 一格,都在 C'],
    ['::before', [0, 0, 1], 'S15'],
    // 单冒号的这四个按 [P4-8] 是同一批伪元素,不是伪类。
    ['.a:before', [0, 1, 1], 'P4-8:`:before` 是 `::before` 的兼容写法'],
    ['.a:after', [0, 1, 1], 'P4-8'],
    ['p:first-line', [0, 0, 2], 'P4-8'],
    ['p:first-letter', [0, 0, 2], 'P4-8'],
    // 对照:`:first-child` 长得像但是**伪类**,落在 B。
    ['p:first-child', [0, 1, 1], 'S15:`:first-child` 是伪类 → B'],
  ]);
});

describe('属性 / id / 通配 / 组合符 [S15]', () => {
  table([
    ['[data-chat-root]', [0, 1, 0], 'S15:属性选择器计 B'],
    ["[data-mode='wide']", [0, 1, 0], 'S15'],
    ['[lang|="fr"]', [0, 1, 0], 'S15:`|=` 里的竖线不是命名空间分隔符'],
    ['#a#b', [2, 0, 0], 'S15:「Repeated occurrences of the same simple selector … do increase specificity」'],
    ['*', [0, 0, 0], 'S15:「ignore the universal selector」'],
    ['* .a', [0, 1, 0], 'S15'],
    ['a > b + c ~ d e', [0, 0, 5], 'S15:组合符不计,五个类型选择器'],
    ['.a>.b', [0, 2, 0], 'S15:没有空格的组合符同样不计'],
  ]);
});

describe(':nth-child(An+B of S) —— 伪类自己一格,再加参数里最重的 [S15-ctx]', () => {
  table([
    [':nth-child(2)', [0, 1, 0], 'S15:普通伪类计 B'],
    [':nth-child(2n+1)', [0, 1, 0], 'S15'],
    [':nth-child(even of .item)', [0, 2, 0], 'S15-ctx:伪类一格 + .item 一格'],
    [':nth-last-child(1 of #a)', [1, 1, 0], 'S15-ctx:伪类一格 + #a'],
    // `of` 后面是**列表**时要取最重的一条,不是把各分支相加。
    [':nth-child(2n+1 of .a, .b.c)', [0, 3, 0], 'S15-ctx:伪类一格 + max(.a, .b.c) = 一格 + 两格'],
    ['li:nth-child(2n of li, .item)', [0, 2, 1], 'S15-ctx:外层 li 计 C,参数取最重的 .item'],
  ]);
});

describe('普通伪类的参数不参与计算 [S15]', () => {
  table([
    [':lang(en-US)', [0, 1, 0], 'S15:`:lang()` 是普通伪类,参数不是选择器'],
    ['.a:dir(rtl)', [0, 2, 0], 'S15'],
    ['.a:focus-visible', [0, 2, 0], '产线选择器(composio.css)'],
  ]);
});

describe('选择器列表:按每个分支各算,取最重的那条 [S15-list]', () => {
  // resolver 自己会先按逗号拆开再逐条量,所以这条平时够不着;
  // 但量尺被直接喂一整条列表时不能把各分支**加起来**。
  table([
    ['.a, #b', [1, 0, 0], 'S15-list:取最重的分支 #b,不是两条相加'],
    ['.a, .b', [0, 1, 0], 'S15-list'],
    ['div, .a.b.c', [0, 3, 0], 'S15-list:取 .a.b.c'],
  ]);
});

describe('产线现役选择器:本族真正在比的那几条', () => {
  table([
    ['button:disabled', [0, 1, 1], 'primitives.css 的全局原语'],
    ['.qf-chip', [0, 1, 0], 'composio.css'],
    ['.qf-chip:hover', [0, 2, 0], 'composio.css'],
    ['.qf-chip:disabled', [0, 2, 0], 'composio.css'],
    ['.qf-chip:hover .qf-chip-box', [0, 3, 0], 'composio.css'],
    ['.qf-chip:disabled .qf-chip-box', [0, 3, 0], 'composio.css'],
    ['.qf-options .qf-chip.qf-chip-on', [0, 3, 0], 'composio.css'],
    ['.qf-options .qf-chip.qf-chip-on .qf-chip-box', [0, 4, 0], 'composio.css'],
  ]);
});

describe('三元组按 A → B → C 逐位比较,低位再多也翻不过高位 [S15-cmp]', () => {
  // 打包成整数是为了排序方便;进制必须宽到「B 再多也进不了 A 的位」。
  // 这几条钉住那个进制:一格 id 恒压过任意条现实中的类。
  it('一个 id 压过 20 个类', () => {
    const manyClasses = Array.from({ length: 20 }, (_, i) => `.c${i}`).join('');
    expect(specificity('#a')).toBeGreaterThan(specificity(manyClasses));
  });
  it('一个类压过 20 个类型选择器', () => {
    const manyTypes = Array.from({ length: 20 }, () => 'div').join(' ');
    expect(specificity('.a')).toBeGreaterThan(specificity(manyTypes));
  });
});
