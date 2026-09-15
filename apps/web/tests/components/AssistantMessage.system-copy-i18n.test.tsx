// @vitest-environment jsdom

import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage } from '../../src/types';

afterEach(() => {
  cleanup();
});

function renderZh(ui: ReactElement) {
  return rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);
}

function assistantMessage(events: ChatMessage['events']): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    runStatus: 'succeeded',
    startedAt: 1_000,
    endedAt: 2_000,
  };
}

function pluginCandidateMessage(text: string): ChatMessage {
  return assistantMessage([
    { kind: 'text', text },
    {
      kind: 'plugin_candidate',
      candidateId: 'candidate-1',
      title: 'Design review helper',
      description: 'This repo looks like it could work as a plugin.',
    },
  ]);
}

describe('AssistantMessage client-provided system copy', () => {
  it('localizes the design-system direction suppression notice', () => {
    const directionForm = [
      '<question-form id="direction" title="Pick a visual direction">',
      JSON.stringify({
        questions: [
          {
            id: 'direction',
            label: 'Direction',
            type: 'direction-cards',
            options: ['Modern minimal'],
            cards: [
              {
                id: 'Modern minimal',
                label: 'Modern minimal',
                mood: 'Clean and restrained.',
                references: ['Linear'],
                palette: ['#ffffff', '#111111'],
                displayFont: 'serif',
                bodyFont: 'sans-serif',
              },
            ],
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    renderZh(
      <AssistantMessage
        message={assistantMessage([{ kind: 'text', text: directionForm }])}
        streaming={false}
        projectId="project-1"
        isLast
        suppressDirectionForms
      />,
    );

    expect(screen.getByText('已选择当前设计系统，视觉方向已锁定。')).toBeTruthy();
    expect(screen.queryByText('Active design system selected. Visual direction is already locked.')).toBeNull();
  });

  it('localizes only the known context-compaction status label', () => {
    renderZh(
      <AssistantMessage
        message={assistantMessage([
          { kind: 'status', label: 'context_compaction', detail: 'runtime detail' },
          { kind: 'status', label: 'custom_runtime_phase', detail: 'custom detail' },
        ])}
        streaming
        projectId="project-1"
      />,
    );

    expect(screen.getByText('正在压缩上下文')).toBeTruthy();
    expect(screen.getByText('custom_runtime_phase')).toBeTruthy();
  });

  it('keeps Chinese prose without the retired plugin contribution action or busy label', () => {
    const text = '仓库检查已经完成。';
    renderZh(
      <AssistantMessage
        message={pluginCandidateMessage(text)}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText('Design review helper')).toBeNull();
    expect(screen.queryByRole('button', { name: '贡献到 open-design' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contribute to open-design' })).toBeNull();
    expect(screen.queryByText('正在启动…')).toBeNull();
    expect(screen.queryByText('Starting...')).toBeNull();
  });

  it('keeps literal code without the retired plugin draft controls or busy label', () => {
    const example = '查看详情';
    const { container } = renderZh(
      <AssistantMessage
        message={pluginCandidateMessage(`保留代码示例：\`${example}\`。`)}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(container.querySelector('code')?.textContent).toBe(example);
    expect(container.textContent).toContain('保留代码示例：');
    expect(screen.queryByRole('button', { name: '查看详情' })).toBeNull();
    expect(screen.queryByRole('button', { name: '创建插件/模板' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View details' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create plugin/template' })).toBeNull();
    expect(screen.queryByText('创建中…')).toBeNull();
    expect(screen.queryByText('Creating...')).toBeNull();
  });
});
