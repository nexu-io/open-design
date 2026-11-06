// @vitest-environment jsdom

// Behavior carried over from SessionModeToggle.test.tsx — the #5517 composer
// mode picker replaces that toggle in both composers, so the same invariants
// (menu-on-demand, aria-checked radio semantics, real ChatSessionMode ids on
// change, localized copy) are asserted against the new component.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComposerModePicker } from '../../src/components/ComposerModePicker';
import { I18nProvider } from '../../src/i18n';

afterEach(() => cleanup());

describe('ComposerModePicker', () => {
  it('selects Design by default and opens the menu on demand', () => {
    render(<ComposerModePicker mode="design" onModeChange={vi.fn()} />);

    // 设计 is the app default AND the default selection: the pill, its label,
    // and the clear × are all present on first paint.
    const trigger = screen.getByTestId('composer-mode-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Mode: Design');
    expect(trigger.textContent).toContain('Design');
    expect(screen.getByTestId('composer-mode-clear')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
    expect(screen.getByTestId('composer-mode-menu-design').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('composer-mode-menu-plan').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('composer-mode-menu-chat').getAttribute('aria-checked')).toBe('false');
  });

  it('shows the selected pill (with clear) for a non-default mode', () => {
    render(<ComposerModePicker mode="plan" onModeChange={vi.fn()} />);

    const trigger = screen.getByTestId('composer-mode-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Mode: Plan');
    expect(trigger.textContent).toContain('Plan');
    expect(screen.getByTestId('composer-mode-clear')).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.getByTestId('composer-mode-menu-plan').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('composer-mode-menu-design').getAttribute('aria-checked')).toBe('false');
  });

  it('switches into the lightweight Ask mode from the menu', () => {
    const onModeChange = vi.fn();
    render(<ComposerModePicker mode="design" onModeChange={onModeChange} />);

    fireEvent.click(screen.getByTestId('composer-mode-trigger'));
    fireEvent.click(screen.getByTestId('composer-mode-menu-chat'));

    expect(onModeChange).toHaveBeenCalledWith('chat');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('switches mode from the menu', () => {
    const onModeChange = vi.fn();
    render(<ComposerModePicker mode="design" onModeChange={onModeChange} />);

    fireEvent.click(screen.getByTestId('composer-mode-trigger'));
    fireEvent.click(screen.getByTestId('composer-mode-menu-plan'));

    expect(onModeChange).toHaveBeenCalledWith('plan');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clears a forced mode back to the design default', () => {
    const onModeChange = vi.fn();
    render(<ComposerModePicker mode="chat" onModeChange={onModeChange} />);

    fireEvent.click(screen.getByTestId('composer-mode-clear'));

    expect(onModeChange).toHaveBeenCalledWith('design');
  });

  it('keeps the default-selected design pill removable, and re-pickable after clearing', () => {
    const onModeChange = vi.fn();
    render(<ComposerModePicker mode="design" onModeChange={onModeChange} />);

    // The default selection is a real selection, not a decoration: the × drops
    // it back to the neutral trigger. The session mode itself is unchanged
    // (design was and remains the mode), so no redundant change fires.
    fireEvent.click(screen.getByTestId('composer-mode-clear'));
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-mode-trigger').getAttribute('aria-label')).toBe('Choose a mode');
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();

    // …and picking 设计 again re-pins it, still without a redundant change.
    fireEvent.click(screen.getByTestId('composer-mode-trigger'));
    fireEvent.click(screen.getByTestId('composer-mode-menu-design'));
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-mode-trigger').getAttribute('aria-label')).toBe('Mode: Design');
  });

  it('does not re-force the design pill once the user has cleared it', () => {
    // The default is INITIAL state, not a per-render assertion: a re-render
    // (new props, parent state change) must not resurrect the pill the user
    // just dismissed.
    const { rerender } = render(<ComposerModePicker mode="design" onModeChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('composer-mode-clear'));
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();

    rerender(<ComposerModePicker mode="design" onModeChange={vi.fn()} />);
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();
    expect(screen.getByTestId('composer-mode-trigger').getAttribute('aria-label')).toBe('Choose a mode');

    rerender(<ComposerModePicker mode="design" onModeChange={vi.fn()} labelHidden />);
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();
  });

  it('keeps every mode description visible inside the open menu', () => {
    render(<ComposerModePicker mode="design" onModeChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('composer-mode-trigger'));

    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('Creates an editable plan document first');
    expect(menu.textContent).toContain('For creating or changing concrete outputs');
    expect(menu.textContent).toContain('For quick answers, edits, planning, and discussion');
  });

  it('shows localized copy', () => {
    render(
      <I18nProvider initial="zh-CN">
        <ComposerModePicker mode="plan" onModeChange={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('composer-mode-trigger').textContent).toContain('规划');

    fireEvent.click(screen.getByTestId('composer-mode-trigger'));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('先生成可编辑的规划文档');
    expect(menu.textContent).toContain('适合创建或修改具体设计产物');
    expect(menu.textContent).toContain('适合快速问答、修改建议、规划和讨论');
  });
});
