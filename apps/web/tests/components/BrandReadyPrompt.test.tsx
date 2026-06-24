// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { BrandReadyPrompt } from '../../src/components/BrandReadyPrompt';

afterEach(() => {
  cleanup();
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
});
