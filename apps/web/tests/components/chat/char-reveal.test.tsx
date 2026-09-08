// @vitest-environment jsdom
/**
 * 逐字化开(W9)。这一层要证的不是「好不好看」,是**它不会把 React 的 DOM 搞坏**:
 * 这个 hook 会把文本节点拆成一个个 span,而那些节点是 React 建的、React 还要接着更新。
 * 如果两边打架,表现是「后面的字更新不上去」或者直接抛 NotFoundError —— 流式场景每帧都在踩。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { useCharReveal } from '../../../src/components/chat/useCharReveal';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Prose({ text, streaming }: { text: string; streaming: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useCharReveal(ref, streaming);
  return <div ref={ref} data-testid="prose"><p>{text}</p></div>;
}

const visible = () => document.querySelector('[data-testid="prose"]')?.textContent ?? '';

describe('逐字化开不会跟 React 打架', () => {
  it('一帧帧往后长:每一帧的可见文字都还是对的', () => {
    const { rerender } = render(<Prose text="我" streaming />);
    const frames = ['我先', '我先看', '我先看一', '我先看一下', '我先看一下规格'];
    for (const f of frames) {
      rerender(<Prose text={f} streaming />);
      expect(visible()).toBe(f);
    }
  });

  it('markdown 闭合导致可见文字变短也不炸(这是曾经把整段当新字的那种情况)', () => {
    const { rerender } = render(<Prose text="**加粗中" streaming />);
    rerender(<Prose text="**加粗**后面" streaming />);
    rerender(<Prose text="加粗后面" streaming />);   // 闭合后可见文字变短
    expect(visible()).toBe('加粗后面');
  });

  it('流结束后把 span 全部拆掉,留下干净的文本', () => {
    const { rerender } = render(<Prose text="想好了" streaming />);
    rerender(<Prose text="想好了,开始做" streaming />);
    rerender(<Prose text="想好了,开始做" streaming={false} />);
    expect(document.querySelectorAll('.rv')).toHaveLength(0);
    expect(visible()).toBe('想好了,开始做');
  });

  it('已经显示的字不重播:上一帧裹的 span 不会套娃', () => {
    const { rerender } = render(<Prose text="一二三" streaming />);
    rerender(<Prose text="一二三四" streaming />);
    rerender(<Prose text="一二三四五" streaming />);
    // 每个 .rv 里只有一个字符,不会出现 .rv 套 .rv
    for (const span of document.querySelectorAll('.rv')) {
      expect(span.querySelector('.rv')).toBeNull();
      expect((span.textContent ?? '').length).toBe(1);
    }
  });

  it('**嵌套结构**下也不会更新不上去 —— 真实 markdown 是这种形状,React 会逐个跟踪文本节点', () => {
    function Rich({ head, tail, streaming }: { head: string; tail: string; streaming: boolean }): ReactElement {
      const ref = useRef<HTMLDivElement>(null);
      useCharReveal(ref, streaming);
      return (
        <div ref={ref} data-testid="prose">
          <p>{head}<b>要点</b>{tail}</p>
          <ul><li>{tail}</li></ul>
        </div>
      );
    }
    const { rerender } = render(<Rich head="先说" tail="一" streaming />);
    for (const [h, t] of [['先说', '一二'], ['先说下', '一二三'], ['先说下面', '一二三四']] as const) {
      rerender(<Rich head={h} tail={t} streaming />);
      expect(visible()).toBe(`${h}要点${t}${t}`);
    }
  });

  it('关了动效就完全不插手 DOM', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<Prose text="不该被拆" streaming />);
    expect(document.querySelectorAll('.rv')).toHaveLength(0);
    expect(visible()).toBe('不该被拆');
    vi.unstubAllGlobals();
  });
});
