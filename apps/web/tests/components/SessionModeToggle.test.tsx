// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionModeToggle } from '../../src/components/SessionModeToggle';
import { I18nProvider } from '../../src/i18n';

afterEach(() => cleanup());

describe('SessionModeToggle', () => {
  it('shows only the active mode until the menu is opened', () => {
    render(<SessionModeToggle mode="design" onChange={vi.fn()} />);

    expect(screen.getByTestId('session-mode-trigger').textContent).toContain('Design Agent');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByTestId('session-mode-trigger'));

    expect(screen.getByRole('menuitemradio', { name: /Design Agent mode/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: /Chat mode/i }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches mode from the menu', () => {
    const onChange = vi.fn();
    render(<SessionModeToggle mode="design" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('session-mode-trigger'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Chat mode/i }));

    expect(onChange).toHaveBeenCalledWith('chat');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows localized guidance only after opening the menu', () => {
    render(
      <I18nProvider initial="zh-CN">
        <SessionModeToggle mode="chat" onChange={vi.fn()} />
      </I18nProvider>,
    );

    const trigger = screen.getByTestId('session-mode-trigger');
    fireEvent.pointerEnter(trigger);

    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip').textContent).toContain('Chat 模式');
    expect(screen.getByRole('tooltip').textContent).toContain('总结这份稿子，并指出还缺什么。');

    const designOption = screen.getByRole('menuitemradio', { name: /Design Agent 模式/i });
    fireEvent.pointerEnter(designOption);

    const menu = screen.getByRole('menu');
    const card = screen.getByRole('tooltip');
    expect(menu.textContent).not.toContain('适合创建或修改具体设计产物');
    expect(card.textContent).toContain('适合创建或修改具体设计产物');
    expect(card.textContent).toContain('图片、视频、HyperFrames、音频');
    expect(card.textContent).toContain('为这次 campaign 生成图片、视频和音频创意。');
  });
});
