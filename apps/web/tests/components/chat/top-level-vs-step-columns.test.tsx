// @vitest-environment jsdom
/**
 * N8:**壳里只有两套列。**
 *
 * ⚠️ 标题原来是「壳里只有两套列,**链穿过顶层的每一格**」。链那一半 2026-09-02
 * 被设计裁决整个撤掉(见下面 N8-a / N8-b 的墓碑注释),这份文件现在只剩列这一半。
 *
 * ── 用户当天两条(逐字)────────────────────────────────────────
 *
 * ① 指着一张跑完的壳:「这里衔接咋是这样的?」——线沿着上面那条命令步骤的正文走下来,
 *    走到「思考过程」那一格断掉,下面的步骤再重新起一条。
 * ② 指着顶层 Thoughts 左边那个空槽:「这里不是说要动态判断间距吗? 像这里如果是
 *    todo 外面, 不应该有这个缩进? todo 外面的工具调用应该也没这个缩进吧?」
 *
 * **两条是同一个病**:顶层的工具行 / 思考那一格被缩进了 22px,而链的 x 又是照
 * 「顶层贴左」写死的 14.5px —— 于是它们既比邻居右了一格,又接不上那条线。
 *
 * ── 去交付稿里核过的三件事(真 Chrome,`docs/design/chat-panel-next.html`,md5 28ea4c65…)──
 *
 * 1. 稿子里有没有「壳里没有清单、工具行直接平铺」的格子?**没有。**
 *    把整份稿子放进 Chrome 数过:`.fold.mod-flat > .body.mod-stack > .tool` 命中 **0 处**。
 *    组件 9 / 10 / 11 / 12 那几格单独演示工具行时,外面照样套着一层
 *    `details.fold`(带 `.mk` 状态点的**步骤**),工具行住在它里面。
 * 2. 顶层和步骤里面是不是两套列?**是。** 逐行量到:
 *    顶层 `details.fold` 的 `.mk` 落 **0**(宽 15)、步骤名落 22;
 *    步骤**里面**的子行(`.tool` 的图标、`.pk` 的序号、嵌一层的折叠头)一律落 **22**。
 * 3. 那 22px 从哪来?稿子原话:「缩进一格(**状态点 15 + 间距 7 = 22**)」——
 *    让开步骤自己那颗状态点。所以它是「**步骤里面**」的列,不是「工具行」的列;
 *    顶层没有那颗要让的点,自然不该占这一格。
 *
 * 我们的壳头永远是「进行中 / 已完成」,从来不是一个步骤 —— 顶层的工具行 / 思考
 * 没有「谁的子项」可言,它们就是链上的一格,该和步骤同列。
 *
 * ── 这个文件钉四件事 ────────────────────────────────────────
 *
 * N8-a 顶层三种 DOM(步骤 / `div.tool` / 思考)同一列,链一格都不落下
 * N8-b 线的 x **按各行自己的缩进算**,不再一处写 14.5、另一处写 7.5
 * N8-c 顶层和清单抽屉里是**两套**列,各自内部一致(反向对照:两个值不相等)
 * N8-d 选择器真的能命中:壳里确实是这个 DOM
 *
 * jsdom 不做布局,几何**不在这里量**;真机数字在 Chrome 里量,记在
 * `specs/current/chat-panel-feedback.md` §F-18(含 harness 与逐行表)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');   // 注释里有逗号和选择器样子的文字,先剥掉

/**
 * 只切**顶层**逗号。`:is(.fold, .tool)` / `:has(~ :is(.a, .b))` 里面的逗号是参数分隔,
 * 一刀切下去会把一支选择器劈成两条假的(`sandwiched-prose-rail.test.tsx` 里踩过)。
 */
function splitTopLevel(head: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of head) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

interface Rule { selector: string; body: string }

const RULES: Rule[] = CSS.split('}').flatMap((block) => {
  const [head, body] = block.split('{');
  if (head == null || body == null) return [];
  return splitTopLevel(head)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((selector) => ({ selector, body }));
});

/** 某条规则里某个属性的值(取最后一次赋值,和层叠一致) */
function declOf(selector: string, prop: string): string | null {
  let found: string | null = null;
  for (const rule of RULES) {
    if (rule.selector !== selector) continue;
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule.body);
    if (m?.[1]) found = m[1].trim();
  }
  return found;
}

const px = (v: string | null): number => Number.parseFloat(v ?? 'NaN');

/*
 * ⚠️ **N8-a / N8-b 两节 2026-09-02 整节删除。**
 *
 * 它们钉的是那条串起各步骤的竖线:线该穿过哪几格、线的横轴由哪几个数算出来、
 * 两种线段是不是落在同一条绝对轴上。设计裁决把**那条线整个撤掉**了
 * (用户原话「这个灰色竖线不要了,设计同学说」),规则、变量、伪元素一并清空,
 * 断言也就没有对象可断了 —— 与其留一堆翻向成「不许有线」的空壳,
 * 不如把「样式表里一段链都不许再有」收成一条,放在
 * `record-chain-scope.test.tsx`(它从**规则**那头封死,比逐格问强)。
 *
 * 这一节剩下的两组是**列**和**DOM 形状**,和线无关,原样留着。
 */

/* ── N8-c 顶层 vs 清单抽屉:两套列 ──────────────────────────── */

