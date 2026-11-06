// @vitest-environment jsdom
/**
 * 余额卡在流水里被画成半截 —— 病灶是 **flex 把它当成了泄压阀**,不是底部让位不够。
 *
 * ── 症状 ────────────────────────────────────────────────────────────────
 * QA 2026-09-07 截图:一轮进行中的对话,流水最底部那张升级卡(「剩余额度 $0.33」)
 * 上半截可见、下半截齐刷刷切掉,卡下面还留着空白。
 *
 * ── 真正的病灶 ──────────────────────────────────────────────────────────
 * `.chat-log` 是一根**定高的列向 flex 滚动容器**。flex 项默认 `flex-shrink: 1`,
 * 所以内容超出时浏览器先**压扁子项**,压不动了才溢出。绝大多数行压不动:它们的
 * `overflow` 是 `visible`,`min-height: auto` 于是解析成内容撑出来的最小高度
 * (flexbox §4.5「自动最小尺寸」),一压就顶住。
 *
 * 但升级卡自己写了 `overflow: hidden`(它要裁住右上角那枚辉光和圆角)。非
 * `visible` 的溢出让自动最小尺寸变成 **0** —— 这一项成了整根流水上唯一压得动的
 * 那个,于是它一个人吃下全部负空间,收到只剩自己的内距,再被自己那句
 * `overflow: hidden` 把下半截裁掉。
 *
 * ── 三条被排除掉的路(真实浏览器量的,不是推的)────────────────────────
 * 用真实 `index.css` + `UpgradeCard.module.css` 搭的复刻页(面板 380×420、
 * 四条真消息 + 升级卡),**已滚到最底**时量到:
 *
 *     卡自然高 111.5   实际画出来 32   裁掉 79.5
 *     卡底距流水下沿 −19.91  ← 20px 底部让位一分不少地在那儿
 *     scrollTop 498 / maxScrollTop 498  ← 滚动确实到了头
 *
 *   · **不是底部让位不够** —— 让位完整存在,卡还是半截的;
 *   · **不是被钉在底部** —— 它是流水里的一行(T51),`ChatPane` 把它渲染成
 *     `.chat-log` 的直接子元素(见下面那条结构断言),跟着内容滚;
 *   · **不是滚不到底(滚动冻结)** —— `scrollTop` 恰好等于 `maxScrollTop`。
 *
 * 只加一条 `.chat-log > * { flex-shrink: 0 }` 之后,同一页量到 111.5 / 裁掉 0,
 * `scrollHeight` 918 → 998,正好把被吃掉的 80px 还了回来。
 *
 * ── 这一页能证明什么、不能证明什么 ──────────────────────────────────────
 * **能**:那条不变量的声明存在,并且在真实 `@import` 顺序里赢下层叠;症状卡确实
 * 是这根流水的直接子元素,因而被这条不变量覆盖;修复没有改底部让位那笔账,
 * 也没有靠删掉 `overflow: hidden` 蒙混过关。
 *
 * **不能**:jsdom **没有布局**(`scrollHeight` / `clientHeight` / `getBoundingClientRect`
 * 恒为 0),所以这一页证不出「卡最终被画成 111.5px」。那一步只有真实浏览器能给,
 * 数字记在上面。这一页守的是 CSS 不变量不再被改回去。
 *
 * ── 为什么自己算层叠,而不用 `getComputedStyle` ──────────────────────────
 * 和 `w95-plan-pill-bottom-reserve.test.tsx` 同一个理由:jsdom 的
 * `getComputedStyle` **不实现优先级**,只按源码顺序后来居上,拿它当判据会假绿。
 * 这里只借 jsdom 做**选择器匹配**(nwsapi 可靠),优先级 + 源码顺序自己算。
 *
 * ── 为什么这一页断言了具体声明(`chat/AGENTS.md` §5 一般不许)────────────
 * §5 禁的是**组件**测试去嗅类名 —— 理由是那样会挡住 CSS Module 化。这里断的是
 * `.chat-log` 这条**刻意保留的全局跨组件布局契约**(根 `AGENTS.md`「Web CSS
 * ownership」把这类选择器留在 `styles/` 里),它不会变成 Module;而且缺陷本身就
 * 长在层叠里,不断声明就没有判据。w95 走的是同一个例外。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig } from '../../../src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

const translate = (key: string) => key;

vi.mock('../../../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/i18n')>();
  return { ...actual, useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }), useT: () => translate };
});
vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: () => <div data-testid="assistant" />,
}));
vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/* ── 层叠引擎(按属性泛化的 w95 版本)──────────────────────────────────── */

