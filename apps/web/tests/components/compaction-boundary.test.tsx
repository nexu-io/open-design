// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import { CompactionBoundary } from '../../src/components/chat/CompactionBoundary';

afterEach(cleanup);

describe('CompactionBoundary', () => {
  it('renders the boundary marker with the English label', () => {
    render(
      <I18nProvider initial="en">
        <CompactionBoundary />
      </I18nProvider>,
    );
    const line = screen.getByTestId('chat-compaction-boundary');
    expect(line).toBeTruthy();
    expect(line.textContent).toContain('Earlier conversation compacted into a summary');
  });

  it('renders the Chinese label under zh-CN', () => {
    render(
      <I18nProvider initial="zh-CN">
        <CompactionBoundary />
      </I18nProvider>,
    );
    const line = screen.getByTestId('chat-compaction-boundary');
    expect(line.textContent).toContain('以上对话已压缩为摘要');
  });

  it('is a single muted status line without any interactive controls', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <CompactionBoundary />
      </I18nProvider>,
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });
});