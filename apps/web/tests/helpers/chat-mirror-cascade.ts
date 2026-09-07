/**
 * 微型层叠解析器 —— chat-mirror 这一族「量最终计算值」的共用底座。
 *
 * ── 为什么不能用 `getComputedStyle` ──────────────────────────────────
 * 三件事 jsdom 都不做:(1) 特异性层叠,(2) `var()` 解析,(3) **逻辑属性**
 * (写了 `padding-inline: 14px`,`getComputedStyle().paddingLeft` 读回的是上一条
 * 物理简写留下的值)。而这一族要照的恰恰就是「哪条规则最终赢了」——
 * 规则文本两边一个字不差、只有层叠结果不同,是这一族反复出现的事故形态。
 *
 * 所以本模块按产品 `index.css` 的导入顺序把真实样式表读进来,用 `element.matches()`
 * 做匹配、按 (特异性, 顺序) 排序,自己算出胜出声明,再解一层 `var()`。
 *
 * ── 调用方必须自己传两样东西 ────────────────────────────────────────
 * 1. `parts`:够得着目标元素的那几张表,**顺序照 `index.css`**,CSS Module 排在
 *    全局之后并且**先过 `hashed()`** —— 全局表里的 `.button` 在产线上不匹配
 *    module 类,照抄这件事,否则量出来的是一颗根本不存在的按钮。
 * 2. `targets`:要比哪几个属性。**故意不给默认值** —— 各测试文件用 `toEqual`
 *    整表比对,共用一张属性表会让「另一个文件加了一项」变成这个文件的假失败。
 */

export interface Rule {
  selector: string;
  body: string;
  order: number;
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 顶层规则。`@media` / `@supports` 这类块整体跳过 —— 本族比的是声明文本,不是解析后的颜色。 */
export function parseRules(css: string, start: number): { rules: Rule[]; next: number } {
  const rules: Rule[] = [];
  let order = start;
  let i = 0;
  const src = stripComments(css);
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? '')) i += 1;
    if (i >= src.length) break;
    if (src[i] === '@') {
      let j = i;
      while (j < src.length && src[j] !== '{' && src[j] !== ';') j += 1;
      if (j >= src.length || src[j] === ';') {
        i = j + 1;
        continue;
      }
      let depth = 0;
      let k = j;
      for (; k < src.length; k += 1) {
        if (src[k] === '{') depth += 1;
        else if (src[k] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      i = k + 1;
      continue;
    }
    const brace = src.indexOf('{', i);
    if (brace < 0) break;
    const end = src.indexOf('}', brace);
    if (end < 0) break;
    rules.push({
      selector: src.slice(i, brace).trim().replace(/\s+/g, ' '),
      body: src.slice(brace + 1, end),
      order: (order += 1),
    });
    i = end + 1;
  }
  return { rules, next: order };
}

/** CSS Module 的类名换成真哈希 —— 全局表里的 `.button` 在产线上**不匹配** module 类,照抄这件事。 */
export function hashed(css: string, map: Record<string, string>): string {
  const locals = new Set<string>();
  for (const m of stripComments(css).matchAll(/\.([A-Za-z][\w-]*)/g)) locals.add(m[1]!);
  let out = css;
  for (const local of locals) {
    const generated = map[local];
    if (!generated || local === generated) continue;
    out = out.replace(new RegExp(`\\.${local}\\b`, 'g'), `.${generated}`);
  }
  return out;
}

