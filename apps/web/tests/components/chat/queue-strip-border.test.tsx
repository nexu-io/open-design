// @vitest-environment jsdom
/**
 * 发送队列的那一圈**外框**(产品 2026-08-27:「给我们消息队列加一个小边框吧,
 * 不然有点混在一起了,你边框淡一点」)。
 *
 * 这一条是**脱离设计稿**的:稿子组件 17 明写「不套框不铺底」,理由是
 * 「输入框自己已经是个有边的东西,队列再套一圈,人得先分辨这两块是不是一回事」
 * (见 `styles/chat.css` 那一段的注释)。产品裁决把「不套框」这半条撤了 ——
 * 队列夹在流水和输入框之间,三块底色一样、边一条没有,读起来是连在一起的。
 * 「不铺底」那半条**留着**:要的是分隔,不是强调。
 *
 * ## 这条用例要挡的是哪一类 bug
 *
 * 队列条在 `styles/chat.css` 里被写了**两次**:2337 行是卡片时代那一版
 * (有框有底有阴影),3564 行是按稿子还原的那一版,一句 `border: 0` 把框抹掉。
 * 所以「加一条 border」这件事**不是加一条声明就成立的** —— 加在前面会被后面
 * 那条 `border: 0` 吃掉,而两处的规则文本看起来都好好的。
 * 因此这里问的不是「有没有一条规则写了 border」,而是
 * **「层叠走完之后,最后落在这个元素上的 border 是什么」**。
 *
 * 另外两件必须成对断言的事(不然「把所有线都抹了」也能过):
 *   · 外框要**看得见**(不是 0 宽、不是 none);
 *   · 行与行的那道分隔线只能挂在**相邻兄弟**上 —— 挂到每一行头上,
 *     第一行的上边线就会和外框叠成双线。
 *
 * ## 为什么还要单独测接缝
 *
 * 外框的色值走 `--chat-border-soft`,而 `--chat-*` **只在 `[data-chat-root]`
 * 子树里有定义**(`chat/ChatRoot.module.css`)。队列条要是渲染在接缝之外,
 * `var(--chat-border-soft)` 解析成空串,整条 `border` 声明作废 ——
 * 框直接不出现,而且**不报错、一条测试都不会红**(今天已经栽过三次:
 * 联系支持弹窗、产物卡浮层、输入框 portal 层)。
 * 所以下面第二组用真实的 `ChatPane` 渲染一遍,问「队列条头顶那个接缝元素,
 * 身上那个类在 CSS 里到底声不声明 `--chat-*`」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatPane } from '../../../src/components/ChatPane';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAT_CSS = readFileSync(resolve(HERE, '../../../src/styles/chat.css'), 'utf-8');
const ROOT_MODULE_CSS = readFileSync(
  resolve(HERE, '../../../src/components/chat/ChatRoot.module.css'),
  'utf-8',
);

/* ── 一把够用的尺子 ───────────────────────────────────────────────
 * jsdom 不跑层叠、也不解析 `var()`,`getComputedStyle` 在这里永远是空串,
 * 分不出「真的落空」和「jsdom 本来就不算」。所以层叠这一半在源码上算,
 * 真正的像素值另有无头 Chrome 量(见 PR 说明)。
 */

/**
 * 只按【顶层逗号】拆选择器组。
 *
 * `:is(.a, .b)` / `[x="a,b"]` 里的逗号是参数分隔,一把 `split(',')` 会造出
 * 不存在的选择器,于是「谁匹配得上」整个算错 —— 假绿。
 */
function splitTopLevel(selectorList: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of selectorList) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

interface Rule { selectors: string[]; body: string; at: number }

/**
 * 按文档顺序取出全部**样式规则**(selector + 声明块)。
 *
 * 手写的括号扫描,不用正则:`chat.css` 里有 `@media` / `@supports` 嵌套,
 * 一把 `/([^{}]+)\{([^{}]*)\}/g` 会把外层 at-rule 的头当成选择器。
 * `@keyframes` 的帧(`0% { … }`)整块跳过 —— 那不是选择器。
 */
function parseRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const rules: Rule[] = [];
  let i = 0;
  const readBlock = (start: number): number => {
    let depth = 0;
    for (let j = start; j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') {
        depth -= 1;
        if (depth === 0) return j;
      }
    }
    return src.length;
  };
  const walk = (from: number, to: number, inKeyframes: boolean): void => {
    let cursor = from;
    while (cursor < to) {
      const open = src.indexOf('{', cursor);
      if (open === -1 || open >= to) return;
      const head = src.slice(cursor, open).trim();
      const close = readBlock(open);
      const body = src.slice(open + 1, close);
      if (head.startsWith('@')) {
        const name = head.slice(1).split(/[\s(]/)[0] ?? '';
        // 条件组规则的肚子里还是普通规则,递归进去;@keyframes 的帧不是选择器
        if (/^(media|supports|layer|container|scope)$/i.test(name)) {
          walk(open + 1, close, false);
        } else if (/^keyframes$/i.test(name.replace(/^-\w+-/, ''))) {
          /* 跳过 */
        }
      } else if (!inKeyframes && head) {
        rules.push({ selectors: splitTopLevel(head), body, at: open });
      }
      cursor = close + 1;
    }
  };
  walk(0, src.length, false);
  void i;
  return rules;
}

