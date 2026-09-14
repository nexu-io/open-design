// @vitest-environment jsdom
/**
 * OPEND-2713 — 引用芯片的移除入口搬到**前面那枚气泡上**。
 *
 * ## 为什么这两件事是一件事
 *
 * 工单原文是「右侧留白过多,收紧」。真机量下来(无头 Chrome,`getComputedStyle`
 * + `getBoundingClientRect`,量的是仓库自己的镜像陈列页 `docs/design/chat-mirror`)
 * 那块留白**不是样式失误,是给移除键留的位置**:
 *
 *   文字右缘 → 芯片内缘 = 31px      图标左缘 → 芯片内缘 = 9px
 *   31 = 5(gap)+ 1(margin-inline-start)+ 16(按钮)+ 9(padding)
 *   按钮 16×16、`opacity: 0`、`display: grid` —— 看不见,但**一直占着位**
 *
 * 所以收紧右侧的前提是那枚按钮先搬走。搬到前面那枚气泡上(hover 时气泡换成
 * 移除键),右边空出来的正好是那 22px,芯片两侧回到 9/9。
 *
 * ## 行为一个字不改
 *
 * 搬的是位置,不是语义:还是同一个 `onClear`(清掉**全部**引用)、同一句
 * `chat.quote.removeAria`、没有二次确认、清完芯片整个卸载(`quotes.length === 0`
 * 时 `QuotedRefs` 返回 null)。这些都是从搬之前的实现里读出来的,不是新定的。
 *
 * ## 判据为什么落在结构上
 *
 * jsdom 不排版也不解 `var()` —— 在这里量宽度 / 留白 / 颜色全是假绿。留白那一半
 * 的证据在真浏览器里(见上面的读数);这份用例钉的是「按钮到底挂在哪一格、
 * 右边还有没有东西占位」,以及那条让点击穿过气泡打到按钮上的 `pointer-events`。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuotedRefs } from '../../../src/components/chat/QuotedRefs';
import { I18nProvider } from '../../../src/i18n';
import type { ChatQuote } from '../../../src/runtime/chat/quote-selection';

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/QuotedRefs.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 只切顶层逗号 —— `:has(.a, .b)` 里的逗号是参数分隔,一刀切会造出假选择器。 */
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

function ruleFor(selector: string): string {
  for (const block of CSS.split('}')) {
    const at = block.indexOf('{');
    if (at < 0) continue;
    const heads = splitTopLevel(block.slice(0, at)).map((one) => one.trim());
    if (heads.includes(selector)) return block.slice(at + 1);
  }
  return '';
}

/** 取一条 at-rule 的整块正文(按花括号配对切,不靠 `}}` 这种排版巧合)。 */
function mediaBlock(head: string): string {
  const at = CSS.indexOf(head);
  if (at < 0) return '';
  const open = CSS.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
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

function renderChip(count: number, onClear: () => void = () => undefined) {
  return render(
    <I18nProvider initial="zh-CN">
      <QuotedRefs quotes={quotes(count)} onClear={onClear} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('引用芯片 · 移除键住在前面那枚气泡上', () => {
  it('按钮和气泡同住芯片最前面那一格', () => {
    renderChip(1);
    const chip = screen.getByTestId('chat-quoted-refs');
    const lead = chip.firstElementChild!;
    const button = chip.querySelector('button')!;
    // 气泡排在按钮**后面**(见 `QuotedRefs.tsx` 里那段注释),所以按相邻兄弟取,
    // 不按「第一个 svg」—— 第一个 svg 现在是叉。
    const bubble = chip.querySelector('button + svg')!;

    expect(lead.contains(button), '移除键不在最前面那一格里').toBe(true);
    expect(lead.contains(bubble), '气泡不在最前面那一格里').toBe(true);
    expect(button.parentElement).toBe(bubble.parentElement);
  });

  it('文字右边不再有任何东西占位 —— 文字之后直接是脱流的浮层', () => {
    renderChip(1);
    const chip = screen.getByTestId('chat-quoted-refs');
    const text = Array.from(chip.children).find(
      (el) => el.tagName === 'SPAN' && el.textContent === '1 条注释',
    );
    expect(text, '找不到条数那一格 —— 夹具变了').toBeTruthy();
    expect(text!.nextElementSibling).toBe(
      screen.getByTestId('chat-quoted-refs-popover'),
    );
    expect(text!.nextElementSibling).toBe(chip.lastElementChild);
  });

  it('整枚芯片只有一个移除键,没有搬完留下的第二个', () => {
    renderChip(3);
    expect(screen.getByTestId('chat-quoted-refs').querySelectorAll('button')).toHaveLength(1);
  });

  it('气泡换成移除键是 hover / 键盘聚焦时的两边对调', () => {
    expect(ruleFor('.icon'), '静止时该看见气泡').toMatch(/opacity:\s*1/);
    expect(ruleFor('.remove'), '静止时不该看见叉').toMatch(/opacity:\s*0/);

    // 让位和顶上来是同一条规则的两半,两边都要有 hover 和键盘聚焦两个触发点。
    expect(ruleFor('.refs:hover .icon'), 'hover 时气泡没让位').toMatch(/opacity:\s*0/);
    expect(ruleFor('.remove:focus-visible ~ .icon'), '键盘聚焦时气泡没让位').toMatch(
      /opacity:\s*0/,
    );
    expect(ruleFor('.refs:hover .remove'), 'hover 时叉没露出来').toMatch(/opacity:\s*1/);
    expect(ruleFor('.remove:focus-visible'), '键盘聚焦时叉没露出来').toMatch(/opacity:\s*1/);
  });

  it('气泡不吃指针 —— 它盖在按钮上面,点击必须穿过去', () => {
    expect(ruleFor('.icon')).toMatch(/pointer-events:\s*none/);
  });

  // 触屏上等不到 hover,所以那一格的静止态就得**是**移除键 —— 这正是搬之前
  // `@media (hover: none) { .remove { opacity: 1 } }` 那条规则要保住的东西:
  // 叉必须够得着。搬到同一格之后,够得着就意味着气泡在这里让位。
  it('触屏没有 hover,那一格直接常驻移除键', () => {
    const block = mediaBlock('@media (hover: none)');
    expect(block, '触屏分支没了 —— 叉在触屏上永远等不出来').not.toBe('');
    expect(block, '触屏上叉仍该常驻').toMatch(/\.remove\s*\{[^}]*opacity:\s*1/);
    expect(block, '叉常驻了,气泡却没让位 —— 两枚会叠在同一格上').toMatch(
      /\.icon\s*\{[^}]*opacity:\s*0/,
    );
  });
});

describe('引用芯片 · 搬位置不改行为', () => {
  it('还是同一个「清掉全部」,还是同一句无障碍名', () => {
    const onClear = vi.fn();
    renderChip(4, onClear);
    const button = screen.getByTestId('chat-quoted-refs').querySelector('button')!;

    expect(button.getAttribute('aria-label')).toBe('移除注释');
    expect(button.getAttribute('title')).toBe('移除注释');
    fireEvent.click(button);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('叉本身仍是 10px —— 稿子共用的 `.del svg { width:10px; height:10px }`', () => {
    renderChip(1);
    const glyph = screen.getByTestId('chat-quoted-refs').querySelector('button svg');
    expect(glyph?.getAttribute('width')).toBe('10');
    expect(glyph?.getAttribute('height')).toBe('10');
  });
});
