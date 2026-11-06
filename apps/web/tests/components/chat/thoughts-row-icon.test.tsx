// @vitest-environment jsdom
/**
 * **想完了那一格的行首图标,画的是线性大脑(remix `brain-line`)。**
 *
 * 产品 2026-09-02 交付 `brain-line.svg` 要求换图,附言说当前那枚是**实心**的
 * `brain-fill`、这次是换成线性版。**那句前提是错的**:量过了 —— 交付件里那条
 * `d` 和仓库 `REMIX_ICON_PATHS['brain-line']` 里的**逐字节相同**(各 1562 字符),
 * 而 `Icon name="brain"` 走的映射就是 `brain → brain-line`。也就是说线上这一枚
 * **本来就是**产品要的那一枚,那一轮换图到代码这里是零改动。
 *
 * 所以这个文件不是「换图的红测」,是**把这枚字形钉住**:再有人凭「它是 fill 版」
 * 这个印象去动它,这里当场红。下面的常量就是交付件里那条 `d` 原文。
 *
 * ## 为什么盯 `path` 的 `d`,不盯 `name` 属性
 *
 * `Icon` 把字形渲染成内联 `<path d="…">`(#5517 起,打包版 `od://` 加载不了
 * url() 字体),DOM 上根本没有「图标名」这个东西。断言 `name="brain"` 只能证明
 * 参数传对了,证不出用户眼睛看见的是哪一枚 —— 名字到字形中间还隔着两张表
 * (`REMIX_ICON` 的名字映射、`REMIX_ICON_PATHS` 的路径数据),任何一张改了
 * `Icon` 都不报错:它掉进描边兜底那个 `switch`,`brain` 在那里没有 case,
 * `default` 返回 `null`,行首**直接空一格**,静默无声。
 *
 * ## 两态只有一态是图标
 *
 *   live  正在想:一颗自转的球(`<Orb state="composing">`)+ 扫光的「思考中」。
 *         这是**动效**,不是图标 —— 换成静态路径等于把动画删了,所以换图不碰它。
 *   done  想完了:静态图标 +「思考过程」。图标只有这一档有。
 *
 * ## 为什么还要盯 `fill`
 *
 * 思考行的墨色刚被改成静音灰(`--chat-progress-detail-ink: #a3a3a3`,
 * `record.module.css` 的 `.icon > svg`)。图标必须 `fill="currentColor"`
 * 才跟得住那条 `color`;写死颜色的话整行退灰、图标还留在原色。
 * jsdom 不做层叠,只有盯**元素上的表现属性**才量得到这一位。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { REMIX_ICON_PATHS } from '../../../src/components/remix-icon-paths';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

/**
 * 产品 2026-09-02 交付的 `brain-line.svg` 里那条 `d`,**原文照抄**。
 *
 * 抄全的、不抄片段:片段能证明「有这几笔」,证不了「没有多出别的笔」——
 * 而 fill 版和 line 版最像的地方恰恰就是外轮廓那几笔。整条相等才排得掉。
 */
