// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ToolCard } from '../../src/components/ToolCard';
import { I18nProvider } from '../../src/i18n';
import type { AgentEvent } from '../../src/types';

type ToolUse = Extract<AgentEvent, { kind: 'tool_use' }>;
type ToolResult = Extract<AgentEvent, { kind: 'tool_result' }>;

function renderTool(use: ToolUse, result?: ToolResult) {
  return render(
    <I18nProvider initial="en">
      <ToolCard use={use} result={result} runStreaming={false} runSucceeded />
    </I18nProvider>,
  );
}

afterEach(() => cleanup());

describe('ToolCard secondary result disclosures', () => {
  it('uses ten distinct semantic category icons and groups every search tool under Search', () => {
    const cases: Array<{
      name: string;
      category: string;
      input: Record<string, unknown>;
    }> = [
      { name: 'TodoWrite', category: 'todo', input: { todos: [{ content: 'Review', status: 'completed' }] } },
      { name: 'Write', category: 'write', input: { file_path: 'result.ts', content: 'export {}' } },
      { name: 'Edit', category: 'edit', input: { file_path: 'result.ts', old_string: 'a', new_string: 'b' } },
      { name: 'Read', category: 'read', input: { file_path: 'source.ts' } },
      { name: 'Bash', category: 'run', input: { command: 'pnpm guard' } },
      { name: 'Grep', category: 'search', input: { pattern: 'TODO', path: 'src' } },
      { name: 'WebFetch', category: 'fetch', input: { url: 'https://open-design.ai' } },
      { name: 'Skill', category: 'skill', input: { name: 'visual-explain' } },
      { name: 'AskUserQuestion', category: 'ask', input: { questions: [{ question: 'Continue?', options: ['Yes'] }] } },
      { name: 'CustomTool', category: 'other', input: { name: 'custom action' } },
    ];
    const categoryIcons = new Map<string, string>();

    for (const [index, item] of cases.entries()) {
      const { container, unmount } = renderTool(
        { kind: 'tool_use', id: `tool-${index}`, name: item.name, input: item.input },
        { kind: 'tool_result', toolUseId: `tool-${index}`, content: 'done', isError: false },
      );
      const category = container.querySelector(`[data-tool-category="${item.category}"]`);
      expect(category, item.name).not.toBeNull();
      categoryIcons.set(item.category, category?.querySelector('svg')?.innerHTML ?? '');
      unmount();
    }

    expect(new Set(categoryIcons.values())).toHaveLength(10);

    for (const [index, item] of [
      { name: 'Glob', input: { pattern: '**/*.tsx', path: 'src' } },
      { name: 'Grep', input: { pattern: 'TaskActivityCard', path: 'src' } },
      { name: 'WebSearch', input: { query: 'Open Design chat activity' } },
    ].entries()) {
      const { container, unmount } = renderTool(
        { kind: 'tool_use', id: `search-${index}`, name: item.name, input: item.input },
        { kind: 'tool_result', toolUseId: `search-${index}`, content: 'done', isError: false },
      );
      expect(container.querySelector('[data-tool-category="search"]')).not.toBeNull();
      expect(container.querySelector('.op-title')?.textContent).toBe('Search');
      unmount();
    }
  });

  it('keeps grep output behind a second disclosure click', () => {
    const { container } = renderTool(
      { kind: 'tool_use', id: 'grep-1', name: 'Grep', input: { pattern: 'TODO', path: 'src' } },
      { kind: 'tool_result', toolUseId: 'grep-1', content: 'src/app.ts:12: TODO', isError: false },
    );

    const head = container.querySelector<HTMLButtonElement>('.op-search .op-card-head');
    const disclosure = container.querySelector('.op-search .accordion-collapsible');
    const status = container.querySelector('[data-tool-category="search"]');
    expect(head?.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);
    expect(status?.getAttribute('data-tool-state')).toBe('completed');
    expect(status?.classList.contains('op-status-done')).toBe(false);

    fireEvent.click(head as HTMLButtonElement);
    expect(head?.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.classList.contains('open')).toBe(true);
    expect(container.textContent).toContain('src/app.ts:12: TODO');
  });

  it('keeps a failed read identifiable as a read tool instead of replacing its icon with a status icon', () => {
    const { container } = renderTool(
      { kind: 'tool_use', id: 'read-error', name: 'Read', input: { file_path: '/repo/missing.ts' } },
      { kind: 'tool_result', toolUseId: 'read-error', content: 'File not found', isError: true },
    );

    const status = container.querySelector('[data-tool-category="read"]');
    expect(status?.getAttribute('data-tool-state')).toBe('error');
    expect(status?.classList.contains('op-status-category')).toBe(true);
    expect(status?.classList.contains('op-status-done')).toBe(false);
    expect(status?.classList.contains('op-status-error')).toBe(false);
    expect(container.textContent).not.toContain('File not found');
  });

  it('keeps read contents hidden until the read row opens', () => {
    const { container } = renderTool(
      { kind: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
      { kind: 'tool_result', toolUseId: 'read-1', content: 'export const answer = 42;', isError: false },
    );

    const head = container.querySelector<HTMLButtonElement>('.op-file .op-card-head');
    const disclosure = container.querySelector('.op-file .accordion-collapsible');
    expect(head?.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);

    fireEvent.click(head as HTMLButtonElement);
    expect(head?.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.classList.contains('open')).toBe(true);
    expect(container.textContent).toContain('export const answer = 42;');
  });

  it('keeps command and output behind the bash row disclosure', () => {
    const { container } = renderTool(
      { kind: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'pnpm typecheck', description: 'Check types' } },
      { kind: 'tool_result', toolUseId: 'bash-1', content: 'Done', isError: false },
    );

    const head = container.querySelector<HTMLButtonElement>('.op-bash .op-card-head');
    const disclosure = container.querySelector('.op-bash .accordion-collapsible');
    expect(head?.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);

    fireEvent.click(head as HTMLButtonElement);
    expect(disclosure?.classList.contains('open')).toBe(true);
    expect(container.textContent).toContain('pnpm typecheck');
    expect(container.textContent).toContain('Done');
  });
});
