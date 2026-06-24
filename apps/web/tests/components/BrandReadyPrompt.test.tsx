// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { BrandReadyPrompt } from '../../src/components/BrandReadyPrompt';

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
    vi.useFakeTimers();
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

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
