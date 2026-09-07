// @vitest-environment jsdom
/**
 * W77 · 面板里**裸 `<button>`** 的字重要对上稿子的**真实渲染值**。
 *
 * ── 为什么不能照着稿子的声明抄 ────────────────────────────────────────
 * 稿子的全局复位(`8015870095:docs/design/chat-panel/src/components.css:170`)是:
 *
 *   button { font-family: inherit; border: none; background: none;
 *            cursor: pointer; color: inherit; font-size: var(--font-size-13) }
 *
 * **一条 `font-weight` 都不写**。照声明推,很容易推成「那就跟着 chat 根的排版
 * 基线走」—— 稿子 `body` 是 `font-weight: 500`,于是推出 500。**这条推理是错的。**
 *
 * 浏览器的 UA 样式表给 `<button>` 用的是 **`font` 简写**(Chrome:
 * `font: 400 13.3333px Arial`)。`font` 简写会把 `font-weight` 一并重置成 `400`,
 * 而且这是作者层之前的 UA 声明 —— 结果就是 `<button>` 的字重**默认不继承**。
 * 稿子既没写 `font-weight` 也没写 `font`,所以裸按钮**真实渲染出来是 400**,
 * 不是 500。
 *
 * 同一份稿子里 `.tool .fn { font: inherit }`(components.css:2235)正是反证:
 * 只有显式用 `font` / `font-weight` 盖掉 UA 那条,按钮才会回到继承值(实测 500)。
 *
 * ── 这个值是量出来的,不是推出来的 ────────────────────────────────────
 * 量法:真实 Chrome(Google Chrome 0.1.41 profile)打开设计交付页
 * `chat-panel-next-pr7170-8015870.html`(md5 `495992a904b6674dd07db4e0cb8d6f19`,
 * = PR #7170 @ `8015870095`,`specs/current/chat-panel-dispatch-2026-09-02.md`
 * 认定的唯一最新设计基准),对 `getComputedStyle(el).fontWeight` 逐颗读。
 *
 * 2026-09-02 实测(293 颗 `<button>`):**400 × 195 / 500 × 43 / 600 × 55**。
 * 其中最直接的一条对照 —— 往稿子的 `.bub`(自身计算字重 500)里**同时**插一颗
 * 无类名 `<button>` 和一个 `<span>`,同一次读:
 *
 *   注入的 `<button>` → **400**      注入的 `<span>` → **500**
 *
 * 同一个父元素、同一次读、同一把尺:按钮 400、span 500。这既证明了裸按钮是 400,
 * 也证明了读法**分得出** 400 和 500(不是到处读回同一个常数),还顺带证明了
 * 「按钮不继承字重」——span 读回的 500 就是「如果继承会是多少」。
 *
 * ── 我们这边量到的 ────────────────────────────────────────────────────
 * 同一台 Chrome,把产品真实样式表按 `index.css` 顺序拼成一页(tokens / material /
 * app-wash / base / components styles.css / primitives / chat.css + ChatRoot 与
 * Button 两张 module),在 `[data-chat-root]` 里放同样几颗按钮,实测:
 *
 *   面板内裸 button **500**   面板内共享 `.button` 500   面板外裸 button 500
 *
 * 也就是说改动前面板里的裸按钮比稿子重一档。根因是 `primitives.css` 的全局
 * `button` 先写 `font: inherit` 再写 `font-weight: 500`(后者赢),而本文件原来
 * 那条 `:where([data-chat-root]) button { font-weight: inherit }` 只是把它拨回
 * 「继承」—— 面板基线又正好是 500(`ChatRoot.module.css:144`),于是还是 500。
 *
 * ── 这把尺子看不见 UA 默认值,所以断言只钉「我们声明了什么」 ──────────
 * `tests/helpers/chat-mirror-cascade.ts` **不建模浏览器 UA 样式表**,jsdom 也不
 * 完整实现 `<button>` 的 `font` 简写。所以下面的用例断言的是**层叠里谁赢、赢出
 * 来的声明值是多少**,而「400 从哪来」由上面那段真机实测背书,不由本文件证明。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResolver, hashed, specificityTuple } from '../../helpers/chat-mirror-cascade';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

/** 稿子裸按钮的**真实渲染字重**(上面 docblock 记的实测法)。 */
const SPEC_BARE_BUTTON_WEIGHT = '400';
/** 面板排版基线(`ChatRoot.module.css:144`)—— 裸按钮**不**应该等于它。 */
const PANEL_BASELINE_WEIGHT = '500';

/**
 * CSS Module 在产线上是哈希类名,全局表里的同名类**匹配不到**它。
 * 这里用一个假哈希把这件事照抄过来:共享 `Button` 的 `.button` 变成
 * `.w77-hashed-button`,免得量成一颗根本不存在的按钮。
 */
const BUTTON_HASH = { button: 'w77-hashed-button' } as const;

