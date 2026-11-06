// @vitest-environment jsdom
/**
 * W76 · 执行记录行首那只**图标槽的盒子**。
 *
 * 基线 `729fa43ce7`(`docs/design/chat-panel/src/`,不看构建产物)。
 *
 * ── 稿子怎么说 ──────────────────────────────────────────────────────
 *
 * 稿子把行首那一格拆成**两个尺寸**,而且写了理由:
 *
 *     components.css:2206  .tool .ti          { width: 15px; height: 15px; … }
 *     components.css:2238  .fold > summary .ti{ width: 15px; height: 15px; … }
 *     components.css:2239  「工具调用图标占 16px;没有图标的行首圆点和计划序号保持原尺寸。」
 *     components.css:2240  .tool .ti:has(> svg),
 *     components.css:2241  .fold > summary .ti:has(> svg) { width: 16px; height: 16px; }
 *     components.css:2207  .ti > svg          { width: 16px; height: 16px; … }
 *
 * 也就是:**槽里放着图标时,槽和图标一样大(16)**;槽里是那颗 5px 圆点或计划序号时
 * 才留在 15。状态记号 `.mk`(绿勾 / 渐变球 / 红叉)是另一族,稿子全程 15,不吃这一条。
 *
 * ⚠️ 判据不是这段注释,是**把稿子那份 CSS 在稿子那份 HTML 上真算一遍**的胜出值。
 * 算的是 `body-components.html` 里 `data-od-id="progress-running"` 那一块(用户截图
 * 就是这一屏),9 条工具行逐条量到:
 *
 *     .ti      → width 16px / height 16px / color #202020
 *     .ti>svg  → width 16px / height 16px / color #202020
 *     .mk.is-ok / .mk.is-run → 15px      .pk(计划序号)→ 15px
 *
 * 反向对照也在稿子里现成:同一份文件的 `progress-done` / `progress-failed` 两块里
 * `.ti` 是**空的**(`<span class="ti"></span>`),同一把尺子在那儿量到 15px ——
 * 证明 16 确实由 `:has(> svg)` 给出,不是量尺到处读回同一个常数。
 *
 * ── 我们这边错在哪 ──────────────────────────────────────────────────
 *
 * `record.module.css` 只搬了 `.icon > svg` 那 16px,槽本身停在 15px:一只 15px 的
 * 盒子里装着 16px 的字形,`place-items: center` 让它两边各探出 0.5px。
 * 那条 `:has(> svg)` 从上一版基线 `361b78253e` 起就在稿子里,一直没被搬过来。
 *
 * ── 为什么写成无条件的 16,而不是照抄 `:has(> svg)` ────────────────────
 *
 * 稿子那个条件是用来把**圆点**和**计划序号**留在 15 的。这两样在产品里根本不住这只
 * 槽:圆点被产品 2026-08-25 裁掉(`icons.tsx` 的 `toolIcon` 永远给图标),序号是另一个
 * 类 `.step`。而这只槽在产品里还多住着一位:思考行「思考中」那一态放的是 `Orb` 的
 * `<canvas>`(`ExecutionShell.tsx:399`,box 20 + 左右各 -2px = 16px 实宽),**不是 svg**。
 * 照抄 `:has(> svg)` 会让「思考中」停在 15、「思考过程」跳到 16 —— 正好撞碎
 * `thinking-embedded.test.tsx` 钉的「两态共用同一只槽,左边缘不会跳」。
 * 所以搬的是稿子那个**值和意图**(装图标的槽 = 图标那么大),条件在产品的 DOM 里
 * 已经恒真。`.step` / `.mark` 留在 15,和稿子的 `.pk` / `.mk` 一一对上。
 *
 * ── 量法与它的边界 ──────────────────────────────────────────────────
 *
 * jsdom 不做层叠也不解 `var()`,所以走共享量尺 `tests/helpers/chat-mirror-cascade`
 * (只读)。`width` / `height` / `color` 本来就在它的 `expand()` 白名单里,不用扩。
 * 防真空:第一节先证明这把尺子在这几个元素上读得出**非默认值**,而且 15 和 16
 * 它分得开 —— 相等/不等断言在两边都读回 `<unset>` 时会静静地空过。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';
import recordStyles from '../../../src/components/chat/primitives/record.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { UNSET, createResolver, hashed, stripComments } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

/** 稿子算出来的胜出值(出处见文件头)。装图标的槽和它装的图标同宽。 */
const DESIGN_ICON_SLOT = '16px';
/** 稿子里**不装图标**的那两格:状态记号 `.mk` 与计划序号 `.pk`。 */
const DESIGN_MARK_SLOT = '15px';