/* ── 特异性 ─────────────────────────────────────────────────────────────
 * 判据只有一个:CSS 规范。校准用例在 `chat-mirror-cascade.specificity.test.ts`,
 * 每条断言都标了出处;改这一段前先读那份,别凭「看起来合理」下手。
 *
 * [S15]  Selectors Level 4 §15 https://drafts.csswg.org/selectors-4/#specificity-rules
 *        A = ID 选择器个数;B = 类 + 属性 + **伪类**个数;
 *        C = 类型选择器 + **伪元素**个数;通配符 `*` 与组合符一律不计。
 *        「A few pseudo-classes provide "evaluation contexts" …」:
 *          · `:is()` / `:not()` / `:has()` —— **伪类自己不贡献**,整段的特异性
 *            换成参数列表里**最重的那条**复杂选择器;
 *          · `:nth-child()` / `:nth-last-child()` —— 伪类自己算一格,再**加上**
 *            `of S` 里最重的那条(没写 `of` 就只有那一格);
 *          · `:where()` —— **恒为零**。
 *        选择器列表按分支各算,取最重的那条(不是相加)。
 * [P4-8] CSS Pseudo-Elements 4 §8 Compatibility Syntax —— 单冒号的
 *        `:before` / `:after` / `:first-letter` / `:first-line` 是那四个**伪元素**
 *        的兼容写法,所以落在 C,不是 B。
 *
 * 已知不覆盖(碰到就会算错,别默默依赖):`::part()` / `::slotted()` /
 * `:host()` / `:host-context()` 的参数规则(本仓库无 shadow DOM),以及
 * `:nth-child(… of S)` 里 S 自身再嵌一个 `of` 的病态写法。
 */

export type Specificity = readonly [ids: number, classes: number, elements: number];

/** `:is()` 的现名与旧名,以及规矩完全相同的 `:not()` / `:has()`。[S15] */
const CONTEXT_PSEUDOS = new Set(['is', 'matches', '-moz-any', '-webkit-any', 'not', 'has']);
/** 「伪类自己一格 + `of S` 里最重的那条」。[S15] */
const NTH_OF_PSEUDOS = new Set(['nth-child', 'nth-last-child']);
/** 单冒号写法仍是伪元素。[P4-8] */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-letter', 'first-line']);

const ZERO: Specificity = [0, 0, 0];

const add = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** A → B → C 逐位比较。[S15] */
const heavier = (a: Specificity, b: Specificity): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

const isIdentStart = (ch: string): boolean => /[A-Za-z_\\]/.test(ch) || ch.charCodeAt(0) > 127;

/** 标识符尾巴的下标(允许 `\.` 这类转义)。 */
function identEnd(src: string, from: number): number {
  let i = from;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (/[\w-]/.test(ch) || ch.charCodeAt(0) > 127) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

/** `open` 处那一对括号的闭合下标(计嵌套、跳引号)。找不到就返回串尾。 */
function closerAt(src: string, open: number, close: string): number {
  const opener = src[open]!;
  let depth = 0;
  let i = open;
  let quote = '';
  while (i < src.length) {
    const ch = src[i]!;
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === opener) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return src.length;
}

/** 顶层逗号拆分(括号 / 方括号 / 引号里的逗号不算)。 */
function splitList(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
  }
  out.push(src.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 参数列表里最重的那条复杂选择器。空列表 → (0,0,0)。[S15] */
function heaviestOf(list: string): Specificity {
  let best: Specificity = ZERO;
  for (const branch of splitList(list)) {
    const one = scanComplex(branch);
    if (heavier(one, best)) best = one;
  }
  return best;
}

/** `An+B of S` 里 `S` 的部分;没写 `of` 返回 null。 */
function nthOfArgument(args: string): string | null {
  const m = /\bof\b/i.exec(args);
  return m ? args.slice(m.index + m[0].length) : null;
}

/** `selector[i]` 上那个伪类 / 伪元素贡献多少,以及它到哪儿结束。 */
function pseudoAt(src: string, i: number): { next: number; weight: Specificity } {
  const doubleColon = src[i + 1] === ':';
  const nameStart = i + (doubleColon ? 2 : 1);
  const nameEnd = identEnd(src, nameStart);
  const name = src.slice(nameStart, nameEnd).toLowerCase();

  let args: string | null = null;
  let next = nameEnd;
  if (src[nameEnd] === '(') {
    const close = closerAt(src, nameEnd, ')');
    args = src.slice(nameEnd + 1, close);
    next = close + 1;
  }

  // 伪元素落在 C。单冒号的那四个按 [P4-8] 也是伪元素。
  if (doubleColon || LEGACY_PSEUDO_ELEMENTS.has(name)) return { next, weight: [0, 0, 1] };
  if (name === 'where') return { next, weight: ZERO };
  if (CONTEXT_PSEUDOS.has(name)) {
    // 伪类自己**不贡献**;没带参数的裸写法(`:has` 之类的非法/未来语法)退回普通伪类。
    return { next, weight: args === null ? [0, 1, 0] : heaviestOf(args) };
  }
  if (NTH_OF_PSEUDOS.has(name)) {
    const of = args === null ? null : nthOfArgument(args);
    return { next, weight: add([0, 1, 0], of === null ? ZERO : heaviestOf(of)) };
  }
  // 普通伪类:自己一格,参数(`:lang(en)` / `:dir(rtl)`)不是选择器,不计。
  return { next, weight: [0, 1, 0] };
}

/** 单条复杂选择器(不含顶层逗号)的 (A,B,C)。 */
function scanComplex(selector: string): Specificity {
  let out: Specificity = ZERO;
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i]!;
    if (ch === '#') {
      i = identEnd(selector, i + 1);
      out = add(out, [1, 0, 0]);
    } else if (ch === '.') {
      i = identEnd(selector, i + 1);
      out = add(out, [0, 1, 0]);
    } else if (ch === '[') {
      i = closerAt(selector, i, ']') + 1;
      out = add(out, [0, 1, 0]);
    } else if (ch === ':') {
      const { next, weight } = pseudoAt(selector, i);
      i = next;
      out = add(out, weight);
    } else if (ch === '*') {
      // 通配符不计。`*|x` 里它只是命名空间前缀,同样不计。[S15]
      i += selector[i + 1] === '|' && selector[i + 2] !== '=' ? 2 : 1;
    } else if (isIdentStart(ch)) {
      const end = identEnd(selector, i);
      if (selector[end] === '|' && selector[end + 1] !== '=') {
        i = end + 1; // 命名空间前缀,真正的类型选择器在竖线后面
        continue;
      }
      i = end;
      out = add(out, [0, 0, 1]);
    } else {
      i += 1; // 组合符 `>` `+` `~` `||`、空白、以及散落的标点 —— 都不计 [S15]
    }
  }
  return out;
}

