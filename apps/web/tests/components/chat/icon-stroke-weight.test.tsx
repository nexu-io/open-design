// @vitest-environment jsdom
/**
 * 聊天面板的描边图标**太细,细到看不见**(设计 2026-08-27:「除了 brain 以外,
 * 其他 icon 好像都太细了,都看不到了」)。
 *
 * ## 根因
 *
 * 稿子(PR #7170 head `1bbdce0b06` 的 `docs/design/chat-panel-next.html`,
 * md5 `28ea4c6558d6158e88976e11283e269e`,`specs/current/chat-panel-next.md` §1.1
 * 指的就是它)第 476 行有一条**全局基线**:
 *
 *     svg { stroke-width: 1.75px; stroke-linecap: round; stroke-linejoin: round; }
 *
 * 我们从来没有这一条。`primitives/icons.tsx` 的文件头却写着「`stroke-width` 交给
 * 全局 `svg` 规则」—— 交给了一条**不存在的规则**,于是所有描边图标掉回浏览器默认的
 * `stroke-width: 1`,并且是 butt 端头 + miter 拐角。
 *
 * ## 为什么「1」比「1.75」细得多,不是细 43%
 *
 * SVG 里的 `stroke-width` 单位是**用户单位**,不是设备像素 —— 它要乘上
 * viewBox → 显示尺寸的缩放比。我们的图标都是 `viewBox="0 0 24 24"`,
 * 挂在 16px 的格子里,缩放比是 16/24 ≈ 0.667。所以:
 *
 *     稿子   1.75 用户单位 × 0.667 = 1.167 CSS px   ← 看得见
 *     我们   1    用户单位 × 0.667 = 0.667 CSS px   ← 不到 1px,在非 HiDPI 上直接淡掉
 *
 * 下面三档的目标值**是真机量出来的**,不是照着 CSS 文本抄的:把稿子喂进无头 Chrome,
 * 对每个 `<svg>` 读 `getComputedStyle().strokeWidth` 再乘 `getScreenCTM().a`。
 * 三档分别落在 1.167 / 0.802 / 0.948。
 *
 * ## 行首那一格是 16px,不是 14px(OPEND-2196 缺口 B)
 *
 * 上面那个 `1bbdce0b06` 是**旧版稿子**。它当时确实写的是 14px:
 *
 *     1bbdce0b06:docs/design/chat-panel/src/components.css:1938
 *     .ti > svg { width: 14px; height: 14px; color: var(--text-soft); }
 *
 * 设计在 `8015870095`(docs(design): refine chat panel states and interactions)
 * 把这一条**同时改了尺寸和颜色**,到最新的 `853da24ea5` 仍是这个数:
 *
 *     853da24ea5:docs/design/chat-panel/src/components.css:2173
 *     .ti > svg { width: 16px; height: 16px; color: #A3A3A3; }
 *
 * 我们那边只搬了**颜色**那一半 —— `record.module.css` 里 `.icon > svg` 上方的注释
 * 写着「稿子 `.ti > svg { … color: #A3A3A3 }`,components.css:2217」,`2217` 正是
 * `8015870095` 里这条 16px 的行号。**引了这一行、却把 width 留在旧版的 14px**,
 * 于是笔画粗细跟着少了 0.146px(1.167 → 1.021)。
 *
 * 所以下面 `toolRow` 从 1.021 改成 1.167 **不是回归,是跟着尺寸走的基线更新**:
 * 基线 1.75 用户单位没动,动的是 `displayPx`(14 → 16),乘出来的数必然跟着变。
 *
 * ## 这一档**不能**用 vector-effect: non-scaling-stroke 修
 *
 * 稿子只在两处钉了 `non-scaling-stroke`(`.ck` 那枚勾、`.tool .wifi` 那三条弧),
 * 其余一律**跟着 viewBox 缩放**。真机实测稿子自己就是这样:同一条 1.75,
 * 10px 的格子里量到 0.729、16px 的格子里量到 1.167。给我们的图标加
 * `non-scaling-stroke` 会把 1.75 钉成 1.75 设备像素 —— 比稿子粗 1.7 倍。
 * 所以下面第三条**反向对照**盯的就是这个:三档的实际粗细必须**各不相同**。
 *
 * ## 行首那一格现在有**两族**图标(W72)
 *
 * 稿子 `729fa43ce7` 把「新建」换成了 `fill="currentColor"` 的实心节点字形
 * (`docs/design/chat-panel/src/body-components.html:909`:四处「新建」全换,
 * 同一行里唯一那处「改写」仍是描边铅笔)。**实心字形走不了描边那套基线** ——
 * 它压根没有 stroke,1.75 对它没有意义。
 *
 * 这里的处理不是「把它从断言里摘出去」——摘出去等于这一枚从此没人守。
 * 改成**按族各问各的**:描边族问「吃到 1.75 没有 / 端头是不是 round」,
 * 填充族问「上色的是不是 fill / 有没有混进描边几何 / 路径是不是空的」。
 * 族的**成员名单**由 `DESIGN_FILL_KINDS` 一并钉住,免得哪天某一格悄悄换了族、
 * 却因为「另一族不问这个」而全绿溜过去。
 *
 * ⚠️ 1.75 那条基线本身没动,动的只是「谁归描边族」。
 *
 * ## jsdom 的局限(说明,不拿假断言凑数)
 *
 * jsdom 不做层叠、不算 CTM,`getComputedStyle().strokeWidth` 永远是空的。
 * 所以这里断言的是**标记上的表现属性 + CSS Module 文本里的显示尺寸**,
 * 两者相乘得到的就是浏览器最终画出来的粗细(表现属性是元素上的声明,
 * 不会被继承值盖掉)。真实几何的前后对照在无头 Chrome 里另做,记在 PR 里。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { ChevronIcon, toolIcon } from '../../../src/components/chat/primitives/icons';
import { QuotedRefs } from '../../../src/components/chat/QuotedRefs';
import { Icon } from '../../../src/components/Icon';
import { I18nProvider } from '../../../src/i18n';
import type { ToolKind } from '../../../src/runtime/chat/tool-kind';

/** 稿子第 476 行的基线,单位是**用户单位**(viewBox 单位),不是设备像素。 */
const DESIGN_BASELINE = 1.75;