/* ── 量尺 ─────────────────────────────────────────────────────────── */

const NUL = String.fromCharCode(0);

/** `hashed()` 会连 `:global(...)` 里的全局类一起改写,先摘出去再填回来。 */
function scopeModule(css: string, mod: unknown): string {
  const globals: string[] = [];
  const stashed = css.replace(/:global\(([^()]*)\)/g, (_m, inner: string) => {
    globals.push(inner.trim());
    return `${NUL}${globals.length - 1}${NUL}`;
  });
  return hashed(stashed, mod as Record<string, string>)
    .replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (_m, i: string) => globals[Number(i)] ?? '');
}

/** 从真文件里按「哪个块声明了这枚变量」抠出来包成 `:root`,不写死副本。 */
function varBlock(css: string, probe: string): string {
  const m = new RegExp(`\\{([^{}]*${probe}\\s*:[^{}]*)\\}`).exec(stripComments(css));
  if (!m?.[1]) throw new Error(`抠不到声明 \`${probe}\` 的那个块`);
  return `:root {${m[1]}}`;
}

/** 产品 `index.css` 的导入顺序**就是**层叠顺序 —— 不能手抄。 */
function globalSheets(): string[] {
  const index = read('index.css');
  return [...index.matchAll(/@import\s+'([^']+)'/g)]
    .map((m) => resolve(SRC, m[1] ?? ''))
    .flatMap((file) => {
      try { return [readFileSync(file, 'utf-8')]; } catch { return []; }
    });
}

const RECORD_CSS = read('components/chat/primitives/record.module.css');
const CHAT_ROOT_CSS = read('components/chat/ChatRoot.module.css');

const SHEETS = [
  ...globalSheets(),
  // 打包器把 module CSS 排在全局层之后
  scopeModule(CHAT_ROOT_CSS, chatRootStyles),
  scopeModule(RECORD_CSS, recordStyles),
];

const TOKEN_SHEETS = [
  read('styles/tokens.css'),
  read('styles/base.css'),
  varBlock(CHAT_ROOT_CSS, '--chat-text-strong'),
  varBlock(RECORD_CSS, '--chat-progress-detail-ink'),
];

const { resolved } = createResolver(SHEETS, TOKEN_SHEETS, ['width', 'height', 'color']);

/* ── 夹具:两个层级 × 四种住在这只槽里的东西 ────────────────────────── */

const R = recordStyles as unknown as Record<string, string>;
const cls = (name: string): string => {
  const got = R[name];
  if (!got) throw new Error(`record.module.css 没有 \`${name}\` 这个类`);
  return got;
};

const toolItem = (over: Record<string, unknown>): ShellItem => ({
  kind: 'tool', name: 'X', rawTitle: false, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
  file: null, delta: null, hits: null, ...over,
} as unknown as ShellItem);

const readRow = (id: string): ShellItem =>
  toolItem({ id, tool: 'read', title: `读取 ${id}`, file: { path: id, label: id } });
const createRow = (id: string): ShellItem =>
  toolItem({ id, tool: 'write', title: `新建 ${id}`, file: { path: id, label: id }, delta: { added: 182, removed: 0 } });
const execRow = (id: string): ShellItem =>
  toolItem({ id, tool: 'exec', title: '执行 npm run build', command: 'npm run build', terminal: '✓ built' });
const imageRow = (id: string): ShellItem =>
  toolItem({ id, tool: 'image', title: '生成配套插图' });
const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true } as unknown as ShellItem);
const plan = (steps: string[]): ShellItem => ({ kind: 'plan', steps } as unknown as ShellItem);
const step = (content: string, items: ShellItem[]): ShellItem => ({
  kind: 'todo',
  segment: { content, status: 'completed', recalled: false, abandoned: false, implicit: false, items, elapsedMs: 9_000 },
} as unknown as ShellItem);

/** 截图那一屏:计划 + 已完成的步骤 + 步骤抽屉里的读 / 新建 / 执行 / 生图,外加顶层一条工具行。 */
const SHELL = {
  kind: 'shell', seq: 0, status: 'succeeded', segments: [],
  thinking: false, stopped: false, elapsedMs: 72_000, quietMs: null,
  items: [
    plan(['复刻商品列表页', '抽出商品卡为共享组件']),
    think('两张图是同一套栅格。'),
    readRow('顶层.png'),
    step('复刻商品列表页', [
      readRow('首页.png'),
      createRow('product-list.html'),
      execRow('build'),
      imageRow('shots'),
      think('抽屉里的一段推理。'),
    ]),
  ],
} as unknown as Shell;

