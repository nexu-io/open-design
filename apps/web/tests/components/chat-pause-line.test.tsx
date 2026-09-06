// @vitest-environment jsdom
/**
 * 组件 20 · 暂停任务(84 格状态矩阵第 81 格)。
 *
 * 这份组件只保留真正的 paused-task 展示形态。run 的 `canceled/user_stop`
 * 终态由 AssistantMessage footer 接管,不再作为这个组件的输入。
 *
 * 文案逐字对设计稿 4264(zh-CN 是原文,不改写)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../src/i18n';
import { PauseLine } from '../../src/components/chat/PauseLine';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);
const line = () => screen.queryByTestId('chat-pause-line');

describe('PauseLine', () => {
  it('states a real paused-task state', () => {
    render(<PauseLine />);
    expect(line()?.textContent).toBe('已手动暂停任务');
  });

  it('is one line with nothing to act on', () => {
    render(<PauseLine />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not accept or spell out run progress', () => {
    render(<PauseLine />);
    expect(line()?.textContent ?? '').not.toMatch(/\d/);
  });
});
