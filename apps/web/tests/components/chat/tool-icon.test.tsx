// @vitest-environment jsdom
/**
 * 行首那一格**永远是图标,不许出现圆点**(用户 2026-08-25 裁决,推翻交付稿的兜底)。
 *
 * 交付稿的兜底是 `.ti:empty::before` 画一颗 5px 的点(33 个行首格里 22 个是点)。
 * 产品要求每一格都能指到一个图标 —— 于是两件事一起做:
 *   ① 认得出来的工具归到对的那一类(PowerShell 是执行,不是「未知」);
 *   ② 认不出来的给一个**中性兜底图标**,而不是硬塞进某一类谎报它干了什么。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ChevronIcon, toolIcon } from '../../../src/components/chat/primitives/icons';
import { toolKind } from '../../../src/runtime/chat/tool-kind';
import type { ToolKind } from '../../../src/runtime/chat/tool-kind';

const ALL: ToolKind[] = ['read', 'write', 'edit', 'delete', 'search', 'exec', 'image', 'other'];

afterEach(cleanup);

describe('行首图标', () => {
  it('每一类都有图标 —— 包括「认不出来」那一类', () => {
    for (const kind of ALL) {
      const icon = toolIcon(kind);
      expect(icon, `${kind} 没有图标,会退化成圆点`).not.toBeNull();
      const { container } = render(<span>{icon}</span>);
      expect(container.querySelector('svg'), `${kind} 的图标不是 svg`).not.toBeNull();
    }
  });

  it('删除使用垃圾桶语义图标,不再复用铅笔', () => {
    const { container: deleteContainer } = render(<span>{toolIcon('delete')}</span>);
    // 铅笔现在只归「改写」—— 稿子 729fa43ce7 把「新建」换成了实心节点字形(W72)
    const { container: editContainer } = render(<span>{toolIcon('edit')}</span>);
    expect(deleteContainer.innerHTML).not.toBe(editContainer.innerHTML);
    expect(deleteContainer.querySelectorAll('path')).toHaveLength(4);
  });

  it('新建和改写是两枚不同的图标 —— 不再共用一支铅笔(W72)', () => {
    const { container: create } = render(<span>{toolIcon('write')}</span>);
    const { container: edit } = render(<span>{toolIcon('edit')}</span>);
    expect(create.innerHTML, '新建和改写还共用同一枚图标').not.toBe(edit.innerHTML);
  });

  it('PowerShell 认成「跑命令的工具」,再按命令内容分类(D7)', () => {
    // 名单里漏了 PowerShell 时,这两条都会掉进 other、行首只剩一颗点
    expect(toolKind('PowerShell', { command: 'npm run build' })).toBe('exec');
    // 嗅的是命令不是工具名:同一个 PowerShell 跑 `ls` 就该是「搜索」
    expect(toolKind('pwsh', { command: 'ls' })).toBe('search');
    expect(toolKind('PowerShell', { command: 'cat 规格.md' })).toBe('read');
  });

  it('会去查东西的工具归到搜索(元工具除外 —— 那是 T4,产品没拍)', () => {
    expect(toolKind('WebSearch', { query: 'x' })).toBe('search');
    expect(toolKind('ToolSearch', { query: 'select:TaskCreate' })).toBe('other');
  });

  it('会去取内容的工具归到读取', () => {
    expect(toolKind('WebFetch', { url: 'https://example.com' })).toBe('read');
  });

  it('真认不出来的仍然是 other —— 不硬凑类别,只给兜底图标', () => {
    expect(toolKind('Agent', { description: 'Read skill assets' })).toBe('other');
    expect(toolIcon(toolKind('Agent', {}))).not.toBeNull();
  });
});

/* ══ 字形逐字节对稿(W76) ════════════════════════════════════════════════
 *
 * 上面几条只问「有没有图标 / 两格是不是同一枚」,**没有一条问过画的是什么**。
 * 「新建」和「改写」那两枚由 `w72-create-icon-glyph.test.tsx` 逐字节钉着,
 * 剩下四枚 + 折叠箭头一直没人守 —— 这一节补上。
 *
 * 判据是稿子 `729fa43ce7:docs/design/chat-panel/src/body-components.html:909`
 * (`data-od-id="progress-running"`,用户截图那一屏)里 `.ti` / `.chev` 的
 * **字面 svg 内容**,逐字节抄成下表。稿子在本分支上读不到(worktree 里只剩
 * `docs/design/chat-mirror`),所以照仓库既有做法把原文抄成常量、出处写在这里 ——
 * 同 `w72-create-icon-glyph.test.tsx` / `image-fail-cell-two-states.test.tsx`。
 *
 * 只比**几何**,不比 `fill` / `stroke` / `stroke-width` 那几轴:那些归
 * `icon-stroke-weight.test.tsx`(它按描边族 / 填充族分别提问,并钉住族的成员名单),
 * 两边各守各的,免得同一件事两处半对半错。
 *
 * ⚠️ **稿子里没有的两枚**:`delete`(垃圾桶)和 `other`(兜底螺帽)是产品补的
 * (删除不能复用铅笔;圆点兜底被产品裁掉后「认不出来」也得有图标)。
 * 它们**故意不在表里**,并由下面最后一条明写出来 —— 免得下一个人以为它们也有对照原值。
 */