/** 壳挂在真的接缝下面,否则一半规则根本不参赛。 */
function mount(): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={SHELL} deferCollapsedBodies={false} />
    </I18nProvider>,
  );
  const app = document.createElement('div');
  app.className = 'app';
  const seam = document.createElement('div');
  seam.className = (chatRootStyles as unknown as Record<string, string>).root as string;
  seam.setAttribute('data-chat-root', '');
  app.appendChild(seam);
  seam.appendChild(container);
  document.body.appendChild(app);
  return seam;
}

function need<T extends Element>(el: T | null | undefined, what: string): T {
  if (!el) throw new Error(`夹具里没有${what}`);
  return el;
}

interface Slots {
  /** 行首那只图标槽(`.icon`) */
  icon: Element;
  /** 槽里那枚字形 */
  glyph: Element;
}

interface Picked {
  topTool: Slots;
  topThoughts: Slots;
  drawerTool: Slots;
  drawerCreate: Slots;
  drawerExec: Slots;
  drawerImage: Slots;
  drawerThoughts: Slots;
  /** 反向对照:计划序号 `.step` 与步骤状态记号 `.mark` */
  planNumber: Element;
  planTick: Element;
  stepMark: Element;
}

function slotsOf(host: Element, what: string): Slots {
  const icon = need(host.querySelector(`.${cls('icon')}`), `${what}的图标槽`);
  return { icon, glyph: need(icon.querySelector('svg, canvas'), `${what}槽里的字形`) };
}

function pick(): Picked {
  const root = mount();
  const shellBody = need(
    root.querySelector(`.${cls('flat')} > .${cls('body')}.${cls('stack')}`),
    '扁平壳的 body',
  );
  const planRow = need(shellBody.querySelector(`:scope > .${cls('stepRow')}`), '计划那一格');
  const stepRow = need(
    [...shellBody.querySelectorAll(`:scope > .${cls('stepRow')}`)][1],
    '步骤那一格',
  );
  const drawer = need(stepRow.querySelector(`:scope > .${cls('body')}.${cls('stack')}`), '步骤抽屉');
  const drawerTools = [...drawer.querySelectorAll(`:scope > .${cls('tool')}`)];
  const drawerFolds = [...drawer.querySelectorAll(`:scope > details`)];

  return {
    topTool: slotsOf(need(shellBody.querySelector(`:scope > .${cls('tool')}`), '顶层工具行'), '顶层工具行'),
    topThoughts: slotsOf(
      need(shellBody.querySelector(`:scope > .${cls('thoughts')} > summary`), '顶层思考行'),
      '顶层思考行',
    ),
    drawerTool: slotsOf(need(drawerTools[0], '抽屉里的读取行'), '抽屉读取行'),
    drawerCreate: slotsOf(need(drawerTools[1], '抽屉里的新建行'), '抽屉新建行'),
    drawerExec: slotsOf(
      need(drawerFolds.find((f) => !f.className.includes(cls('thoughts')))?.querySelector('summary'), '抽屉里的命令行'),
      '抽屉命令行',
    ),
    drawerImage: slotsOf(need(drawerTools[2], '抽屉里的生图行'), '抽屉生图行'),
    drawerThoughts: slotsOf(
      need(drawer.querySelector(`:scope > .${cls('thoughts')} > summary`), '抽屉思考行'),
      '抽屉思考行',
    ),
    planNumber: need(planRow.querySelector(`.${cls('step')}`), '计划里的序号'),
    planTick: need(planRow.querySelector(`summary .${cls('mark')}`), '计划头那枚勾'),
    stepMark: need(stepRow.querySelector(`:scope > summary .${cls('mark')}`), '步骤头那枚记号'),
  };
}

const box = (el: Element): { width: string; height: string } => {
  const r = resolved(el);
  return { width: r['width'] ?? UNSET, height: r['height'] ?? UNSET };
};

/* ── 第一节:防真空 ─────────────────────────────────────────────── */