const DELIVERED_BRAIN_LINE =
  'M9 4C10.1046 4 11 4.89543 11 6V12.8271C10.1058 12.1373 8.96602 11.7305 7.6644 11.5136L7.3356 13.4864C8.71622 13.7165 9.59743 14.1528 10.1402 14.7408C10.67 15.3147 11 16.167 11 17.5C11 18.8807 9.88071 20 8.5 20C7.11929 20 6 18.8807 6 17.5V17.1493C6.43007 17.2926 6.87634 17.4099 7.3356 17.4864L7.6644 15.5136C6.92149 15.3898 6.1752 15.1144 5.42909 14.7599C4.58157 14.3573 4 13.499 4 12.5C4 11.6653 4.20761 11.0085 4.55874 10.5257C4.90441 10.0504 5.4419 9.6703 6.24254 9.47014L7 9.28078V6C7 4.89543 7.89543 4 9 4ZM12 3.35418C11.2671 2.52376 10.1947 2 9 2C6.79086 2 5 3.79086 5 6V7.77422C4.14895 8.11644 3.45143 8.64785 2.94126 9.34933C2.29239 10.2415 2 11.3347 2 12.5C2 14.0652 2.79565 15.4367 4 16.2422V17.5C4 19.9853 6.01472 22 8.5 22C9.91363 22 11.175 21.3482 12 20.3287C12.825 21.3482 14.0864 22 15.5 22C17.9853 22 20 19.9853 20 17.5V16.2422C21.2044 15.4367 22 14.0652 22 12.5C22 11.3347 21.7076 10.2415 21.0587 9.34933C20.5486 8.64785 19.8511 8.11644 19 7.77422V6C19 3.79086 17.2091 2 15 2C13.8053 2 12.7329 2.52376 12 3.35418ZM18 17.1493V17.5C18 18.8807 16.8807 20 15.5 20C14.1193 20 13 18.8807 13 17.5C13 16.167 13.33 15.3147 13.8598 14.7408C14.4026 14.1528 15.2838 13.7165 16.6644 13.4864L16.3356 11.5136C15.034 11.7305 13.8942 12.1373 13 12.8271V6C13 4.89543 13.8954 4 15 4C16.1046 4 17 4.89543 17 6V9.28078L17.7575 9.47014C18.5581 9.6703 19.0956 10.0504 19.4413 10.5257C19.7924 11.0085 20 11.6653 20 12.5C20 13.499 19.4184 14.3573 18.5709 14.7599C17.8248 15.1144 17.0785 15.3898 16.3356 15.5136L16.6644 17.4864C17.1237 17.4099 17.5699 17.2926 18 17.1493Z';

const thought = (text: string): ShellItem => ({
  kind: 'text', text, thinking: true, elapsedMs: 154_000,
} as unknown as ShellItem);

function show(over: Partial<Shell>): HTMLElement {
  const shell = {
    kind: 'shell', id: 'shell-1', status: 'done', items: [], segments: [],
    thinking: false, stopped: false, elapsedMs: 371_631, quietMs: null,
    ...over,
  } as unknown as Shell;
  return render(
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={shell} deferCollapsedBodies={false} />
    </I18nProvider>,
  ).container;
}

/** 想完了那一格 summary 里、行首图标槽中的那枚 svg。 */
function doneRowIcon(root: HTMLElement): SVGSVGElement {
  const summary = root.querySelector('details[class*="thoughts"] > summary');
  expect(summary, '想完了的思考行没渲染出来,后面的判据都是空的').not.toBeNull();
  expect(summary!.textContent, '这一档应该写着「思考过程」').toContain('思考过程');
  const svg = summary!.querySelector('span[class*="icon"] svg');
  expect(svg, '思考行行首没有图标 —— 名字映射断了,Icon 会静默画成空').not.toBeNull();
  return svg as unknown as SVGSVGElement;
}

function renderedPath(svg: SVGSVGElement): string {
  return Array.from(svg.querySelectorAll('path'))
    .map((p) => p.getAttribute('d') ?? '')
    .join(' ');
}

