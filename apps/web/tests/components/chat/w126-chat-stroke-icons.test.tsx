// @vitest-environment jsdom
/**
 * 聊天面板里那几枚**描边**图标 —— 产品裁决 2026-09-03:「**只让聊天面板走
 * 描边版**」,明确不动全站。
 *
 * 所以这一轮**一个字都不碰** `components/Icon.tsx` 的默认 `strokeWidth`(1.6)
 * 和 `REMIX_ICON` 映射表 —— 那是全站的,产品否掉了。改的是往
 * `components/chat/primitives/icons.tsx` 里补稿子的字形,然后**只把聊天面板内
 * 的那几个调用点**换过去。
 *
 * ## 稿子出处(基线 `729fa43ce7`,PR #7170 `design/chat-cards-surface`)
 *
 * | 这一枚 | 稿子原件 | 族 |
 * |---|---|---|
 * | 发送箭头 | `src/body-scene.html:46` = `src/body-components.html:375` | 描边 |
 * | 加号     | `src/body-scene.html:42`                                  | 描边 |
 * | 调色盘   | `src/body-scene.html:43`                                  | 描边 + 三颗实心圆点 |
 * | 垃圾桶   | `src/body-components.html:1342`                           | 描边 |
 * | 文件     | `src/body-components.html:141`                            | 描边 |
 * | ×        | `src/body-components.html:255`                            | 描边 |
 * | 播放     | `src/body-components.html:1153`                           | **实心** |
 *
 * ⚠️ **播放是实心的,不是描边的**。稿子那一枚写的就是
 * `<svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`。
 * 「这一族叫描边图标」不是把每一枚都改成描边的理由 —— 稿子画的是实心就保持实心,
 * 只是把 remix 那枚双层播放字形换成稿子这枚干净的三角。下面
 * `播放这一枚稿子画的是实心` 那一条就是钉这件事的。
 *
 * ⚠️ 调色盘**有两枚,不是一枚**。`icons.tsx` 里既有的 `PaletteIcon` 取自
 * `src/body-components.html:47`(状态卡那一格,`fill="currentColor"` 实心);
 * 这里新补的是 `src/body-scene.html:43`(输入框的设计系统键,描边 + 三点)。
 * 两枚共存,谁也不替换谁。
 *
 * ⚠️ 垃圾桶同样**有两枚**。既有的 `DeleteIcon`(`M4 7h16` 那一套)是工具行的
 * delete 动词格,稿子里根本没有那一行(它是产品自己加的);这里补的是队列行
 * 「移除」那一枚(`M3.5 6h17` 那一套),两条 `d` 完全不同。
 *
 * ## 判据为什么读真 DOM 属性
 *
 * `d` / `viewBox` / `fill` / `stroke` / `stroke-width` 都是 React 直写到
 * DOM 上的**表现属性**,不经样式管道 —— jsdom 不加载样式表,
 * `getComputedStyle` 在这里会读出空值并让 `toBe` 真空通过,而
 * `getAttribute` 读不到就是 `null`。下面 `attr()` 取不到属性直接抛,
 * 「属性根本不在」和「属性值不对」是两种失败,不让前者伪装成后者。
 *
 * CSS Module 的类名代理对任何 key 都返回字符串,所以这一份**一条 class 断言
 * 都不用** —— 「有没有某个 class」在 vitest 里证明不了任何事。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import {
  ChatCloseIcon,
  ChatFileIcon,
  ChatPlayIcon,
  ChatPlusIcon,
  ChatSendArrowIcon,
  ComposerPaletteIcon,
  QueueTrashIcon,
} from '../../../src/components/chat/primitives/icons';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, '../../../src', rel), 'utf8');

/** 渲染一枚图标,把它的 `<svg>` 交出来。 */
function svgOf(node: ReactElement): SVGElement {
  const { container } = render(node);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('这一枚图标没有渲染出 <svg>');
  return svg;
}