/** 规范的 (A,B,C)。传进来的是选择器列表时取最重的分支,不相加。[S15] */
export function specificityTuple(selector: string): Specificity {
  return heaviestOf(selector);
}

/**
 * 打包成一个可比的标量,给层叠排序用。
 *
 * 进制 10_000 / 100 只在「B 和 C 都小于 100」时保序 —— 现实选择器离这个上限
 * 极远,规范本身也允许实现钳位(§15「implementations may have limitations on
 * the size of A, B, or C」)。要比三元组本身请用 {@link specificityTuple}。
 */
export function specificity(selector: string): number {
  const [ids, classes, elements] = specificityTuple(selector);
  return ids * 10_000 + classes * 100 + elements;
}

/**
 * 简写展开。**逻辑属性在这里落到物理格子上** —— `padding-inline: 14px` 变成
 * `padding-left/right: 14px`,于是「共享 Button 的 `.sm` 给了 11px」和
 * 「我们又盖了一层 14px」能在同一把尺子上比。
 */
export function expand(prop: string, value: string): Array<[string, string]> {
  const v = value.trim();
  switch (prop) {
    case 'background':
      // `none` / `transparent` / 单色都只落在 background-color 上;渐变不出现在这几条规则里
      return [['background-color', v === 'none' ? 'transparent' : v]];
    case 'background-color':
      return [['background-color', v]];
    case 'border': {
      if (/^0(px)?$/.test(v) || v === 'none') {
        return [
          ['border-top-width', '0px'],
          ['border-top-style', 'none'],
          ['border-top-color', 'currentcolor'],
        ];
      }
      const parts = v.split(/\s+(?![^(]*\))/);
      return [
        ['border-top-width', parts[0] ?? 'medium'],
        ['border-top-style', parts[1] ?? 'none'],
        ['border-top-color', parts[2] ?? 'currentcolor'],
      ];
    }
    case 'border-width':
      return [['border-top-width', v]];
    case 'border-style':
      return [['border-top-style', v]];
    case 'border-color':
      return [['border-top-color', v]];
    case 'border-radius':
      return [['border-radius', v]];
    case 'padding': {
      const p = v.split(/\s+(?![^(]*\))/);
      const [t, r = t, b = t, l = r] = p as [string, string?, string?, string?];
      return [
        ['padding-top', t!],
        ['padding-right', r!],
        ['padding-bottom', b!],
        ['padding-left', l!],
      ];
    }
    case 'padding-block': {
      const p = v.split(/\s+/);
      return [
        ['padding-top', p[0]!],
        ['padding-bottom', p[1] ?? p[0]!],
      ];
    }
    case 'padding-inline': {
      const p = v.split(/\s+/);
      return [
        ['padding-left', p[0]!],
        ['padding-right', p[1] ?? p[0]!],
      ];
    }
    case 'padding-inline-start':
      return [['padding-left', v]];
    case 'padding-inline-end':
      return [['padding-right', v]];
    case 'padding-top':
    case 'padding-right':
    case 'padding-bottom':
    case 'padding-left':
    case 'font-weight':
    case 'font-size':
    /*
     * `line-height` / `font-family` 是 W73(输入框行高对稿)加进来的。
     *
     * 加进来之前它们**不在名单里**,读回 `<unset>` —— 而 `<unset>` 和「真的没人写」
     * 长得一模一样,于是「两边都读回 `<unset>`」的相等断言看起来是绿的,实际一格都没量。
     * 名单是加法:`resolved()` 只吐调用方点名的 `targets`,没点名这两项的文件读数不变。
     *
     * `white-space` / `overflow-wrap` 是 OPEND-2612(选项说明文案被右边距裁掉)
     * 加进来的。那条缺陷的病根就是层叠:`primitives.css` 的裸 `button
     * { white-space: nowrap }` 和 `.qf-chip { white-space: normal }` 规则文本两边
     * 都没写错,只有谁赢决定文案换不换行 —— 正是这把尺子该照的形态。加进来之前
     * 它们读回 `<unset>`,任何「断言它是 normal」都会假绿。
     *
     * ⚠️ 仍然不在名单里的:`letter-spacing` / `-webkit-line-clamp` / `display` /
     * `animation-*` / `transform`。要量它们得先照这里再加一格。
     * ⚠️ `font` 简写不展开(`expand('font', …)` 返回空),所以「同一条规则里
     * `font: inherit` 在长手之前」这种写法量出来的是长手值 —— 和浏览器一致;
     * 但「只写 `font:` 简写、指望它带出 line-height」的规则,这把尺子看不见。
     */
    case 'line-height':
    case 'font-family':
    case 'color':
    case 'cursor':
    case 'opacity':
    case 'width':
    case 'height':
    case 'min-width':
    case 'min-height':
    case 'box-shadow':
    case 'white-space':
    case 'overflow-wrap':
    /*
     * `scrollbar-gutter` 是 OPEND-2643(思考过程的滚动条压在正文上)加进来的。
     * 那条缺陷的病根同样是层叠:`.fold .body.scroll` 里那句「留一点气口」的
     * `padding-inline-end` 被 (0,5,0) 的 `padding: var(--stream-pad)` 简写整条盖掉,
     * 规则文本一个字没错,只有谁赢决定正文右边到底留没留出滚动条的位置。
     * 加进来之前它读回 `<unset>`,任何「断言它是 stable」都会假绿。
     */
    case 'scrollbar-gutter':
      return [[prop, v]];
    default:
      return [];
  }
}