/** 产品 `src/index.css` 的导入顺序,只取够得着这几颗按钮的那些。 */
const SHEETS = [
  read('src/styles/tokens.css'),
  read('src/styles/material.css'),
  read('src/styles/app-wash.css'),
  read('src/styles/base.css'),
  readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  hashed(
    readFileSync(resolve(WEB, '../../packages/components/src/button.module.css'), 'utf-8'),
    BUTTON_HASH as unknown as Record<string, string>,
  ),
];

const CSS = createResolver(SHEETS, [read('src/styles/tokens.css'), read('src/styles/base.css')], [
  'font-weight',
]);

/** 面板内 / 面板外各摆几颗,一次全量出来 —— 免得「改动只在某一颗上成立」。 */
interface Fixture {
  bareInPanel: Element;
  sharedInPanel: Element;
  bareOutsidePanel: Element;
}

let fx: Fixture;

beforeAll(() => {
  document.body.innerHTML = '';

  const panel = document.createElement('div');
  panel.setAttribute('data-chat-root', '');

  const bareInPanel = document.createElement('button');
  panel.append(bareInPanel);

  const sharedInPanel = document.createElement('button');
  sharedInPanel.className = BUTTON_HASH.button;
  panel.append(sharedInPanel);

  const bareOutsidePanel = document.createElement('button');

  document.body.append(panel, bareOutsidePanel);
  fx = { bareInPanel, sharedInPanel, bareOutsidePanel };
});

const weightOf = (el: Element): string => CSS.resolved(el)['font-weight'] ?? '<missing>';

describe('W77 面板里的裸 button 按稿子的真实渲染值', () => {
  /* ── 正向 ──────────────────────────────────────────────────────────── */
  it('面板内一颗裸 button 的字重 = 稿子实测的 400', () => {
    expect(weightOf(fx.bareInPanel)).toBe(SPEC_BARE_BUTTON_WEIGHT);
  });

  it('赢的那条就是 chat.css 的 `:where([data-chat-root]) button`', () => {
    const winner = CSS.declaring(fx.bareInPanel, 'font-weight').at(-1);
    expect(winner?.selector).toBe(':where([data-chat-root]) button');
  });

  it('不是「跟着面板基线走」—— 400 必须和基线 500 是两个值', () => {
    expect(weightOf(fx.bareInPanel)).not.toBe(PANEL_BASELINE_WEIGHT);
  });

  /* ── 反向对照:自带字重的按钮不许跟着变 ───────────────────────────── */
  it('共享 `Button` 的 `.button` 仍是自己的 500,没被压平', () => {
    expect(weightOf(fx.sharedInPanel)).toBe(PANEL_BASELINE_WEIGHT);
  });

  it('`.button` 的字重由 button.module.css 判,不由 chat.css 那条判', () => {
    const winner = CSS.declaring(fx.sharedInPanel, 'font-weight').at(-1);
    expect(winner?.selector).toBe(`.${BUTTON_HASH.button}`);
  });

  /* ── 面板外不许被带走 ─────────────────────────────────────────────── */
  it('面板**外面**的裸 button 仍是全局 primitives 的 500', () => {
    expect(weightOf(fx.bareOutsidePanel)).toBe(PANEL_BASELINE_WEIGHT);
  });

  it('`[data-chat-root]` 这层围栏确实关得住 —— 面板外那颗根本匹配不到这条规则', () => {
    expect(fx.bareOutsidePanel.matches(':where([data-chat-root]) button')).toBe(false);
    expect(fx.bareInPanel.matches(':where([data-chat-root]) button')).toBe(true);
  });

  /* ── 防真空:量法必须分得出 400 和 500 ────────────────────────────── */
  it('同一次里三颗按钮读出两个不同的值,不是到处读回同一个常数', () => {
    const seen = [
      weightOf(fx.bareInPanel),
      weightOf(fx.sharedInPanel),
      weightOf(fx.bareOutsidePanel),
    ];
    expect(seen).toEqual([
      SPEC_BARE_BUTTON_WEIGHT,
      PANEL_BASELINE_WEIGHT,
      PANEL_BASELINE_WEIGHT,
    ]);
    expect(new Set(seen).size).toBe(2);
  });

  /* ── 围栏的特异性不许动 ───────────────────────────────────────────── */
  it('`:where()` 把这条压在 (0,0,1) —— 压得过全局 button、输给任何带类名的规则', () => {
    expect(specificityTuple(':where([data-chat-root]) button')).toEqual([0, 0, 1]);
    // 同为 (0,0,1) 的全局 `button`:靠 chat.css 排在 primitives.css 之后取胜。
    expect(specificityTuple('button')).toEqual([0, 0, 1]);
    // 任何带类名的规则都更重,所以自带字重的按钮一律照旧。
    expect(specificityTuple(`.${BUTTON_HASH.button}`)).toEqual([0, 1, 0]);
  });
});
