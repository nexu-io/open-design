// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrandEnrichmentBanner } from '../../src/components/BrandEnrichmentBanner';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBanner(options: { busy?: boolean } = {}) {
  const onContinue = vi.fn();
  render(
    <I18nProvider initial="en">
      <BrandEnrichmentBanner onContinue={onContinue} busy={options.busy} />
    </I18nProvider>,
  );
  return { onContinue };
}

describe('BrandEnrichmentBanner', () => {
  it('renders one AI Optimize action without user-facing skill choices', () => {
    const { onContinue } = renderBanner();

    expect(screen.getAllByText('AI Optimize').length).toBeGreaterThan(0);
    expect(screen.getByText(/10-20 minutes/)).toBeTruthy();
    expect(screen.queryByTestId('brand-enrichment-skill-design-md')).toBeNull();

    fireEvent.click(screen.getByTestId('brand-enrichment-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('disables the action while the optimization is starting', () => {
    renderBanner({ busy: true });

    const button = screen.getByTestId('brand-enrichment-continue') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Starting AI Optimize...')).toBeTruthy();
  });
});
