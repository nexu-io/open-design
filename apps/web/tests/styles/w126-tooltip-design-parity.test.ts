/**
 * Tooltip 气泡对稿 —— 产品裁决 2026-09-03：**全站都改成稿子这套**。
 *
 * 稿子基线 `729fa43ce7`(PR #7170,`design/chat-cards-surface`),原件
 * `docs/design/chat-panel/src/components.css:2699-2707`:
 *
 *     [data-tip]::after {
 *       content: attr(data-tip);
 *       position: absolute; bottom: calc(100% + 6px); left: 50%; translate: -50% 0;
 *       z-index: 5; padding: 5px 9px; border-radius: var(--radius);
 *       background: var(--bg-elevated); color: var(--text-strong);
 *       border: 1px solid var(--border); box-shadow: var(--shadow-md);
 *       font-size: var(--t-cap); line-height: 1.4; font-weight: 500;
 *       white-space: nowrap; pointer-events: none;
 *       opacity: 0; transition: opacity var(--duration-faster) var(--ease-out);
 *     }
 *
 * 产品这边是 body portal(`.od-tooltip-layer`,`styles/primitives.css`)而不是
 * `::after` 伪元素,所以**只搬值,不搬机制** —— 定位/命中/视口 clamp 那一套是
 * `TooltipLayer.tsx` 的事,稿子的 `mod-tip-s` / `mod-tip-e` 贴边补正在 portal
 * 里没有对应物(气泡不会被 overflow 裁),那两条不搬。
 *
 * ## 这份判据为什么读源文件的字节,不读 `getComputedStyle`
 *
 * jsdom 不加载样式表,`getComputedStyle` 对这些属性一律读出空串 ——
 * `expect(a).toBe(b)` 会在两边都是 `''` 时**真空通过**。本仓库既有的
 * `styles/floating-layer-ladder.test.ts` 就是读 `primitives.css` 的字节,
 * 这一份跟的是同一条路子。
 *
 * ## 一条**没有**跟稿子(见 W126 报告,待产品拍板)
 *
 * · `white-space: nowrap` + 去掉 `max-width` —— 稿子只服务「纯图标按钮的名字」
 *   那种两三个字的短文案;产品这条 primitive 上挂着长描述,最长的
 *   `fileViewer.publishSingleFileDescription` 法语 202 字符,单行会横穿屏幕。
 *   还有一批 `data-tooltip={workingDir}` / `{active.title}` 之类**长度无上限**的
 *   用户数据。所以换行策略维持产品现状,下面 `换行策略` 那一组把它钉住,
 *   免得有人照着稿子「顺手补齐」。
 *
 * ## `transition` 那一条 —— W126 缓过一轮,W129 补上了
 *
 * W126 当时没搬 `transition: opacity …`,理由是产品的气泡 show 时挂载、hide 时卸载,
 * 元素从来不在 DOM 里从 `opacity:0` 走到 `1`,写了也是死规则。
 * **产品 2026-09-03 拍板做重构**:`TooltipLayer.tsx` 改成常驻挂载 + 切 opacity,
 * 淡入淡出真的跑起来了,所以这条声明现在有意义,下面「淡入淡出」那一组把它钉住。
 * 挂载模型那一半的判据在 `tests/components/w129-tooltip-fade.test.tsx`
 * (含隐藏态读屏拿不到的证据)。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, '../../src', rel), 'utf8');

const primitives = read('styles/primitives.css');
const tooltipLayer = read('components/TooltipLayer.tsx');

/** 注释里会引用旧值(比如这次改动前的 `--radius-sm`),先剥掉再断言。 */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `.od-tooltip-layer { … }` 那一条规则的**声明块**,取不到就直接失败。 */
function tooltipRule(): string {
  const rule = /\.od-tooltip-layer\s*\{([^}]*)\}/.exec(withoutComments(primitives))?.[1];
  expect(rule, 'primitives.css 里找不到 .od-tooltip-layer 规则').toBeTruthy();
  return rule!;
}

/**
 * 从声明块里读一个属性的值。**读不到就抛** —— 「属性根本不在」和
 * 「属性值不对」必须是两种失败,不能让前者伪装成后者悄悄通过。
 */
function decl(prop: string): string {
  const body = tooltipRule();
  const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'm').exec(body);
  if (!match) throw new Error(`.od-tooltip-layer 里没有 \`${prop}\` 这条声明`);
  return match[1]!.trim();
}

