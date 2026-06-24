// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { BrandReadyPrompt } from '../../src/components/BrandReadyPrompt';

vi.mock('motion/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    motion: {
      div: ({ variants: _variants, initial: _initial, animate: _animate, exit: _exit, ...props }: Record<string, unknown>) =>
        React.createElement('div', props),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BrandReadyPrompt', () => {
  it('renders the dismiss control as a named icon button', () => {
    const onDismiss = vi.fn();

    render(
      <I18nProvider initial="zh-CN">
        <BrandReadyPrompt
          brandName="Open Design"
          onPreview={vi.fn()}
          onDismiss={onDismiss}
        />
      </I18nProvider>,
    );

    const dismiss = screen.getByRole('button', { name: '忽略' });

    expect(dismiss.getAttribute('title')).toBe('忽略');
    expect(dismiss.querySelector('svg')).toBeTruthy();

    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('stays mounted by default until the user dismisses it', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const onDismiss = vi.fn();

    render(
      <I18nProvider initial="en">
        <BrandReadyPrompt
          brandName="Open Design"
          onPreview={vi.fn()}
          onDismiss={onDismiss}
        />
      </I18nProvider>,
    );

    expect(onDismiss).not.toHaveBeenCalled();
    expect(setTimeoutSpy.mock.calls.some(([callback]) => callback === onDismiss)).toBe(false);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