const RULES = parseRules(CHAT_CSS);

/** 某个属性在这个声明块里最后一次的取值(同块内后写的赢) */
function declValue(body: string, prop: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`, 'gi');
  let last: string | null = null;
  for (const m of body.matchAll(re)) last = (m[1] ?? '').trim();
  return last;
}

/**
 * 层叠走完之后,这个**单类选择器**上某个属性的取值。
 *
 * 这里只收「选择器就是这一个类、没有别的限定」的规则 —— 特异性相同,
 * 于是**文档顺序里最后写的那条赢**,正是我们要问的那件事。
 * 更强特异性的规则(`.a .b`、`.b.c`)另算,不在这条尺子的职责里;
 * 队列条这几条恰好全是单类,下面的「尺子是准的」会把这个前提钉住。
 */
function effective(selector: string, prop: string): string | null {
  let value: string | null = null;
  for (const rule of RULES) {
    if (!rule.selectors.includes(selector)) continue;
    const v = declValue(rule.body, prop);
    if (v !== null) value = v;
  }
  return value;
}

/** 匹配得上这个选择器的规则条数 */
function rulesFor(selector: string): Rule[] {
  return RULES.filter((r) => r.selectors.includes(selector));
}

const STRIP = '.chat-queued-send-strip';
const ROW = '.chat-queued-send-row';
const COMPOSER = '.composer';

describe('先证明这把尺子是准的', () => {
  it('规则解析不是空的,而且没被 @media / @keyframes 带偏', () => {
    expect(RULES.length).toBeGreaterThan(200);
    // 帧选择器不该被当成规则
    expect(RULES.some((r) => r.selectors.some((s) => /^\d+%$/.test(s)))).toBe(false);
    // 顶层逗号拆得对:`:is(...)` 里的逗号不许拆出半截选择器
    expect(RULES.some((r) => r.selectors.some((s) => s.startsWith(')')))).toBe(false);
  });

  it('队列条确实被写了不止一次 —— 这就是「加一条就以为成了」会栽的地方', () => {
    expect(rulesFor(STRIP).length).toBeGreaterThanOrEqual(2);
  });
});

describe('队列条的外框', () => {
  it('外框左右边界与下方 composer shell 对齐', () => {
    const insetToken = '--chat-composer-inline-inset';
    const composerPadding = effective(COMPOSER, 'padding');
    const stripMargin = effective(STRIP, 'margin-inline');
    const stripWidth = effective(STRIP, 'width');

    expect(
      composerPadding,
      'composer 的水平内距和队列的水平外距必须共用同一个 token,' +
        '否则面板宽度或 composer 间距一调整就会再次错位',
    ).toContain(insetToken);
    expect(stripMargin).toContain(insetToken);
    expect(
      stripWidth,
      '队列是 composer 同列的兄弟节点,margin 内缩后宽度也要同步减去两侧,' +
        '不然 border-box 会从右侧溢出',
    ).toContain(insetToken);
    expect(stripWidth).toMatch(/^calc\(/);
    expect(stripWidth).toMatch(/\*\s*2/);
  });

  it('层叠走完之后,外框仍然看得见 —— 没有被后面的 border: 0 抹掉', () => {
    const border = effective(STRIP, 'border');
    expect(
      border,
      '队列条一条 border 都没有:它夹在流水和输入框之间,三块没有任何分界',
    ).not.toBeNull();
    expect(
      border,
      `层叠末端的 border 是「${border}」—— 被后面那条规则抹掉了,` +
        '新加的声明要写在**最后一条**队列条规则里,不能写在前面',
    ).not.toMatch(/^(0|none|0px)\b/);
    // 看得见 = 有宽度、有线型
    expect(border).toMatch(/solid/);
    expect(border, '宽度不能是 0').not.toMatch(/(^|\s)0(px)?\s/);
  });

  it('用的是接缝里已有的软边 + chat 半径,不新造色值 / 半径 / 阴影', () => {
    const border = effective(STRIP, 'border');
    expect(
      border,
      '边框颜色要走 --chat-border-soft:它就是队列**行间分隔线**用的那一档,' +
        '外框和内线同一个重量才读成「一块」,而不是「一个框套着一个表」',
    ).toContain('var(--chat-border-soft)');
    expect(border, '线宽走 --chat-stroke,不写字面量 1px').toContain('var(--chat-stroke)');

    const radius = effective(STRIP, 'border-radius');
    expect(radius, '半径走 --chat-radius,不新造值').toBe('var(--chat-radius)');

    // 「淡」= 只给一条线,不铺底、不打阴影(稿子「不铺底」那半条留着)
    const background = effective(STRIP, 'background');
    expect(background, '要的是分隔不是强调:不铺底').toMatch(/^(none|transparent)$/);
    const shadow = effective(STRIP, 'box-shadow');
    expect(shadow === null || /^none$/.test(shadow), '不打阴影').toBe(true);
  });

  it('外框不会和第一行 / 最后一行的分隔线叠成双线', () => {
    // 行自己不许有上下边线:有的话第一行的上线就贴着外框成双线
    const rowBorder = effective(ROW, 'border');
    expect(rowBorder, '行的 border 应当是 0(分隔线由相邻兄弟那条规则给)').toMatch(
      /^(0|none|0px)\b/,
    );
    expect(effective(ROW, 'border-top'), '行不许各自挂上边线').toBeNull();
    expect(effective(ROW, 'border-bottom'), '行不许各自挂下边线').toBeNull();

    // 分隔线只能挂在**相邻兄弟**上 —— 第一行匹配不上,所以不会和外框重叠
    const seps = RULES.filter((r) =>
      r.selectors.some((s) => s.includes(ROW) && /\+/.test(s)),
    );
    expect(seps.length, '找不到行间分隔线那条规则').toBeGreaterThan(0);
    for (const rule of seps) {
      for (const sel of rule.selectors) {
        if (!sel.includes(ROW)) continue;
        expect(
          sel,
          `分隔线的选择器是「${sel}」—— 必须是 A + A 的相邻兄弟形态,` +
            '否则第一行头上也会有一条,和外框叠成双线',
        ).toMatch(/\.chat-queued-send-row\s*\+\s*\.chat-queued-send-row/);
      }
    }
  });
});

/* ── 接缝:变量在队列条**实际渲染的位置**解析得出来吗 ──────────────── */

/** ChatRoot.module.css 里哪些本地类真的声明了 `--chat-*` */
function declaringClasses(): Set<string> {
  const out = new Set<string>();
  for (const rule of parseRules(ROOT_MODULE_CSS)) {
    if (!/--chat-[a-z0-9-]+\s*:/.test(rule.body)) continue;
    for (const sel of rule.selectors) {
      for (const m of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) out.add(m[1]!);
    }
  }
  return out;
}

/** 这个类身上声明了哪些 `--chat-*` */
function varsDeclaredOn(cls: string): Set<string> {
  const out = new Set<string>();
  for (const rule of parseRules(ROOT_MODULE_CSS)) {
    if (!rule.selectors.some((s) => s.split(/\s+/).some((part) => part.includes(`.${cls}`)))) {
      continue;
    }
    for (const m of rule.body.matchAll(/(--chat-[a-z0-9-]+)\s*:/g)) out.add(m[1]!);
  }
  return out;
}

const DECLARING = declaringClasses();

/** vitest 里 CSS Module 类名带哈希(`vars` → `_vars_1a2b3`),按词根匹配 */
function seamClassOf(className: string): string | null {
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    for (const known of DECLARING) {
      if (cls === known || cls.includes(known)) return known;
    }
  }
  return null;
}

describe('队列条渲染在接缝之内 —— 外框的变量真解析得出来', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  if (typeof HTMLElement.prototype.scrollTo !== 'function') {
    HTMLElement.prototype.scrollTo = function () { /* jsdom 没有 */ };
  }
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.restoreAllMocks();
  });

  function renderPaneWithQueue() {
    return render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        queuedItems={[{ id: 'q1', prompt: '把首屏文案改短一点' }]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );
  }

  it('尺子是准的:解析得出确实有类在声明 --chat-*', () => {
    expect(DECLARING.size).toBeGreaterThan(0);
  });

  it('队列条头顶有一个 [data-chat-root],而且那个元素身上带着声明变量的类', () => {
    renderPaneWithQueue();
    const strip = document.querySelector<HTMLElement>('[data-testid="chat-queued-send-strip"]');
    expect(strip, '队列条没渲染出来?先看 queuedItems 传进去没有').not.toBeNull();

    const seam = strip?.closest('[data-chat-root]') as HTMLElement | null;
    expect(
      seam,
      '队列条渲染在 [data-chat-root] 之外 —— 它用的 var(--chat-…) 会全部解析成空串,' +
        '整条 border 声明作废,框直接不出现,而且不报错',
    ).not.toBeNull();

    const cls = seamClassOf(seam?.className ?? '');
    expect(
      cls,
      `接缝元素的 class 是「${seam?.className}」—— 只有 data-chat-root 属性、` +
        '没有定义 --chat-* 的那个类,等于只发了个属性',
    ).not.toBeNull();
  });

  it('外框要用的那两个变量,就在这个接缝元素身上有定义', () => {
    renderPaneWithQueue();
    const strip = document.querySelector<HTMLElement>('[data-testid="chat-queued-send-strip"]');
    const seam = strip?.closest('[data-chat-root]') as HTMLElement | null;
    const cls = seamClassOf(seam?.className ?? '');
    expect(cls).not.toBeNull();

    const declared = varsDeclaredOn(cls!);
    for (const name of ['--chat-border-soft', '--chat-stroke', '--chat-radius']) {
      expect(
        declared.has(name),
        `${name} 不在接缝里 —— 队列条的外框会解析成空,框不出现且不报错`,
      ).toBe(true);
    }
  });
});