describe('tooltip 气泡对稿(全站)', () => {
  it('圆角走 --radius(8px),不是 --radius-sm(4px)', () => {
    // 稿 components.css:2702 `border-radius: var(--radius)`
    expect(decl('border-radius')).toBe('var(--radius)');
  });

  it('内距 5px 9px', () => {
    // 稿 components.css:2702 `padding: 5px 9px`
    expect(decl('padding')).toBe('5px 9px');
  });

  it('行高 1.4', () => {
    // 稿 components.css:2705 `line-height: 1.4`
    expect(decl('line-height')).toBe('1.4');
  });

  it('底是实底 --bg-elevated,不是半透明磨砂', () => {
    // 稿 components.css:2703 `background: var(--bg-elevated)`
    expect(decl('background')).toBe('var(--bg-elevated)');
  });

  it('实底之后不再挂 backdrop-filter —— 底不透明,毛玻璃后面什么都透不过来', () => {
    const body = tooltipRule();
    expect(body).not.toMatch(/(^|;)\s*backdrop-filter\s*:/m);
    expect(body).not.toMatch(/(^|;)\s*-webkit-backdrop-filter\s*:/m);
  });

  it('边框走 --border,不是 --material-separator', () => {
    // 稿 components.css:2704 `border: 1px solid var(--border)`
    expect(decl('border')).toBe('1px solid var(--border)');
  });

  it('阴影是 --shadow-md 的柔影,不是 --shadow-sm 的硬边', () => {
    // 稿 components.css:2704 `box-shadow: var(--shadow-md)`
    expect(decl('box-shadow')).toBe('var(--shadow-md)');
  });

  it('字色是纯 --text-strong,不是 92% 透明的 --vibrancy-label', () => {
    // 稿 components.css:2703 `color: var(--text-strong)`
    expect(decl('color')).toBe('var(--text-strong)');
  });

  it('字号 12 / 字重 500 —— 这两条产品本来就对上了,钉住免得被顺手改掉', () => {
    // 稿 components.css:2705 `font-size: var(--t-cap)`(= --font-size-12,
    // 见稿 components.css:106)`font-weight: 500`
    expect(decl('font-size')).toBe('12px');
    expect(decl('font-weight')).toBe('500');
  });

  it('离触发元素 6px,不是 7px', () => {
    // 稿 components.css:2701 `bottom: calc(100% + 6px)`;
    // 稿 :2721 朝下那一支同样是 `top: calc(100% + 6px)`
    const match = /const TOOLTIP_GAP = (\d+);/.exec(tooltipLayer);
    expect(match, 'TooltipLayer.tsx 里找不到 TOOLTIP_GAP').toBeTruthy();
    expect(Number(match![1])).toBe(6);
  });
});

describe('淡入淡出 —— 稿 components.css:2707', () => {
  /*
   * 稿子:`opacity: 0; transition: opacity var(--duration-faster) var(--ease-out);`
   * 两个 token 在产品的 `styles/tokens.css` 里也在,且**同值**:
   *   `:123 --duration-faster: 100ms`
   *   `:134 --ease-out: var(--curve-decelerate-mid)`
   *   `:132 --curve-decelerate-mid: cubic-bezier(0, 0, 0, 1)`
   * 所以这里连写法一起照搬,不折算成字面值 —— 折算之后 token 一改这条就悄悄脱钩。
   *
   * ⚠️ 和 `AGENTS.md`「UI animation philosophy」的默认值**不同**:那条默认是
   * `cubic-bezier(0.23, 1, 0.32, 1)`、进场 ~200ms / 退场 ~140ms。这里按稿子走
   * (聊天面板的设计稿是这个面板的事实源),两条都仍然满足那节的硬约束 ——
   * `cubic-bezier(0,0,0,1)` 是减速曲线(不是被禁的 ease-in),也没有从 scale(0) 起。
   */
  it('起手 opacity: 0', () => {
    expect(decl('opacity')).toBe('0');
  });

  it('过渡走 opacity + --duration-faster + --ease-out,和稿子同字', () => {
    expect(decl('transition')).toBe('opacity var(--duration-faster) var(--ease-out)');
  });

  it('两个 token 在产品 tokens.css 里的值和稿子对得上', () => {
    const tokens = withoutComments(read('styles/tokens.css'));
    const duration = /--duration-faster:\s*([^;]+);/.exec(tokens)?.[1]?.trim();
    const easeOut = /--ease-out:\s*([^;]+);/.exec(tokens)?.[1]?.trim();
    const decelerate = /--curve-decelerate-mid:\s*([^;]+);/.exec(tokens)?.[1]?.trim();
    expect(duration, 'tokens.css 里找不到 --duration-faster').toBe('100ms');
    expect(easeOut, 'tokens.css 里找不到 --ease-out').toBe('var(--curve-decelerate-mid)');
    expect(decelerate, 'tokens.css 里找不到 --curve-decelerate-mid')
      .toBe('cubic-bezier(0, 0, 0, 1)');
  });
});

describe('换行策略 —— 有意不跟稿子,待产品拍板', () => {
  /*
   * 稿子是 `white-space: nowrap` 且不设 max-width。产品这条 primitive 上挂着
   * 长描述与无上限的用户数据(路径、文件名、设计系统名),照搬会横穿屏幕。
   * 这一组是**反向守卫**:谁把它改成稿子那一套,这里就红,顺带把「为什么没跟」
   * 摆在他面前。
   */
  it('仍然限宽换行,没有被顺手改成 nowrap', () => {
    expect(decl('white-space')).toBe('normal');
    expect(decl('max-width')).toBe('min(260px, calc(100vw - 16px))');
  });
});
