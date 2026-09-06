// @vitest-environment jsdom
/**
 * N5:**没有清单的平铺壳**里,夹在两条步骤中间的正文要落回 22px 那条竖线并接上线。
 *
 * 用户裁决(2026-08-27):「缩进你要看看有没有 todo,如果文本不在 todo 下面,你看是这样的」
 * —— 配图是一张**有清单**的壳,开场白贴最左。
 *
 * ⚠️ **2026-09-02 修正判据**:那次裁决要的是「开场白贴左」,当时的落法是给整条规则挂
 * `:not(.hasTodo)`,把**有清单的壳整张排除**。真实 DOM 逐格量过之后发现挡错了东西 ——
 * 开场白之所以贴左靠的是选择器本身(`:is(.fold, .tool) ~ .think` 要求前面已经有过一格,
 * 而开场白是壳 body 的第一个孩子),`:not(.hasTodo)` 真正挡掉的是**中间那几句小结**,
 * 而它们正是稿子点名要 12px + 静音灰 + 22px + 接线的那几句。
 * 用户 2026-09-02 并排对比截图指出的就是这个。判据因此回到**结构位置**:
 *   · 前面没有步骤(开场白)→ 13px + 正文深色,贴左
 *   · 前后都有步骤(小结)  → 12px + 静音灰 + 22px + 接线,**有没有清单都一样**
 *   · 后面没有步骤(收尾)  → 同开场白
 * 计算值那一层由 `record-ink-layers.test.tsx` 用真层叠钉着(两种壳都量)。
 *
 * 为什么原来不生效:设计稿那条规则写的是 `.fold ~ .think:has(~ .fold)`,**只认 `.fold`**。
 * 而工具行有两种 DOM —— 能展开的(命令、有输出)走 `Foldable` → `details.fold`,
 * 不能展开的(读取 / 改写 / 搜索)是 `ToolRow` 直接返回的 `div.tool`。
 * 真实产品里没输出的调用占多数,于是夹心正文一条都匹配不上。
 * 设计稿注释写的意图是「**前后都还有步骤**,中间这段才该接上」——「步骤」不是「可折叠的步骤」。
 *
 * 这里钉的是**选择器文本与特异性**,不是渲染结果:CSS Module 在 jsdom 里不参与层叠,
 * 只有把规则本身读出来比对才照得出「祖先掉了导致层叠翻转」这类事故。
 * 同一副打法见 `next-step-cascade.test.ts` / `record-cascade.test.ts`。
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
 * 取出所有选择器(逗号分隔的每一支单独成条)。
 *
 * **只切顶层逗号**:`:is(.fold, .tool)` / `:has(~ :is(.a, .b))` 里面的逗号是参数分隔,
 * 一刀切下去会把一支选择器劈成两条假的,断言全部失真 —— 第一版就是这么写挂的。
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

const selectors = CSS
  .split('}')
  .map((block) => block.split('{')[0] ?? '')
  .flatMap(splitTopLevel)
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const has = (needle: string): boolean => selectors.some((s) => s === needle);

describe('N5 夹心正文落回 22px 竖线', () => {
  /*
   * ⚠️ **2026-09-02 又翻了一次。** 这一条原来钉的是「认两种步骤形态」——
   * `:is(.fold, .tool)`,把工具行也算成一步(§F-11 ① 的口径)。
   * 用户当天把「步骤」收窄成**清单那一层**:「如果是在 todo 外的 toolrow 或者
   * 普通文本,或者 thinking,不要有任何的缩进了,也不要这个竖着的灰线」。
   * 判据因此从「是哪种 DOM」换成「**是不是一步**」——
   * `ExecutionShell` 给 todo / plan 那两种 `Foldable` 挂 `stepRow`,CSS 只认它。
   * 这是正面判据:以后新增块型默认不在链上,漏的方向是安全的那一边。
   */
  it('前后都要认**步骤**这一层,不再把工具行当成一步', () => {
    const rail = selectors.filter((s) => s.includes('.think:has('));
    expect(rail.length).toBeGreaterThan(0);
    for (const s of rail) {
      expect(s).toMatch(/\.stepRow ~ \.think/);
      expect(s).toMatch(/:has\(~ \.stepRow\)/);
      // 旧口径不许回来:工具行不是一步
      expect(s).not.toMatch(/:is\(\.fold, ?\.tool\) ~ \.think/);
    }
  });

  /*
   * ⚠️ 这一条 2026-09-02 **翻了向**:原来钉的是「每一支都要带 `:not(.hasTodo)`」,
   * 现在钉的是「一支都不许带」。理由见文件头 —— 那个排除挡掉的不是开场白
   * (开场白靠 `~` 前驱判据天然出局),而是稿子点名要静音的那几句步骤间小结;
   * 而 `hasTodo` 又把 `kind === 'plan'` 也算进去,于是**只要这一轮出过执行计划,
   * 整条规则就失配** —— 用户截图里正好有「执行计划 · 4 步」。
   */
  it('**不许再挂 `:not(.hasTodo)`** —— 有没有清单都要认这几句小结', () => {
    const rail = selectors.filter((s) => s.includes('.think:has('));
    expect(rail.length).toBeGreaterThan(0);
    for (const s of rail) {
      expect(s).not.toContain('hasTodo');
    }
  });

  it('开场白靠**前驱判据**出局,不靠壳上的标记 —— 这是上一条能撤的前提', () => {
    // `:is(.fold, .tool) ~ .think` 要求这段文字前面已经有过一格;
    // 开场白是壳 body 的第一个孩子,一条都命中不了。
    const rail = selectors.filter((s) => s.includes('.think:has('));
    for (const s of rail) {
      expect(s).toMatch(/> \.stepRow ~ \.think/);
    }
  });

  /*
   * ⚠️ **2026-09-02 设计裁决:那条竖线整个不要了。** 这一条原来钉的是
   * 「缩进和竖线是同一条规则的两半,不能只搬一半」;线撤销之后翻向成
   * 「只剩缩进那一半,一段线都不许留」。
   *
   * 缩进为什么留:稿子写这条规则时第一句是「让它的**首字和上面那行步骤名对齐**」
   * —— 那是层级表达,不依赖线。后面「不让的话线正好从这几个字头上穿过去」是**逼**出
   * 这个数的那个理由,现在没有了;两者的取舍已上报,产品未拍板前保持原值。
   */
  it('只剩缩进那一半 —— 竖线那一半整条撤掉了', () => {
    const rail = selectors.filter((s) => s.includes('.think:has('));
    expect(rail.some((s) => !s.endsWith('::before'))).toBe(true);
    expect(rail.some((s) => s.endsWith('::before'))).toBe(false);
  });

  it('祖先链一个都不能省 —— 少一段就换了一个层叠位置', () => {
    const rail = selectors.filter((s) => s.includes('.think:has('));
    for (const s of rail) {
      expect(s.startsWith('.fold.flat')).toBe(true);
      expect(s).toContain('> .body.stack >');
    }
  });

  it('夹心正文那 22px 不许动 —— 它对齐的是上面那一行的**名字**,不是它的图标', () => {
    /*
     * ⚠️ **这条 2026-08-27 换过一次基准。**
     *
     * 原来它钉的是「工具行自己那 22px 不许动 —— 它和稿子逐字相同」,读的是
     * `.fold.flat > .body.stack > .tool { padding: 5px 7px 5px 29px }`。
     * 那条规则确实和稿子逐字相同,但**抄错了位置**:把交付稿放进 Chrome 数过,
     * `.fold.mod-flat > .body.mod-stack > .tool` 在稿子自己的 84 格里命中 **0 处** ——
     * 稿子里工具行永远住在某个步骤里面,顶层清一色是步骤。用户 2026-08-27 指出
     * 「todo 外面的工具调用应该也没这个缩进吧?」之后,顶层工具行挪回第 0 列。
     *
     * 夹心正文那 22px **没有跟着动**,因为它的依据从来不是工具行的缩进:
     * 稿子写的是「让它的首字和上面那行步骤名对齐…22 = 步骤行的 7 内边距 + 状态点 15」。
     * 顶层的行首那一格挪没挪,名字都还在 22。真机量过(§F-18):
     * 顶层行图标 0 / 名字 22~23,夹心正文 22 —— 对齐关系原样保住。
     */
    expect(has('.fold.flat > .body.stack > .tool')).toBe(true);
    expect(CSS).toMatch(/\.fold\.flat > \.body\.stack > \.tool \{[^}]*padding: 5px 7px/);

    const proseBlock = CSS.split('}')
      .find((b) => (b.split('{')[0] ?? '').includes('.think:has(') && !(b.split('{')[0] ?? '').includes('::before'));
    expect(proseBlock).toBeDefined();
    expect(proseBlock).toMatch(/padding-inline-start:\s*22px/);
    // 正向对照:22 是从「7 内边距 + 15 状态点」来的,那两个数还在原处
    expect(CSS).toMatch(/\.fold\.flat > \.body\.stack > \.fold > summary \{[^}]*padding: 5px 7px/);
    /*
     * 状态点那 15px 原来读的是 `--row-slot`,但那枚变量**只为竖线服务**
     * (线的中轴 = 那一格的一半),2026-09-02 线撤销时一并清掉了。
     * 15 现在直接写在 `.mark` 上 —— 读它才是读真正的出处。
     */
    expect(CSS).toMatch(/\.mark \{[^}]*width: 15px/);
  });

  /**
   * 上面几条只读了 CSS 文本 —— 文本对了不等于**标记真的落到 DOM 上**。
   * `.hasTodo` 如果被 CSS Module 当空规则优化掉,`styles.hasTodo` 就是 undefined,
   * `className={undefined}` 静默无事发生,整条判据废掉而所有文本断言照旧全绿。
   */
  describe('标记要真的落到壳上', () => {
    const shellOf = (items: ShellItem[]): Shell => ({
      kind: 'shell', seq: 0, status: 'succeeded', items,
      thinking: false, stopped: false, elapsedMs: null, quietMs: null,
    } as unknown as Shell);
    const show = (items: ShellItem[]) => render(
      <I18nProvider initial="zh-CN"><ExecutionShell shell={shellOf(items)} /></I18nProvider>,
    ).container.querySelector('details');

    const tool = { kind: 'tool', id: 't', tool: 'read', title: '读取 a.png', elapsedMs: 400, failed: false } as ShellItem;
    const todo = { kind: 'todo', segment: { content: '复刻列表页', status: 'completed', items: [], struck: false } } as unknown as ShellItem;

    it('有清单 → 壳带 hasTodo', () => {
      expect(show([todo, tool])?.className).toMatch(/hasTodo/);
    });

    it('没清单 → 壳不带', () => {
      expect(show([tool])?.className ?? '').not.toMatch(/hasTodo/);
    });
  });
});