/** 稿子那四枚的字面内容(逐字节)。顺序就是稿子里子元素出现的顺序。 */
const DESIGN_GLYPHS: Record<string, string[]> = {
  // <path d="…"/><circle cx="12" cy="12" r="2.6"/>
  read: [
    'path d=M2 12s3.6-6.4 10-6.4S22 12 22 12s-3.6 6.4-10 6.4S2 12 2 12z',
    'circle cx=12 cy=12 r=2.6',
  ],
  // <circle cx="10.8" cy="10.8" r="6.8"/><path d="…"/>
  search: [
    'circle cx=10.8 cy=10.8 r=6.8',
    'path d=M20.5 20.5l-4.9-4.9',
  ],
  // <path d="…"/><path d="…"/>
  exec: [
    'path d=M4.5 6.5l5 5.5-5 5.5',
    'path d=M12.5 18h7',
  ],
  // <rect …/><circle …/><path d="…"/>
  image: [
    'rect x=3 y=4.5 width=18 height=15 rx=2',
    'circle cx=8.6 cy=10 r=1.4',
    'path d=M21 15.5L16 10.5 7.5 19',
  ],
};

/** 稿子折叠箭头的字面内容:`<svg … width="11" height="11"><path d="M6 9l6 6 6-6"/></svg>`。 */
const DESIGN_CHEVRON = ['path d=M6 9l6 6 6-6'];
const DESIGN_CHEVRON_PX = '11';

/** 一枚 svg 里每个子元素的**几何指纹**:标签 + 它自己那几个几何属性。 */
const GEOMETRY: Record<string, readonly string[]> = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  rect: ['x', 'y', 'width', 'height', 'rx'],
};

function fingerprint(svg: SVGSVGElement): string[] {
  return [...svg.children].map((child) => {
    const tag = child.tagName.toLowerCase();
    const keys = GEOMETRY[tag];
    if (!keys) throw new Error(`没见过的字形元素 <${tag}> —— 指纹表要跟着补,否则它悄悄不被比对`);
    const parts = keys
      .map((k) => (child.getAttribute(k) == null ? null : `${k}=${child.getAttribute(k)}`))
      .filter((p): p is string => p !== null);
    return [tag, ...parts].join(' ');
  });
}

function svgOf(node: ReturnType<typeof toolIcon>): SVGSVGElement {
  const { container } = render(<span>{node}</span>);
  const svg = container.querySelector('svg');
  expect(svg, '这一枚根本没渲染出 svg').not.toBeNull();
  return svg as unknown as SVGSVGElement;
}

describe('行首图标的字形逐字节对稿(W76)', () => {
  /* ── 防真空 ──────────────────────────────────────────────────
     指纹取空数组时,`toEqual([])` 会静静地空过。先证明这套取法在一枚
     **本节没有断言过**的图标上读得出非空的几何 —— 拿「改写」那支铅笔立标尺,
     它的 `d` 由 W72 单独守着,这里只用来证明量法不是空转。 */
  it('防真空 · 指纹取法读得出几何 —— 改写那支铅笔不是空的', () => {
    const print = fingerprint(svgOf(toolIcon('edit')));
    expect(print, '取到的是空数组,下面每一条 toEqual 都会空过').not.toEqual([]);
    expect(print).toEqual(['path d=M17 3a2.83 2.83 0 014 4L7.5 20.5 2 22l1.5-5.5L17 3z']);
  });

  for (const [kind, expected] of Object.entries(DESIGN_GLYPHS)) {
    it(`${kind}:字形和稿子 729fa43ce7 逐字节相同`, () => {
      expect(fingerprint(svgOf(toolIcon(kind as ToolKind)))).toEqual(expected);
    });
  }

  it('折叠箭头:字形和 11px 的自带尺寸都照稿子', () => {
    const svg = svgOf(<ChevronIcon />);
    expect(fingerprint(svg)).toEqual(DESIGN_CHEVRON);
    // 这一枚是全族里唯一自己给尺寸的(稿子把 width/height 写在标记上,不写 CSS)
    expect(svg.getAttribute('width')).toBe(DESIGN_CHEVRON_PX);
    expect(svg.getAttribute('height')).toBe(DESIGN_CHEVRON_PX);
  });

  it('反向对照 · 表里这四枚互不相同 —— 不是四格读回同一个指纹', () => {
    const prints = Object.keys(DESIGN_GLYPHS).map((kind) => {
      const one = fingerprint(svgOf(toolIcon(kind as ToolKind))).join('|');
      cleanup();
      return one;
    });
    expect(new Set(prints).size, '四枚图标量出来一样,说明指纹取法在空转').toBe(prints.length);
  });

  it('反向对照 · 稿子里没有的那两枚**不在表里**,别当成也对过稿', () => {
    // delete(垃圾桶)/ other(兜底螺帽)是产品补的,稿子没有对照原值。
    // 这条把「表覆盖了谁」本身钉住:哪天有人顺手把它们塞进表、拿我们自己的
    // 现状当稿子,这里会红。
    expect(Object.keys(DESIGN_GLYPHS).sort()).toEqual(['exec', 'image', 'read', 'search']);
    for (const kind of ['delete', 'other'] as ToolKind[]) {
      const print = fingerprint(svgOf(toolIcon(kind)));
      cleanup();
      expect(print.length, `${kind} 画了个空的`).toBeGreaterThan(0);
    }
  });
});
