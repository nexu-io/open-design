// @vitest-environment jsdom
/**
 * 引用芯片(设计稿组件 23 · 第 67 / 68 / 69 格)对稿子的三条判据。
 *
 * 稿子原文取自 PR #7170 head `1bbdce0b06` 的 `docs/design/chat-panel-next.html`
 * (md5 `28ea4c6558d6158e88976e11283e269e`,`specs/current/chat-panel-next.md` §1.1 指的就是它)。
 * 那份文件不在本分支上,所以稿子那一侧的数值**写在这里当契约**,来源逐条注明。
 *
 * 真机量出来的差异(无头 Chrome / CDP,逐属性对 `getComputedStyle`):
 *   芯片盒子 28px 高 · 8px 圆角 · 4/9 内距 · 9/9/0 外距 · 1px #dbdbdb 描边 —— **全中**
 *   浮层 9/11 内距 · 300px 上限 · blur(28px) · rgba(32,32,32,.88) —— **全中**
 *   ❌ 字形:稿子是**描边的对话气泡**,我们画的是**实心引号**(用户当场问「怎么是这样的??」)
 *   ❌ 「×」:稿子有白底 + 1px 描边 + muted 字色(来自稿子共用的 `.del` 基类),
 *      我们的是**没底没边的深色裸叉**。两边的 `.refs .del` 声明看着一样,
 *      差别整个来自那条**没被搬过来的基类** —— 只 diff module 文本永远照不出来。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { QuotedRefs } from '../../../src/components/chat/QuotedRefs';
import { I18nProvider } from '../../../src/i18n';
import type { ChatQuote } from '../../../src/runtime/chat/quote-selection';

/** 稿子 `.refs .ic` 里那条 path —— 描边的对话气泡,不是引号。 */
const DESIGN_GLYPH_PATH =
  'M20 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2z';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/QuotedRefs.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 只切顶层逗号 —— `:is(.a, .b)` 里的逗号是参数分隔,一刀切会造出假选择器。 */
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

/** 取某个选择器(按顶层逗号拆开后精确命中)的声明块。 */
function ruleFor(selector: string): string {
  const blocks = CSS.split('}');
  for (const block of blocks) {
    const at = block.indexOf('{');
    if (at < 0) continue;
    const heads = splitTopLevel(block.slice(0, at)).map((one) => one.trim());
    if (heads.includes(selector)) return block.slice(at + 1);
  }
  return '';
}