/** 没有任何规则给出这个属性 —— 和「给了但值是 auto」是两件事,必须分得开。 */
export const UNSET = '<unset>';

export interface Resolver {
  rules: Rule[];
  /** 元素上每个目标属性的胜出值(已解 var);没人给的读回 {@link UNSET}。 */
  resolved: (el: Element) => Record<string, string>;
  /** 所有匹配到该元素、且声明了 `prop` 的规则(按层叠顺序)—— 用来指认「是谁写的」。 */
  declaring: (el: Element, prop: string) => Rule[];
}

/**
 * @param parts 样式表内容,顺序照 `index.css`;CSS Module 先过 {@link hashed}。
 * @param tokenSheets 供 `var()` 解析的表(取其 `:root` 块,产品强制亮色)。
 * @param targets 要比哪几个属性。
 */
export function createResolver(
  parts: string[],
  tokenSheets: string[],
  targets: readonly string[],
): Resolver {
  const rules: Rule[] = [];
  let order = 0;
  for (const part of parts) {
    const parsed = parseRules(part, order);
    rules.push(...parsed.rules);
    order = parsed.next;
  }

  /** 一层 `var()` 解析,变量表取自 token 表的 `:root`。 */
  const tokens: Record<string, string> = {};
  for (const css of tokenSheets) {
    const root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(css));
    for (const decl of (root?.[1] ?? '').split(';')) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (m) tokens[m[1]!] = m[2]!.trim();
    }
  }

  const deref = (value: string): string => {
    let out = value;
    for (let i = 0; i < 4; i += 1) {
      const next = out.replace(
        /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
        (whole, name: string, fallback?: string) => tokens[name] ?? fallback?.trim() ?? whole,
      );
      if (next === out) break;
      out = next;
    }
    // 无单位的 0 归一成 0px,免得 `padding-inline: 0` 和 `padding: 4px 0px` 比出假差异
    return out.trim().replace(/(^|\s)0(?=$|\s)/g, '$10px');
  };

  /**
   * 规则的哪一条分支匹配上了这个元素。
   *
   * **拆分必须按括号深度走** —— 逗号在 `:is()` / `:not()` / `:has()` / `:where()`
   * 里也是合法的,裸 `split(',')` 会把一条规则剁成残句,而残句的三种下场都错:
   * 抛异常被吞掉(规则没了)、被 nwsapi 宽容补括号(语义悄悄变窄)、或者残句本身
   * 碰巧合法(`li` / `td` / `.ds-modal-backdrop` …)从而把规则安到一批无关元素上。
   * 校准用例见 `chat-mirror-cascade.matching.test.ts`。
   */
  const matchingBranch = (rule: Rule, el: Element): string | undefined =>
    splitList(rule.selector).find((s) => {
      try {
        return el.matches(s);
      } catch (err) {
        // 伪元素分支永远匹配不到元素本体,jsdom 不认识它们也无所谓 —— 这一类才该吞。
        // 其余任何解析失败都必须响:**吞掉它就等于悄悄丢掉一条规则**,而丢掉的规则
        // 在尺上读成「没人声明这个属性」,一条真实的层叠渗漏就此变成假绿。
        if (s.includes('::')) return false;
        throw new Error(
          `量尺看不懂这条选择器,拒绝静默跳过(跳过会把真实渗漏读成假绿):${s}\n` +
            `  出自规则:${rule.selector}\n  原始错误:${(err as Error).message}`,
        );
      }
    });

  const resolved = (el: Element): Record<string, string> => {
    const winners = new Map<string, { spec: number; order: number; value: string }>();
    for (const rule of rules) {
      const branch = matchingBranch(rule, el);
      if (!branch) continue;
      const spec = specificity(branch);
      for (const decl of rule.body.split(';')) {
        const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
        if (!m) continue;
        for (const [prop, value] of expand(m[1]!.toLowerCase(), m[2]!)) {
          const current = winners.get(prop);
          if (!current || spec > current.spec || (spec === current.spec && rule.order >= current.order)) {
            winners.set(prop, { spec, order: rule.order, value });
          }
        }
      }
    }
    const out: Record<string, string> = {};
    for (const prop of targets) out[prop] = deref(winners.get(prop)?.value ?? UNSET);
    return out;
  };

  const declaring = (el: Element, prop: string): Rule[] =>
    rules.filter((rule) => {
      if (!matchingBranch(rule, el)) return false;
      return rule.body.split(';').some((decl) => {
        const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
        if (!m) return false;
        return expand(m[1]!.toLowerCase(), m[2]!).some(([p]) => p === prop);
      });
    });

  return { rules, resolved, declaring };
}