/**
 * 行首那一格的显示尺寸,稿子 `components.css:2173`(`853da24ea5`):
 * `.ti > svg { width: 16px; height: 16px }`。见文件头「行首那一格是 16px」。
 */
const DESIGN_TOOL_ICON_PX = 16;

/** 真机量稿子得到的实际粗细(CSS px)。来源见文件头。 */
const DESIGN_EFFECTIVE = {
  /** `.ti > svg`(执行记录行首那一格),16px */
  toolRow: 1.167,
  /** `.chev`(折叠箭头),11px */
  chevron: 0.802,
  /** `.refs` 里那枚对话气泡,13px */
  quotedRefs: 0.948,
} as const;

/**
 * 行首那一格里走**填充**的类别名单,取自稿子 `729fa43ce7`(见文件头「两族」)。
 * 名单本身就是判据:多一个、少一个、换了一个都要红。
 */
const DESIGN_FILL_KINDS: readonly ToolKind[] = ['write'];

afterEach(cleanup);

type IconFamily = 'stroke' | 'fill';

/**
 * 判一枚图标归哪一族。**两族都像、两族都不像,都算坏**:
 * `fill="none"` 又没有 stroke 的图标什么都画不出来;有 stroke 却没写
 * stroke-width 的会掉回浏览器默认的 1 用户单位(0.667px,看不见)。
 */
function iconFamily(svg: SVGSVGElement, kind: string): IconFamily {
  const fill = svg.getAttribute('fill');
  const stroke = svg.getAttribute('stroke');
  const isStroke = fill === 'none' && stroke === 'currentColor';
  const isFill = fill === 'currentColor' && stroke === null;
  expect(
    [isStroke, isFill].filter(Boolean).length,
    `${kind} 既不是干净的描边图标也不是干净的填充图标(fill=${fill} stroke=${stroke})`,
  ).toBe(1);
  return isFill ? 'fill' : 'stroke';
}