function quotes(count: number): ChatQuote[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${i}`,
    messageId: 'm1',
    text: `第 ${i + 1} 段被选中的原文`,
  }));
}

function renderChip(count: number) {
  return render(
    <I18nProvider initial="zh-CN">
      <QuotedRefs quotes={quotes(count)} onClear={() => undefined} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('引用芯片 · 一条和五条一样高(第 69 格的意义)', () => {
  it('条数只改芯片里的那个数字,芯片自己的流内结构一个字不动', () => {
    renderChip(1);
    const one = screen.getByTestId('chat-quoted-refs');
    const oneShape = [...one.children].map((el) => el.tagName.toLowerCase());
    cleanup();

    renderChip(5);
    const five = screen.getByTestId('chat-quoted-refs');
    expect([...five.children].map((el) => el.tagName.toLowerCase())).toEqual(oneShape);
  });

  it('全文那张列表住在浮层里,浮层脱离文档流 —— 所以条数撑不高芯片', () => {
    renderChip(5);
    const chip = screen.getByTestId('chat-quoted-refs');
    const list = chip.querySelector('ol');
    expect(list).toBeTruthy();
    const pop = list?.parentElement;
    // 列表的宿主就是浮层,而浮层是 absolute —— 这两条合起来才是「不撑高」的机制。
    expect(pop?.className).toContain('pop');
    expect(ruleFor('.pop')).toContain('position: absolute');
    expect(list?.children).toHaveLength(5);
  });
});

describe('Notes 浮层 · 按 ChatPanel 可用高度收口', () => {
  it('portal 后仍使用面板顶边，窄高窗口会同步缩短浮层', () => {
    render(
      <div data-chat-panel-top="52">
        <I18nProvider initial="zh-CN">
          <QuotedRefs quotes={quotes(6)} onClear={() => undefined} />
        </I18nProvider>
      </div>,
    );
    const chip = screen.getByTestId('chat-quoted-refs');
    let anchorTop = 260;
    Object.defineProperty(chip, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: anchorTop } as DOMRect),
    });

    fireEvent.mouseEnter(chip);
    const popover = screen.getByTestId('chat-quoted-refs-popover');
    expect(popover.style.maxHeight).toBe('189px');
    expect(popover.getAttribute('role')).toBe('tooltip');
    expect(popover.querySelector('ol')?.children).toHaveLength(6);

    anchorTop = 160;
    fireEvent(window, new Event('resize'));
    expect(popover.style.maxHeight).toBe('89px');
  });

  it('只在浮层可见时接管指针，列表才能实际滚动且不会留下隐形遮挡', () => {
    expect(ruleFor('.pop')).toMatch(/pointer-events:\s*none/);
    expect(ruleFor('.refs:hover .pop')).toMatch(/pointer-events:\s*auto/);
    expect(ruleFor('.pop ol')).toMatch(/overflow-y:\s*auto/);
    expect(ruleFor('.pop ol')).toMatch(/overscroll-behavior:\s*contain/);
  });
});

describe('引用芯片 · 字形照稿子', () => {
  it('是描边的对话气泡,不是实心引号', () => {
    renderChip(1);
    const svg = screen.getByTestId('chat-quoted-refs').querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(DESIGN_GLYPH_PATH);
  });
});

describe('引用芯片 · 「×」照稿子共用的 .del 基类', () => {
  it('有底、有描边、字色是 muted(不是没底没边的裸叉)', () => {
    const remove = ruleFor('.remove');
    expect(remove).toMatch(/background:\s*var\(--chat-bg\)/);
    expect(remove).toMatch(/border:\s*var\(--chat-stroke\)\s+solid\s+var\(--chat-border\)/);
    expect(remove).toMatch(/color:\s*var\(--chat-text-muted\)/);
  });

  it('hover 只做常规加深,不变红', () => {
    const hover = ruleFor('.remove:hover');
    expect(hover).toMatch(/color:\s*var\(--chat-text-strong\)/);
    expect(hover).toMatch(/border-color:\s*var\(--chat-border-strong\)/);
    expect(hover).not.toMatch(/--chat-red/);
  });

  it('叉本身 10px —— 稿子 `.del svg { width: 10px; height: 10px }`', () => {
    renderChip(1);
    const icon = screen.getByTestId('chat-quoted-refs').querySelector('button svg');
    expect(icon?.getAttribute('width')).toBe('10');
    expect(icon?.getAttribute('height')).toBe('10');
  });
});

/**
 * 芯片**贴着内容**,不撑满一行。
 *
 * 用户 2026-08-27 真机:「你这个怎么撑满一行了」。量到宽度 457px = 整行。
 *
 * 机制是 **blockification**:`.refs` 写的是 `display: inline-flex`(和稿子逐字相同),
 * 但它是 `.composer-shell` 这个**纵向 flex 容器**的项目,按 CSS 规范 inline 级的
 * `display` 会被块化成 `flex`;再叠上容器默认的 `align-items: normal`(即 stretch),
 * 就被拉满了宽度。计算值确实是 `flex` —— 所以只查 CSS 文本里写没写 `inline-flex`
 * 是查不出来的,那一行是对的。
 *
 * 稿子那边 `.refs` 的父容器是 `.composer`,不是这种 stretch 容器,所以它天然保持内容宽。
 * 我们不动父容器(它还有别的孩子),给芯片自己 `align-self: flex-start` ——
 * 这条不依赖父容器怎么摆,换个容器也不会再坏一次。
 */
describe('芯片不撑满一行', () => {
  it('自己声明了 align-self,不靠父容器的对齐方式', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../src/components/chat/QuotedRefs.module.css'),
      'utf8',
    );
    const i = css.indexOf('.refs');
    const block = css.slice(i, css.indexOf('}', i));
    expect(block).toMatch(/align-self:\s*flex-start/);
  });

  it('inline-flex 那一行还在 —— 不许为了修宽度把它换成 block', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../src/components/chat/QuotedRefs.module.css'),
      'utf8',
    );
    const i = css.indexOf('.refs');
    const block = css.slice(i, css.indexOf('}', i));
    expect(block).toMatch(/display:\s*inline-flex/);
  });
});