/**
 * 读一个真 DOM 属性。**读不到就抛**,不返回 null ——
 * 否则 `expect(attr(a)).toBe(attr(b))` 会在两边都缺属性时真空通过。
 */
function attr(el: Element, name: string): string {
  const value = el.getAttribute(name);
  if (value === null) throw new Error(`这个元素上没有 \`${name}\` 属性`);
  return value;
}

/** 一枚图标里所有 `<path>` 的 `d`,按文档顺序。 */
function paths(svg: SVGElement): string[] {
  const list = Array.from(svg.querySelectorAll('path'));
  if (list.length === 0) throw new Error('这一枚图标里一条 <path> 都没有');
  return list.map((p) => attr(p, 'd'));
}

/** 描边族的公共判据 —— 稿 `src/components.css:159` 的全局基线。 */
function expectStrokeFamily(svg: SVGElement, label: string) {
  expect(attr(svg, 'viewBox'), label).toBe('0 0 24 24');
  expect(attr(svg, 'fill'), label).toBe('none');
  expect(attr(svg, 'stroke'), label).toBe('currentColor');
  expect(attr(svg, 'stroke-width'), label).toBe('1.75');
  expect(attr(svg, 'stroke-linecap'), label).toBe('round');
  expect(attr(svg, 'stroke-linejoin'), label).toBe('round');
}

describe('稿子的字形补进 chat 图标族', () => {
  it('发送箭头 —— 两条描边路径,不是 remix 那枚实心箭头', () => {
    // 稿 src/body-scene.html:46 / src/body-components.html:375
    const svg = svgOf(<ChatSendArrowIcon />);
    expectStrokeFamily(svg, '发送箭头');
    expect(paths(svg)).toEqual(['M12 19V5', 'M5 12l7-7 7 7']);
  });

  it('加号 —— 一条描边十字,不是 remix 那枚实心方角十字', () => {
    // 稿 src/body-scene.html:42
    const svg = svgOf(<ChatPlusIcon />);
    expectStrokeFamily(svg, '加号');
    expect(paths(svg)).toEqual(['M12 5v14M5 12h14']);
  });

  it('调色盘 —— 描边外壳 + 三颗非对称实心点', () => {
    // 稿 src/body-scene.html:43
    const svg = svgOf(<ComposerPaletteIcon />);
    expectStrokeFamily(svg, '调色盘');
    expect(paths(svg)).toEqual([
      'M12 3.2a8.8 8.8 0 100 17.6c.9 0 1.6-.73 1.6-1.6 0-.42-.16-.79-.42-1.07a1.6 1.6 0 011.18-2.68h1.84a4.6 4.6 0 004.6-4.6c0-4.26-3.94-7.65-8.8-7.65z',
    ]);
    // 三颗点是**实心**的,而且各自把外壳的 stroke 关掉 —— 稿子逐字如此。
    // 位置 7.3 / 10.6 / 15 是非对称的,和 remix 那枚对称三点(7.5/12/16.5)不是一回事。
    const circles = Array.from(svg.querySelectorAll('circle'));
    expect(circles.length, '调色盘应有三颗点').toBe(3);
    expect(circles.map((c) => [attr(c, 'cx'), attr(c, 'cy'), attr(c, 'r')])).toEqual([
      ['7.3', '11.4', '1.15'],
      ['10.6', '7.9', '1.15'],
      ['15', '8.4', '1.15'],
    ]);
    for (const c of circles) {
      expect(attr(c, 'fill')).toBe('currentColor');
      expect(attr(c, 'stroke')).toBe('none');
    }
  });

  it('队列的垃圾桶 —— 四条描边路径,和工具行那枚 DeleteIcon 不是同一条 d', () => {
    // 稿 src/body-components.html:1342
    const svg = svgOf(<QueueTrashIcon />);
    expectStrokeFamily(svg, '垃圾桶');
    expect(paths(svg)).toEqual([
      'M3.5 6h17',
      'M8.5 6V4.2A1.2 1.2 0 019.7 3h4.6a1.2 1.2 0 011.2 1.2V6',
      'M18.5 6l-.8 13.4a1.7 1.7 0 01-1.7 1.6H8a1.7 1.7 0 01-1.7-1.6L5.5 6',
      'M10 10.5v6M14 10.5v6',
    ]);
  });

  it('文件 —— 描边折角文件,不是 remix 那枚实心文件', () => {
    // 稿 src/body-components.html:141
    const svg = svgOf(<ChatFileIcon />);
    expectStrokeFamily(svg, '文件');
    expect(paths(svg)).toEqual([
      'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
      'M14 2v6h6',
    ]);
  });

  it('× —— 一条描边叉,不是 remix 那枚实心叉', () => {
    // 稿 src/body-components.html:255
    const svg = svgOf(<ChatCloseIcon />);
    expectStrokeFamily(svg, '×');
    expect(paths(svg)).toEqual(['M18 6L6 18M6 6l12 12']);
  });

  it('播放这一枚稿子画的是**实心**,所以它不进描边族', () => {
    // 稿 src/body-components.html:1153 `<svg class="ic-play" … fill="currentColor">`
    const svg = svgOf(<ChatPlayIcon />);
    expect(attr(svg, 'viewBox')).toBe('0 0 24 24');
    expect(attr(svg, 'fill')).toBe('currentColor');
    // 实心族**一个 stroke-* 都不带** —— 带着却不描边是死属性(见 icons.tsx 的 FILL_ICON)。
    expect(svg.getAttribute('stroke')).toBeNull();
    expect(svg.getAttribute('stroke-width')).toBeNull();
    expect(paths(svg)).toEqual(['M8 5v14l11-7z']);
  });
});