/** 从一份 CSS Module 文本里取某条规则的 `width: Npx`。取不到就炸,不给默认值。 */
function cssWidth(file: string, selector: string): number {
  const css = readFileSync(resolve(__dirname, '../../../src', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of css.split('}')) {
    const brace = block.indexOf('{');
    if (brace < 0) continue;
    const head = block.slice(0, brace).trim().replace(/\s+/g, ' ');
    if (head !== selector) continue;
    const m = /(?:^|;)\s*width:\s*([\d.]+)px/.exec(block.slice(brace + 1));
    if (m?.[1]) return Number(m[1]);
  }
  throw new Error(`${file} 里找不到 \`${selector}\` 的 width —— 尺寸变了,这条判据要跟着改`);
}

/** 一枚 svg 在屏幕上实际画出来的描边粗细:用户单位 × (显示尺寸 ÷ viewBox 边长)。 */
function effectiveStroke(svg: SVGSVGElement, displayPx: number): number {
  const viewBox = svg.getAttribute('viewBox');
  expect(viewBox, '图标没有 viewBox,缩放比无从算起').toBeTruthy();
  const side = Number(viewBox!.trim().split(/\s+/)[2]);
  const raw = svg.getAttribute('stroke-width');
  expect(raw, '图标没写 stroke-width,会掉回浏览器默认的 1 用户单位').not.toBeNull();
  return Number(raw) * (displayPx / side);
}

function renderSvg(node: ReactElement): SVGSVGElement {
  const { container } = render(<span>{node}</span>);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  return svg as unknown as SVGSVGElement;
}

const TOOL_KINDS: ToolKind[] = ['read', 'write', 'edit', 'delete', 'search', 'exec', 'image', 'other'];

describe('聊天面板描边图标的笔画粗细', () => {
  it('执行记录行首那一格:描边族落在稿子量出来的 1.167px 上,填充族按填充判据走', () => {
    const displayPx = cssWidth('components/chat/primitives/record.module.css', '.icon > svg');
    /* 先钉尺寸本身 —— 粗细是「基线 × 尺寸」的乘积,只断言乘积的话,
       尺寸错了也能被另一个因子的改动补偿回来,读起来还像是笔画的问题。 */
    expect(displayPx, '行首图标的尺寸和稿子 components.css:2173 对不上')
      .toBe(DESIGN_TOOL_ICON_PX);
    const filledKinds: ToolKind[] = [];
    for (const kind of TOOL_KINDS) {
      const svg = renderSvg(toolIcon(kind));
      if (iconFamily(svg, kind) === 'fill') {
        filledKinds.push(kind);
        /* 填充族问的是另一套判据,不是不问:上色必须靠 fill,不许混进任何描边几何,
           路径也不能是空的(`d` 为空时 <path> 会静默消失,格子看着就是空的)。 */
        expect(svg.getAttribute('fill'), `${kind} 的实心字形没上色`).toBe('currentColor');
        expect(svg.getAttribute('stroke-width'), `${kind} 是填充图标却带着 stroke-width`).toBeNull();
        const ds = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
        expect(ds.length, `${kind} 的填充图标一条路径都没有,格子会是空的`).toBeGreaterThan(0);
        expect(ds.filter((d) => d.length === 0), `${kind} 的填充图标有空的 d`).toEqual([]);
      } else {
        expect(Number(svg.getAttribute('stroke-width')), `${kind} 没吃到基线`).toBe(DESIGN_BASELINE);
        expect(effectiveStroke(svg, displayPx), `${kind} 画出来的粗细和稿子对不上`)
          .toBeCloseTo(DESIGN_EFFECTIVE.toolRow, 2);
      }
      cleanup();
    }
    /* 成员名单也是判据:少一个 = 有格子悄悄从填充退回描边;多一个 = 有格子
       悄悄改走填充,从此不再被 1.75 那条守着。两个方向都要红。 */
    expect(filledKinds, '填充族的成员名单和稿子 729fa43ce7 对不上').toEqual([...DESIGN_FILL_KINDS]);
  });

  it('折叠箭头:11px 的格子里落在 0.802px', () => {
    const svg = renderSvg(<ChevronIcon />);
    expect(Number(svg.getAttribute('stroke-width'))).toBe(DESIGN_BASELINE);
    expect(effectiveStroke(svg, Number(svg.getAttribute('width')))).toBeCloseTo(DESIGN_EFFECTIVE.chevron, 2);
  });

  it('引用芯片那枚气泡:13px 的格子里落在 0.948px', () => {
    const displayPx = cssWidth('components/chat/QuotedRefs.module.css', '.icon');
    const { container } = render(
      <I18nProvider>
        <QuotedRefs quotes={[{ id: 'q1', text: '一段引文', messageId: 'm1' }]} onClear={() => {}} />
      </I18nProvider>,
    );
    const svg = container.querySelector('[data-testid="chat-quoted-refs"] > svg');
    expect(svg, '引用芯片没渲染出气泡').not.toBeNull();
    const el = svg as unknown as SVGSVGElement;
    expect(Number(el.getAttribute('stroke-width'))).toBe(DESIGN_BASELINE);
    expect(effectiveStroke(el, displayPx)).toBeCloseTo(DESIGN_EFFECTIVE.quotedRefs, 2);
  });

  it('端头和拐角跟着稿子走 round —— 1px 以下的线,butt + miter 会让笔画更淡', () => {
    for (const kind of TOOL_KINDS) {
      const svg = renderSvg(toolIcon(kind));
      if (iconFamily(svg, kind) === 'fill') {
        /* 实心字形没有笔画,端头/拐角对它是**死属性** —— 留着会让下一个人以为
           这一枚也在描边,照着改 1.75 却看不出任何变化。 */
        expect(svg.getAttribute('stroke-linecap'), `${kind} 是填充图标却带着 stroke-linecap`).toBeNull();
        expect(svg.getAttribute('stroke-linejoin'), `${kind} 是填充图标却带着 stroke-linejoin`).toBeNull();
      } else {
        expect(svg.getAttribute('stroke-linecap'), `${kind} 的端头不是 round`).toBe('round');
        expect(svg.getAttribute('stroke-linejoin'), `${kind} 的拐角不是 round`).toBe('round');
      }
      cleanup();
    }
    const chev = renderSvg(<ChevronIcon />);
    expect(chev.getAttribute('stroke-linecap')).toBe('round');
    expect(chev.getAttribute('stroke-linejoin')).toBe('round');
  });

  /* ── 反向对照 ──────────────────────────────────────────────
     稿子里**不是只有一个数**。只断言「等于 1.75」的话,一条全局
     `svg { stroke-width: 1.75px }` 也能全绿,而那条会把仓库里十几处
     写死的 stroke-width 一起盖掉(CSS 声明恒赢表现属性)。
     下面两条就是拿来证明「没有一刀切」的。 */

  it('反向对照 · 共享 Icon 组件仍然是它自己的 1.6,没被一刀切成 1.75', () => {
    // `grid-4` 走的是 Icon 的**描边兜底分支**(remix 里没有对应字形),
    // 那一支才带 stroke-width;挑一个 remix 名字会拿到实心路径,对照就落空了
    const { container } = render(<Icon name="grid-4" size={15} />);
    const svg = container.querySelector('svg[stroke-width]');
    expect(svg, 'Icon 的描边兜底分支没渲染出来,这条对照不成立').not.toBeNull();
    expect(Number(svg!.getAttribute('stroke-width'))).toBe(1.6);
    expect(Number(svg!.getAttribute('stroke-width'))).not.toBe(DESIGN_BASELINE);
  });

  it('反向对照 · 没有人把它做成一条全局 `svg { stroke-width }`', () => {
    /*
     * 这是最省事也最危险的修法:稿子第 476 行确实是全局的,照搬一条就能让本文件
     * 前四条全绿。但 SVG 表现属性属于优先级更低的 "author presentational hints",
     * **任何** CSS 声明都赢它 —— 一条全局 `svg { stroke-width }` 会把
     * `apps/web/src` 里 115 处写死的 `strokeWidth={…}` 静默盖掉
     * (共享 Icon 的 1.6、`.msg-att-eye` 的 2、`.qf-chip-check` 的 2 全在内)。
     *
     * jsdom 不做层叠,上面几条量不到 CSS,所以这条改成盯**源文本**:
     * 全仓不许出现「选择器就是裸 `svg`、而且设了 stroke-width」的规则。
     */
    const roots = [
      resolve(__dirname, '../../../src/styles'),
      resolve(__dirname, '../../../src/components'),
    ];
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.css')) files.push(full);
      }
    };
    for (const root of roots) walk(root);
    files.push(resolve(__dirname, '../../../src/index.css'));
    expect(files.length, 'CSS 一个都没扫到,这条判据是空的').toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of files) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const block of css.split('}')) {
        const brace = block.indexOf('{');
        if (brace < 0) continue;
        const head = block.slice(0, brace);
        const body = block.slice(brace + 1);
        if (!/(?:^|;)\s*stroke-width\s*:/.test(body)) continue;
        // 顶层逗号切开,任何一支**只**是 `svg` 就算裸全局
        if (head.split(',').some((s) => s.trim().replace(/\s+/g, ' ') === 'svg')) {
          offenders.push(`${file.split('/apps/web/')[1]}: ${head.trim()}`);
        }
      }
    }
    expect(offenders, '出现了裸 `svg { stroke-width }`,它会盖掉全仓写死的描边').toEqual([]);
  });

  it('反向对照 · 三档的实际粗细各不相同 —— 描边跟着尺寸缩放,没有钉成设备像素', () => {
    const values = [DESIGN_EFFECTIVE.toolRow, DESIGN_EFFECTIVE.chevron, DESIGN_EFFECTIVE.quotedRefs];
    expect(new Set(values).size, '三档量出来一样粗,说明加了 non-scaling-stroke —— 稿子没有').toBe(3);

    const tool = renderSvg(toolIcon('read'));
    expect(tool.getAttribute('vector-effect'), '图标不该钉 non-scaling-stroke').toBeNull();
    cleanup();
    const chev = renderSvg(<ChevronIcon />);
    expect(chev.getAttribute('vector-effect')).toBeNull();

    // 同一个 1.75 在两个尺寸上必须画出两个粗细
    const toolPx = 1.75 * (cssWidth('components/chat/primitives/record.module.css', '.icon > svg') / 24);
    const chevPx = 1.75 * (Number(chev.getAttribute('width')) / 24);
    expect(toolPx).not.toBeCloseTo(chevPx, 2);
  });
});
