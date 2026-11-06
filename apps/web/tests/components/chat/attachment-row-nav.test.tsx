// @vitest-environment jsdom
/**
 * 组件 2 · 用户消息-附件(第 58 格):附件行两端的翻页箭头。
 *
 * 要钉住的是**可用性后果**,不是像素:这一行永远单行、超出横向滚动,而滚动条
 * 按稿子藏起来了 —— 没有箭头的话鼠标用户只剩「按住 shift 滚轮」这一条暗路。
 * 所以三条断言:能滚时出箭头、滚到头那一侧不出、点了真的滚。
 *
 * jsdom 不做布局,`scrollWidth / clientWidth` 恒为 0,所以这里把这两个值直接摆出来
 * (和 user-message-clamp 那边 stub `scrollHeight` 是同一个手法)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UserMessageImpl } from '../../../src/components/ChatPane';

const t = ((key: string) => key) as never;

/** 六张卡 377 塞进 412 —— 一行放得下 */
const FITS = { scrollWidth: 377, clientWidth: 412 };
/** 七张卡 441 —— 第七张被切在腰上 */
const OVERFLOWS = { scrollWidth: 441, clientWidth: 412 };

/**
 * 让附件行看起来有(或没有)溢出。只改这一个元素,不动 HTMLElement.prototype ——
 * 气泡那边也在量 scrollHeight,整片 stub 会串味。
 */
function stubRow(row: HTMLElement, box: { scrollWidth: number; clientWidth: number }): void {
  Object.defineProperty(row, 'scrollWidth', { configurable: true, get: () => box.scrollWidth });
  Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => box.clientWidth });
  let scrollLeft = 0;
  Object.defineProperty(row, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });
}

function attachments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    path: `uploads/第${i + 1}张.png`,
    name: `第${i + 1}张.png`,
    kind: 'image' as const,
    order: i + 1,
  }));
}

function renderRow(count: number) {
  return render(
    <UserMessageImpl
      message={{
        id: 'm1',
        role: 'user',
        content: '照这些图做',
        createdAt: 1,
        attachments: attachments(count),
      } as never}
      projectId="p1"
      t={t}
      appliedContextItems={[]}
    />,
  );
}

/** 量一次:jsdom 里 stub 完要手动把 scroll 事件打一遍,组件才会重量。 */
function resync(row: HTMLElement): void {
  act(() => {
    fireEvent.scroll(row);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});


/**
 * 箭头**常驻在 DOM 里**,出没由壳上的 `is-prev` / `is-next` 决定
 * (稿子 `.att-wrap.is-prev > .att-nav.mod-prev` 就是这么写的;本仓也约定条件显示的
 * 元素保持挂载 —— React 卸载会把退场过渡整个跳过)。
 * 这几条用例要守的行为一个字没变:「一行放得下时两枚都不出」「停在行首只出往后那一枚」。
 * 只是判据从「在不在 DOM 里」换成「壳有没有把它打开」——
 * 藏起来的那颗是 `display: none`,既不显形也进不了 Tab 序,对读屏同样是不存在的。
 */
const navShown = (side: 'prev' | 'next'): boolean => {
  const wrap = document.querySelector('.msg-att-wrap');
  if (!wrap) throw new Error('找不到附件行的壳');
  return wrap.classList.contains(`is-${side}`);
};

describe('附件行 · 翻页箭头', () => {
  it('一行放得下时两枚都不出 —— 常驻的箭头是在说一件不存在的事', () => {
    renderRow(6);
    const row = screen.getByTestId('user-attachment-row');
    stubRow(row, FITS);
    resync(row);
    expect(navShown('prev'), '往前那一枚不该出').toBe(false);
    expect(navShown('next'), '往后那一枚不该出').toBe(false);
  });

  it('停在行首:只出「往后」那一枚,行首那一侧不出', () => {
    renderRow(7);
    const row = screen.getByTestId('user-attachment-row');
    stubRow(row, OVERFLOWS);
    resync(row);
    expect(navShown('prev'), '往前那一枚不该出').toBe(false);
    expect(navShown('next'), '往后那一枚该出').toBe(true);
  });

  it('滚到中间两枚都出,滚到行尾「往后」那一枚收回去', () => {
    renderRow(7);
    const row = screen.getByTestId('user-attachment-row');
    stubRow(row, OVERFLOWS);
    row.scrollLeft = 14;
    resync(row);
    expect(navShown('prev'), '往前那一枚该出').toBe(true);
    expect(navShown('next'), '往后那一枚该出').toBe(true);

    row.scrollLeft = OVERFLOWS.scrollWidth - OVERFLOWS.clientWidth;
    resync(row);
    expect(navShown('prev'), '往前那一枚该出').toBe(true);
    expect(navShown('next'), '往后那一枚不该出').toBe(false);
  });

  it('点了真的滚:一次走八成宽,留两成重叠', () => {
    renderRow(7);
    const row = screen.getByTestId('user-attachment-row');
    stubRow(row, OVERFLOWS);
    const scrollBy = vi.fn();
    (row as HTMLElement & { scrollBy: typeof scrollBy }).scrollBy = scrollBy;
    resync(row);

    fireEvent.click(screen.getByTestId('msg-att-nav-next'));
    expect(scrollBy).toHaveBeenCalledWith({ left: 412 * 0.8, behavior: 'smooth' });

    row.scrollLeft = 14;
    resync(row);
    fireEvent.click(screen.getByTestId('msg-att-nav-prev'));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -(412 * 0.8), behavior: 'smooth' });
  });

  it('拿不到 scrollBy(老环境)时退回直接改 scrollLeft,不是一点反应都没有', () => {
    renderRow(7);
    const row = screen.getByTestId('user-attachment-row');
    stubRow(row, OVERFLOWS);
    Object.defineProperty(row, 'scrollBy', { configurable: true, value: undefined });
    resync(row);

    fireEvent.click(screen.getByTestId('msg-att-nav-next'));
    expect(row.scrollLeft).toBeCloseTo(412 * 0.8);
  });
});