describe('这把尺子看得见缺陷', () => {
  it('哈希改写是真的在做事 —— 不是 CSS Module 代理在瞎发类名', () => {
    expect(cls('icon')).not.toBe('icon');
    expect(cls('mark')).not.toBe('mark');
    expect(cls('step')).not.toBe('step');
  });

  it('夹具里两个层级的每一种槽都在,而且槽里真有字形', () => {
    const p = pick();
    const all: Array<[string, Slots]> = [
      ['顶层工具行', p.topTool], ['顶层思考行', p.topThoughts],
      ['抽屉读取行', p.drawerTool], ['抽屉新建行', p.drawerCreate],
      ['抽屉命令行', p.drawerExec], ['抽屉生图行', p.drawerImage],
      ['抽屉思考行', p.drawerThoughts],
    ];
    for (const [what, slots] of all) {
      expect(slots.icon.className, `${what}的槽不是共用的 .icon`).toContain(cls('icon'));
      expect(slots.glyph.tagName.toLowerCase(), `${what}槽里没有字形`).toMatch(/^(svg|canvas)$/);
    }
  });

  it('量尺读得出非默认值 —— 槽里那枚字形是稿子的 16px,不是 `<unset>` / `auto`', () => {
    const p = pick();
    const glyph = box(p.topTool.glyph);
    expect(glyph.width, '样式链没盖到字形本身').not.toBe(UNSET);
    expect(glyph.width, '读到的是 auto —— 等于没量').not.toBe('auto');
    expect(glyph.width).toBe(DESIGN_ICON_SLOT);
    expect(glyph.height).toBe(DESIGN_ICON_SLOT);
  });

  it('15 和 16 这把尺子分得开 —— 状态记号那一族读回的是 15', () => {
    const p = pick();
    // 稿子的 `.mk` 全程 15px,产品的 `.mark` 对应它。读得出 15,就证明
    // 下面那几条读到的 16 不是「到处读回同一个常数」。
    expect(box(p.stepMark).width).toBe(DESIGN_MARK_SLOT);
    expect(box(p.stepMark).width).not.toBe(DESIGN_ICON_SLOT);
  });
});

/* ── 第二节:装图标的槽 = 图标那么大(两个层级) ────────────────────── */

describe('行首图标槽的盒子 —— 稿子 `.ti:has(> svg)`(729fa43ce7:2240)', () => {
  const LEVELS = [
    ['顶层 · 工具行', (p: Picked) => p.topTool],
    ['顶层 · 思考行', (p: Picked) => p.topThoughts],
    ['抽屉 · 读取行', (p: Picked) => p.drawerTool],
    ['抽屉 · 新建行', (p: Picked) => p.drawerCreate],
    ['抽屉 · 命令行(可折叠)', (p: Picked) => p.drawerExec],
    ['抽屉 · 生图行', (p: Picked) => p.drawerImage],
    ['抽屉 · 思考行', (p: Picked) => p.drawerThoughts],
  ] as const;

  for (const [what, take] of LEVELS) {
    it(`${what}:槽是 16 × 16`, () => {
      const slots = take(pick());
      expect(box(slots.icon), `${what}的图标槽`).toEqual({
        width: DESIGN_ICON_SLOT,
        height: DESIGN_ICON_SLOT,
      });
    });
  }

  it('槽和它装的字形**一样大** —— 字形不再从盒子里探出去', () => {
    const p = pick();
    for (const [what, slots] of [
      ['顶层工具行', p.topTool], ['抽屉读取行', p.drawerTool], ['抽屉命令行', p.drawerExec],
    ] as const) {
      expect(box(slots.icon), `${what}:槽和字形不同宽,字形会探出盒子`).toEqual(box(slots.glyph));
    }
  });
});

/* ── 第三节:反向对照 —— 没让它改的那两格别跟着改 ────────────────── */

describe('反向对照 · 不装图标的那两格仍是 15', () => {
  /*
   * 稿子把这条写成条件式,就是为了**只**抬装图标的那一格:
   *   「工具调用图标占 16px;没有图标的行首圆点和计划序号保持原尺寸。」
   * 少了这一节,把行首整族一律改成 16 也能让上面全绿,而那会把状态记号和
   * 计划序号一起顶大 —— 步骤那一列的绿勾、渐变球、红叉全部走形。
   */
  it('计划里的序号 `.step` 仍是 15', () => {
    expect(box(pick().planNumber).width).toBe(DESIGN_MARK_SLOT);
  });

  it('计划头那枚勾、步骤头那枚记号 `.mark` 仍是 15 × 15', () => {
    const p = pick();
    for (const [what, el] of [['计划头', p.planTick], ['步骤头', p.stepMark]] as const) {
      expect(box(el), `${what}的状态记号`).toEqual({
        width: DESIGN_MARK_SLOT,
        height: DESIGN_MARK_SLOT,
      });
    }
  });

  it('槽里那枚字形本身没被顶大 —— 动的是盒子,不是图标', () => {
    const p = pick();
    expect(box(p.drawerTool.glyph).width).toBe(DESIGN_ICON_SLOT);
    expect(box(p.drawerImage.glyph).width).toBe(DESIGN_ICON_SLOT);
  });
});
