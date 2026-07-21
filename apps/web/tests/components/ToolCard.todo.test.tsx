// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TodoCard } from '../../src/components/ToolCard';

describe('TodoCard completion disclosure', () => {
  afterEach(() => cleanup());

  it('starts a fully completed checklist collapsed and lets users review its tasks', () => {
    const { container } = render(
      <TodoCard
        input={{
          todos: [
            { content: 'Read home.ts', status: 'completed' },
            { content: 'Edit home.ts', status: 'completed' },
            { content: 'Finish', status: 'completed' },
          ],
        }}
        runStreaming
        runSucceeded={false}
      />,
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