describe('思考那一格的行首图标(产品 2026-09-02 交付的 brain-line)', () => {
  it('想完了:行首画的就是交付件那条 d,一字不差', () => {
    const svg = doneRowIcon(show({ items: [thought('先想清楚要动哪几个文件。')] }));
    expect(renderedPath(svg)).toBe(DELIVERED_BRAIN_LINE);
  });

  it('想完了:图标跟着整行的文字色走 —— fill 是 currentColor,没写死颜色', () => {
    const svg = doneRowIcon(show({ items: [thought('先想清楚要动哪几个文件。')] }));
    expect(svg.getAttribute('fill'), '图标没跟着 color 走,整行退静音灰时它会留在原色')
      .toBe('currentColor');
    // 兜底:路径自己也不许另立一个 fill 把上面那条盖掉
    for (const p of Array.from(svg.querySelectorAll('path'))) {
      const own = p.getAttribute('fill');
      expect(own === null || own === 'currentColor', 'path 上写死了自己的 fill').toBe(true);
    }
  });

  /**
   * **和工具行的图标同尺寸**(用户裁决 2026-09-02:「brain 这个图标,应该要跟其他
   * toolrow 的大小保持一致」)。
   *
   * ⚠️ 这条以前钉的是 `width` **属性**等于 14 —— 那是假绿。`Icon` 默认
   * `size = 14`,渲染成 `width="14"` 属性;而 `.icon > svg` 的 CSS **恒赢**
   * 表现属性,所以用户看到的一直是样式表里那个数。属性和眼睛看到的不是一回事,
   * 断言属性等于自欺。稿子把这一格从 14 改到 16 时(`8015870095`),这条测试
   * 照样绿,还在标题里声称"尺寸不动"。
   *
   * 现在钉两件真事:
   *  ① 思考行和工具行**共用同一格行首槽**,所以尺寸结构上不可能分叉 ——
   *     哪怕将来这个数再变,两边也一起变;
   *  ② 那一格的实际尺寸是稿子的 16px。
   */
  it('和工具行图标同尺寸 —— 共用同一格行首槽,值取稿子的 16px', () => {
    const svg = doneRowIcon(show({ items: [thought('先想清楚要动哪几个文件。')] }));
    const slot = svg.parentElement;
    expect(slot?.className, '思考行的图标不在共用的行首槽里 —— 它会和工具行分叉')
      .toMatch(/icon/);

    const css = readFileSync(
      resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
      'utf-8',
    );
    // 给这一格**定尺寸**的规则只能有一条。另外几条 `.icon > svg` 只管颜色
    // (失败行转红那两条),不参与尺寸 —— 所以是按「声明了 width」筛,不是按
    // 选择器数。多出第二条声明宽度的,就是尺寸分叉的入口。
    const sized = [...css.matchAll(/\.icon\s*>\s*svg\s*\{([^}]*)\}/g)]
      .map((match) => /width:\s*(\d+)px/.exec(match[1]!)?.[1])
      .filter((width): width is string => width !== undefined);
    expect(sized.length, '给 `.icon > svg` 定宽度的规则不止一条,后面那条会改写前面的')
      .toBe(1);
    expect(Number(sized[0]), '和稿子 components.css 的 `.ti > svg` 对不上').toBe(16);
  });

  it('**正在想那一档没有图标** —— 行首仍是会自转的球,没被换成静态路径', () => {
    const root = show({
      status: 'running',
      thinking: true,
      items: [thought('先想清楚要动哪几个文件。')],
    });
    const summary = root.querySelector('details[class*="thoughts"] > summary');
    expect(summary?.textContent, '这一档应该写着「思考中」').toContain('思考中');
    const slot = summary!.querySelector('span[class*="icon"]');
    expect(slot, '进行中那一格没有行首槽').not.toBeNull();
    expect(slot!.querySelector('[class*="orb"]'), '球没了 —— 动效被换成静态图标了')
      .not.toBeNull();
    expect(renderedPath(slot as unknown as SVGSVGElement), '进行中那一格被塞进了静态大脑')
      .not.toContain(DELIVERED_BRAIN_LINE);
  });

  it('字形只存一份 —— 走仓库既有的 `brain-line`,没有另抄一条 path 进来', () => {
    expect(REMIX_ICON_PATHS['brain-line'], '仓库里的 brain-line 和交付件对不上')
      .toBe(DELIVERED_BRAIN_LINE);

    /*
     * 「换个图标」最容易留下的尾巴:新名字 + 同一条 path 再塞一份。
     * 两份一模一样的数据,以后改一处就分叉,而且渲染出来看不出区别。
     */
    const table = readFileSync(
      resolve(__dirname, '../../../src/components/remix-icon-paths.ts'),
      'utf8',
    );
    const copies = table.split(DELIVERED_BRAIN_LINE).length - 1;
    expect(copies, 'remix-icon-paths.ts 里这条 path 存了不止一份').toBe(1);
  });
});