/** `index.css` 的 @import 顺序就是层叠顺序,别在测试里另排一套。 */
function stylesheetsInCascadeOrder(): string[] {
  const index = readFileSync(resolve(SRC, 'index.css'), 'utf-8');
  const out: string[] = [];
  for (const m of index.matchAll(/@import\s+'([^']+)'/g)) {
    const rel = m[1]!;
    if (!rel.startsWith('./styles/')) continue; // 只看 app 自己的样式表
    try {
      out.push(readFileSync(resolve(SRC, rel.replace(/^\.\//, '')), 'utf-8'));
    } catch {
      /* 生成物或缺席的表跳过 */
    }
  }
  return out;
}

/** 顶层逗号切选择器列表(`:is(a, b)` / `min(1px, 2%)` 里的逗号不能切)。 */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** (a, b, c) = id / class·attr·pseudo-class / type·pseudo-element */
function specificity(sel: string): [number, number, number] {
  const cleaned = sel.replace(/\s*[>+~]\s*/g, ' ');
  const ids = (cleaned.match(/#[\w-]+/g) ?? []).length;
  const classes = (cleaned.match(/\.[\w-]+/g) ?? []).length
    + (cleaned.match(/\[[^\]]+\]/g) ?? []).length
    + (cleaned.match(/:(?!:)[\w-]+/g) ?? []).length;
  const types = (cleaned.match(/(^|\s)[a-zA-Z][\w-]*/g) ?? []).length
    + (cleaned.match(/::[\w-]+/g) ?? []).length;
  return [ids, classes, types];
}

function specLess(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

/**
 * 一条规则体最终把 `flex-shrink` 定成什么。长写和 `flex` 简写都算,体内后写的赢。
 *
 * `flex` 简写的收缩系数是**第二个数字**;只有一个数字时(`flex: 1`)收缩系数补 1,
 * 关键字 `none` 展开成 `0 0 auto`、`auto` 展开成 `1 1 auto`、`initial` 是 `0 1 auto`。
 */
function flexShrinkOf(body: string): string | null {
  let value: string | null = null;
  for (const m of body.matchAll(/(^|;)\s*(flex(?:-shrink)?)\s*:\s*([^;]+)/g)) {
    const raw = m[3]!.trim();
    if (m[2] === 'flex-shrink') {
      value = raw;
      continue;
    }
    if (raw === 'none') { value = '0'; continue; }
    if (raw === 'auto') { value = '1'; continue; }
    if (raw === 'initial') { value = '1'; continue; }
    const numbers = raw.split(/\s+/).filter((p) => /^[\d.]+$/.test(p));
    value = numbers.length >= 2 ? numbers[1]! : '1';
  }
  return value;
}

/**
 * 按真实层叠算出这个元素的 `flex-shrink`。
 * 匹配交给 jsdom(可靠),优先级 + 源码顺序自己算(jsdom 不做这一层)。
 * 没有任何规则命中时返回 flex 项的初始值 `'1'` —— 这正是缺陷态的读数。
 */
function effectiveFlexShrink(el: Element): string {
  type Hit = { spec: [number, number, number]; order: number; value: string };
  const hits: Hit[] = [];
  let order = 0;
  for (const css of stylesheetsInCascadeOrder()) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectorList = m[1]!.trim();
      order += 1;
      if (selectorList.startsWith('@') || selectorList.includes('@')) continue;
      const value = flexShrinkOf(m[2]!);
      if (value == null) continue;
      for (const sel of splitTopLevel(selectorList)) {
        let matches = false;
        try {
          matches = el.matches(sel);
        } catch {
          continue; // 选择器 jsdom 认不了,跳过
        }
        if (matches) hits.push({ spec: specificity(sel), order, value });
      }
    }
  }
  if (hits.length === 0) return '1'; // flex 项的初始收缩系数
  let winner = hits[0]!;
  for (const hit of hits.slice(1)) {
    if (specLess(winner.spec, hit.spec)) winner = hit;
    else if (!specLess(hit.spec, winner.spec) && hit.order >= winner.order) winner = hit;
  }
  return winner.value;
}

/** 真实祖先链:`.app` 皮肤 → viewport → 流水 → 这一行。 */
function mountLogChild(childClass: string, opts: { inLog: boolean } = { inLog: true }): HTMLElement {
  const root = document.createElement('div');
  root.className = 'app';
  const viewport = document.createElement('div');
  viewport.className = 'chat-log-viewport';
  const child = document.createElement('div');
  child.className = childClass;
  if (opts.inLog) {
    const log = document.createElement('div');
    log.className = 'chat-log is-scrollable';
    log.append(child);
    viewport.append(log);
  } else {
    viewport.append(child);
  }
  root.append(viewport);
  document.body.append(root);
  return child;
}

function ruleBody(css: string, selector: RegExp): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const hit = selector.exec(stripped);
  if (!hit) throw new Error(`规则不见了: ${selector}`);
  return hit[1]!;
}

const chatCss = () => readFileSync(resolve(SRC, 'styles/chat.css'), 'utf-8');
const upgradeCss = () => readFileSync(resolve(SRC, 'components/chat/UpgradeCard.module.css'), 'utf-8');

describe('W96 · 流水里的行不许被 flex 压扁', () => {
  /**
   * 防真空 A:这个缺陷**只在列向 flex 滚动容器里存在**。
   * `.chat-log` 要是哪天不再是这个形态,下面每一条的意义都要重估。
   */
  it('前提:`.chat-log` 是列向 flex 滚动容器 —— 缺陷的土壤还在', () => {
    const body = ruleBody(chatCss(), /\.chat-log\s*\{([^}]*)\}/);
    expect(/display:\s*flex/.test(body)).toBe(true);
    expect(/flex-direction:\s*column/.test(body)).toBe(true);
    expect(/overflow-y:\s*auto/.test(body)).toBe(true);
  });

  /**
   * 防真空 B:量法必须**先能读出缺陷态的那个 1**。
   * 同一个盒子搬到流水外面就没人管它,读数必须是 flex 项的初始值 `1` ——
   * 只有这条成立,下面读出的 `0` 才能被解读成「有一条真规则命中了」,
   * 而不是「这个读数器不管命不命中都吐 0」。
   */
  it('量法能看见缺陷:同一个盒子挂在流水外面,收缩系数仍是默认的 1', () => {
    expect(effectiveFlexShrink(mountLogChild('up', { inLog: false }))).toBe('1');
  });

  /**
   * ★ 正向:**判据归容器**。流水的任意一个直接子元素都不许被压扁 ——
   * 包括今天还不存在的那些。把 `flex: none` 补在余额卡身上只能救这一张,
   * 下一张写 `overflow: hidden` 的卡会再中一次同样的招,而且照样长得像
   * 那张卡自己的渲染 bug。所以这里故意用一个**谁也没见过的类名**。
   */
  it('流水的任意直接子元素收缩系数为 0 —— 连没见过的类名也算', () => {
    expect(effectiveFlexShrink(mountLogChild('some-card-nobody-has-written-yet'))).toBe('0');
  });

  /** ★ 正向(点名症状):被报上来的那张余额卡自己也在这条不变量之下。 */
  it('升级卡挂进流水时收缩系数为 0', () => {
    expect(effectiveFlexShrink(mountLogChild('up'))).toBe('0');
  });

  /**
   * ★ 结构(不嗅类名,按 §5 断 `data-testid` 的父子关系):
   * 上面那条不变量只覆盖**直接子元素**。所以必须证明升级卡真的挂在流水下面 ——
   * 它要是哪天被包进一层壳,或者被挪成绝对定位的浮层(那就偏离 T51 的
   * 「流水里的一张卡,不是弹窗」),这条不变量就够不着它了。
   */
  it('`ChatPane` 把升级卡渲染成流水的直接子元素(T51:它是一行,不是浮层)', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        amrBalanceCardUsd={0.33}
        onOpenSettings={vi.fn() as never}
        conversations={[
          { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
        ]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
      />,
    );
    expect(screen.getByTestId('chat-upgrade-card').parentElement)
      .toBe(screen.getByTestId('chat-log'));
  });

  /**
   * ★ 反向 1:**不许靠删掉 `overflow: hidden` 来「修好」高度。**
   * 那样确实不再被压扁,但右上角那枚 `::after` 辉光和 16px 圆角就一起漏出去了 ——
   * 换一个缺陷交差。裁自己的溢出是这张卡的正当需求,兜底该在流水那一侧。
   */
  it('升级卡仍旧自己裁溢出 —— 修的是流水,不是把卡的圆角/辉光放跑', () => {
    expect(/overflow:\s*hidden/.test(ruleBody(upgradeCss(), /\.up\s*\{([^}]*)\}/))).toBe(true);
  });

  /**
   * ★ 反向 2:**Module 自己不许把收缩再打开。**
   * `.up` 那条规则里一个 `flex` / `flex-shrink` 都不该有 —— 有的话这笔账就变成
   * 两处说了算,而两处的胜负要看打包器怎么排 Module 与全局表的顺序。
   */
  it('`UpgradeCard.module.css` 的 `.up` 不自带 flex 声明 —— 这笔账只有一个出处', () => {
    expect(flexShrinkOf(ruleBody(upgradeCss(), /\.up\s*\{([^}]*)\}/))).toBeNull();
  });

  /**
   * ★ 反向 3:**底部让位那笔账一分没动。**
   * 让位只为**浮在流水上方**的东西算(药丸 44 + 呼吸 8 = 52)。余额卡是流水里的
   * 一行,随内容滚,一寸让位都不需要 —— 把它记进那 52px 里,有药丸没卡、有卡
   * 没药丸的场面都会多出一块死空白。
   * (52 与 20 这两个数各自的账见 `w95-plan-pill-bottom-reserve.test.tsx`;
   *  地板与 anchor 顶补之和恒定见 `w95-reserve-vs-anchor-spacer.test.ts`。)
   */
  it('底部让位没被改动:皮肤仍是 20px,药丸档仍是 52px', () => {
    const routines = readFileSync(resolve(SRC, 'styles/viewer/routines.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\.app \.chat-log,\s*\.chat-skin \.chat-log\s*\{[^}]*padding:\s*18px 18px 20px/.test(routines))
      .toBe(true);
    const reserve = ruleBody(
      chatCss(),
      /\.chat-log\.has-plan-pill-reserve\.has-plan-pill-reserve\s*\{([^}]*)\}/,
    );
    expect(/padding-bottom:\s*52px/.test(reserve)).toBe(true);
    expect(/scroll-padding-bottom:\s*52px/.test(reserve)).toBe(true);
  });
});
