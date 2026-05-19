// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryHelpMenu } from '../../src/components/EntryHelpMenu';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
});

describe('EntryHelpMenu', () => {
  it('localizes help links in Simplified Chinese', () => {
    render(
      <I18nProvider initial="zh-CN">
        <EntryHelpMenu />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('entry-help-trigger'));

    expect(screen.getByRole('menuitem', { name: '在 GitHub 上获取帮助' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '提交功能建议' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '最新动态' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '下载桌面端' })).toBeTruthy();
    expect(screen.queryByText('Get help on GitHub')).toBeNull();
    expect(screen.queryByText('Submit a feature request')).toBeNull();
  });
});