describe('N8-c 顶层和清单抽屉是两套列,各自内部一致', () => {
  /**
   * 真机量到的(§F-18,坐标相对壳 body 内容盒):
   *   顶层    步骤 0 / `div.tool` 0 / 思考 0
   *   抽屉里  子工具行 22 / 思考 22 / 嵌一层的折叠头 22
   * 这里读的是导出这两组数的那几条规则。
   */
  const TOP_ROWS: Array<[string, string]> = [
    ['步骤 / 可展开的工具行', '.fold.flat > .body.stack > .fold > summary'],
    ['不可展开的工具行', '.fold.flat > .body.stack > .tool'],
  ];

  it('顶层:三种行取同一个内边距,思考那一格没有自己的一份', () => {
    for (const [what, selector] of TOP_ROWS) {
      expect(declOf(selector, 'padding'), what).toBe('5px 7px');
    }
    /*
     * 思考那一格在**顶层**没有自己的缩进规则 —— 和步骤、工具行同吃那一档
     * `padding: 5px 7px`。留一条专属规则就是留一个会各走各的地方。
     *
     * ⚠️ 2026-09-02 中间试过一版「列挂到抽屉、summary 归零」,为的是让悬停底和
     * 灰底面板**齐平**;用户看了说齐平反而丑(「应该允许比下面的超出一点点,
     * 有个 padding 而已」),于是收回 —— 顶层这一档回到没有专属规则的样子,
     * 悬停底靠 summary 自己那 7px 内距比面板宽出一圈。只有**嵌在步骤里**那一档
     * 还留着拆分(抽屉 22 + summary 7 = 原来的 29),因为那一列本来就要拆。
     */
    expect(declOf('.fold.flat > .body.stack > .fold.thoughts > summary', 'padding-inline-start')).toBeNull();
    expect(declOf('.fold.flat > .body.stack > .fold.thoughts', 'padding-inline-start')).toBeNull();
  });

  it('抽屉里:三种行同为 29px', () => {
    expect(declOf('.fold.flat .body.stack :is(.body.stack, .body.stream) > *', 'padding-inline-start')).toBe('29px');
    expect(declOf('.fold.flat .body.stack .body.stack > .fold > summary', 'padding-inline-start')).toBe('29px');
  });

  it('**反向对照**:同一种行在两处取到的值**不相等**', () => {
    /*
     * 这一条是上两条的照妖镜:只断言「顶层是 7」的话,把所有行一律改成 7 也能绿,
     * 而那会把抽屉里的子行一起拽到最左,清单和它的子项就分不出层级了。
     * 两处的差正好是那颗状态点占的一格:29 − 7 = 22 = 状态点 15 + 间距 7。
     */
    const top = px(declOf('.fold.flat > .body.stack > .fold > summary', 'padding')?.split(/\s+/)[1] ?? null);
    const inner = px(declOf('.fold.flat .body.stack .body.stack > .fold > summary', 'padding-inline-start'));
    expect(top).not.toBeCloseTo(inner, 5);
    /* 15 原来读的是 `--row-slot`,那枚变量只为竖线服务(线的中轴 = 它的一半),
       2026-09-02 随线一起清掉;现在直接读它真正的出处 —— 行首那枚标记自己的宽。 */
    const slot = px(/\.mark \{[^}]*width:\s*([0-9.]+)px/.exec(CSS)?.[1] ?? null);
    expect(Number.isFinite(slot), '读不到 .mark 的宽').toBe(true);
    expect(inner - top).toBeCloseTo(slot + 7, 5);
  });
});

/* ── N8-d 选择器真的能命中 ──────────────────────────────────── */

describe('N8-d 壳里确实是「步骤 / 思考 / 步骤 / 工具行」几个平级兄弟', () => {
  const cmd = (id: string, title: string): ShellItem => ({
    kind: 'tool', id, tool: 'bash', title, name: 'Bash', rawTitle: false,
    file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
    failed: false, failReason: null, command: 'ls -la', terminal: 'total 0',
  } as unknown as ShellItem);
  const readRow = (id: string): ShellItem => ({
    kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
    file: { path: id, label: id }, delta: null, hits: null, pattern: null, elapsedMs: 400,
    failed: false, failReason: null, command: null, terminal: null,
  } as unknown as ShellItem);
  const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true } as ShellItem);

  const shell = {
    kind: 'shell', seq: 0, status: 'succeeded', segments: [],
    thinking: false, stopped: false, elapsedMs: 130_000, quietMs: null,
    items: [
      cmd('c1', 'List project workspace'),
      think('计划(5 步)…'),
      cmd('c2', 'Write the one-pager'),
      readRow('a.png'),
    ],
  } as unknown as Shell;

  it('四格全是壳 body 的直接子代,且混着 details 和 div', () => {
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <ExecutionShell shell={shell} deferCollapsedBodies={false} />
      </I18nProvider>,
    );
    const body = container.querySelector('details[class*="flat"] > div[class*="body"]');
    expect(body).not.toBeNull();
    const kids = Array.from(body?.children ?? []);
    expect(kids).toHaveLength(4);
    expect(kids.map((el) => el.tagName)).toEqual(['DETAILS', 'DETAILS', 'DETAILS', 'DIV']);
    expect(kids[1]?.className).toMatch(/thoughts/);
    // 混着两种标签 —— `:*-of-type` 数不对的那个前提在这儿是真的
    expect(kids[3]?.className).toMatch(/tool/);
  });
});