describe('取属性的函数自己得能报缺失 —— 真空探针', () => {
  /*
   * 上面每一条都靠 `attr()` 取值。如果它在属性缺失时返回 `null` 而不是抛,
   * 那么「产品把 stroke-width 删了」会表现成 `null === null` 的假绿。
   * 这一条把 `attr()` 按在缺属性的元素上,确认它真的炸。
   */
  it('属性不在就抛,不返回 null', () => {
    const bare = document.createElement('div');
    expect(() => attr(bare, 'stroke-width')).toThrow(/没有 `stroke-width` 属性/);
  });

  it('一条 path 都没有也抛', () => {
    const empty = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(() => paths(empty)).toThrow(/一条 <path> 都没有/);
  });
});

describe('聊天面板内的调用点换过去了 —— 面板外一个都不动', () => {
  /*
   * 产品裁决把范围锁死在聊天面板内。下面每一条都点名**那一个**调用点,
   * 并且反向确认面板外的同名调用点还在走共享的 `<Icon name="…">`。
   */
  const chatComposer = src('components/ChatComposer.tsx');
  const chatPane = src('components/ChatPane.tsx');
  const plusMenu = src('components/ComposerPlusMenu.tsx');
  const dsPicker = src('components/DesignSystemPicker.tsx');
  const audio = src('components/chat/AudioArtifact.tsx');

  it('发送键用 main 那枚实心箭头(2026-09-05 裁决)', () => {
    /*
     * ⚠️ 这一条**翻过面**。原来钉的是「还是 ChatSendArrowIcon,不是共享 Icon 的
     * 实心箭头」,依据是交付稿 `729fa43ce7` 的「盒子 28 / 图标 16」。
     *
     * 产品 2026-09-05 在合并 main 时拍板取 main 的 #7635 / OPEND-2553:那份设计
     * 09-04 07:23 已经上线,而且它的 commit 正文明确写着覆盖「the project
     * composer」,不是只改首页。两份设计撞在同一颗控件上,取已上线的那份 ——
     * 在一次合并里悄悄撤销别人已上线的工作,不该由做合并的人代劳。
     *
     * 所以稿子那一格的 28/16 作废。字形判据仍然留着,只是钉的对象换了。
     */
    expect(chatComposer).toContain('<Icon name="arrow-up-fill" size={32} />');
    // 面板里除了发送键没有第二个 arrow-up 该换:
    // ChatPane 的「回到最新」浮钮和队列第三颗都是稿子里没有 / 另一枚字形的东西。
    expect(chatComposer).not.toMatch(/<Icon name="arrow-up" size=\{18\}/);
  });

  it('加号键用 ChatPlusIcon,且只有聊天面板那一侧走它', () => {
    expect(plusMenu).toContain('<ChatPlusIcon size={16} className="od-icon" />');
    /*
     * 聊天面板那一侧仍然点名要描边加号(上面那条);而 else 分支——首页——在
     * 2026-09-05 合并 main 之后换成了**回形针**:main 的 `2e4c1a753b` 把首页那颗
     * 触发器从「+」改成了 `attach`,并给它加了可选的 `triggerLabel`。本分支
     * 2026-09-03「首页保持共享 Icon 的实心加号」那条裁决,在首页这一格上被它取代。
     * 两条分支都还在,只是 else 那半的字形变了。
     */
    expect(plusMenu).toContain('<Icon name="attach" size={16} className="od-icon" />');
    expect(src('components/ChatComposer.tsx')).toContain('strokeGlyph');
    expect(src('components/HomeHero.tsx')).not.toContain('strokeGlyph');
    /* 菜单**条目**上的加号稿子里没有对应物,保持共享 Icon 不动。
       合并 main 之后它从单行字面量变成了多行 + 加载态
       (`name={attachLoading ? 'spinner' : 'plus'}`),所以不再按整段字面量匹配 ——
       那样只是在钉排版。这里钉真正要守的两件事:条目图标仍是共享 Icon 的 plus、
       仍是 15、仍挂 `plus-menu__item-icon`。 */
    expect(plusMenu).toMatch(/name=\{attachLoading \? 'spinner' : 'plus'\}/);
    expect(plusMenu).toMatch(/size=\{15\}\s+className="plus-menu__item-icon"/);
  });

  it('设计系统键用 ComposerPaletteIcon,home / 侧栏那几处不动', () => {
    expect(dsPicker).toContain('<ComposerPaletteIcon size={16} />');
    // home 变体那一枚(size 13)和 triggerSwatches 仍走共享 Icon。合并 main 之后
    // 首页那一枚不再带 `home-hero__ds-row-trigger-icon` 这个类(main 的首页改版
    // 重排了那一行),字形和尺寸没变 —— 这里只钉「仍走共享 Icon 的 palette 13」。
    expect(dsPicker).toContain('<Icon name="palette" size={13} />');
    // 侧栏(EntryNavRail)压根不在这个文件里,自然不受影响。
    expect(src('components/EntryNavRail.tsx')).toContain('<Icon name="palette" size={16} />');
  });

  it('队列「移除」用 QueueTrashIcon', () => {
    expect(chatPane).toContain('<QueueTrashIcon size={13} />');
    expect(chatPane).not.toMatch(/<Icon name="trash"/);
  });

  it('附件文档卡用 ChatFileIcon —— 已发送的和输入框托盘里的两处都换', () => {
    expect(chatPane).toContain('<ChatFileIcon size={15} className="msg-att-fi" />');
    expect(chatComposer).toContain('<ChatFileIcon size={15} className="msg-att-fi" />');
  });

  it('附件托盘的移除 × 用 ChatCloseIcon,面板里其它 × 不动', () => {
    expect(chatComposer).toContain('<ChatCloseIcon size={10} />');
    // 暂存 chip 那几颗(size 11)稿子里没有对应物,保持共享 Icon。
    expect(chatComposer).toContain('<Icon name="close" size={11} />');
  });

  it('音频播放键用 ChatPlayIcon,设置页 / 任务页那几处不动', () => {
    expect(audio).toContain('<ChatPlayIcon size={12} />');
    expect(audio).not.toMatch(/<Icon name="play"/);
    expect(src('components/TasksView.tsx')).toContain('<Icon name="play" size={14} />');
    expect(src('components/SettingsDialog.tsx')).toContain('<Icon name="play" size={14} />');
  });
});
