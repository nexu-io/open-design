// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TodoCard } from '../../src/components/ToolCard';

describe('TodoCard completion disclosure', () => {
  afterEach(() => cleanup());

  const allDone = {
    todos: [
      { content: 'Read home.ts', status: 'completed' },
      { content: 'Edit home.ts', status: 'completed' },
      { content: 'Finish', status: 'completed' },
    ],
  };

  it('starts a fully completed checklist collapsed and lets users review its tasks', () => {
    const { container } = render(
      <TodoCard input={allDone} runStreaming={false} runSucceeded />,
    );

    const toggle = container.querySelector<HTMLButtonElement>('button.op-todo-toggle');
    expect(toggle?.textContent).toContain('3/3');
    expect(toggle?.textContent).toContain('Done');
    expect(container.querySelector('.op-todo-icon')).not.toHaveClass('is-complete');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.op-todo')).toHaveClass('op-todo-collapsed');
    expect(container.querySelector('.accordion-collapsible')).not.toHaveClass('open');
    expect(container.querySelectorAll('.todo-item')).toHaveLength(3);
    expect(container.querySelector('.op-todo-done')).toBeNull();

    fireEvent.click(toggle!);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.accordion-collapsible')).toHaveClass('open');
  });

  /*
   * 「勾完清单」和「这一轮跑完了」是两件事。agent 常常把每条 todo 标完之后才开始
   * 写收尾正文,那段时间清单已经 3/3,轮次却还在跑 —— 这时候摆一个「Done」,
   * 排在后面的追问看起来就像卡住了。所以完成词只认**轮次终态**
   * (`ToolCard.tsx` 的 `settledComplete`),不认清单本身。
   *
   * 收起是另一条独立规矩:没有 pending / in_progress 就收起来,和轮次跑没跑完无关,
   * 所以下面仍然钉住「清单勾完即收起、任务照样读得到」。
   */
  it('withholds the completion word while the run is still going, but still collapses', () => {
    const { container } = render(
      <TodoCard input={allDone} runStreaming runSucceeded={false} />,
    );

    const toggle = container.querySelector<HTMLButtonElement>('button.op-todo-toggle');
    expect(toggle?.textContent).toContain('3/3');
    expect(toggle?.textContent).not.toContain('Done');
    expect(container.querySelector('.op-todo-complete')).toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.todo-item')).toHaveLength(3);
  });

  it('shows task-by-task progress until every task is complete', () => {
    const { container } = render(
      <TodoCard
        input={{
          todos: [
            { content: 'Read home.ts', status: 'completed' },
            { content: 'Edit home.ts', status: 'in_progress' },
            { content: 'Finish', status: 'pending' },
          ],
        }}
        runStreaming
        runSucceeded={false}
      />,
    );

    const toggle = container.querySelector<HTMLButtonElement>('button.op-todo-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.todo-item')).toHaveLength(3);

    fireEvent.click(toggle!);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });
});
