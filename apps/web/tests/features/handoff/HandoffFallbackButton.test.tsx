// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandoffFallbackButton } from '../../../src/features/handoff/components/HandoffFallbackButton';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

function renderFallback(props: Partial<Parameters<typeof HandoffFallbackButton>[0]> = {}) {
  const onLaunch = vi.fn();
  render(
    <I18nProvider initial="en">
      <HandoffFallbackButton
        fallbackId="finder"
        fallbackLabel="Finder"
        busy={null}
        error={null}
        onLaunch={onLaunch}
        {...props}
      />
    </I18nProvider>,
  );
  return { onLaunch };
}

describe('HandoffFallbackButton', () => {
  it('renders the fallback label and calls onLaunch when clicked', () => {
    const { onLaunch } = renderFallback();
    const button = screen.getByText('Finder').closest('button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('disables the button while its own launch is busy', () => {
    renderFallback({ busy: 'finder' });
    const button = screen.getByText('Finder').closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('stays enabled when a different target is busy', () => {
    renderFallback({ busy: 'cursor' });
    const button = screen.getByText('Finder').closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('renders the inline error when present', () => {
    renderFallback({ error: 'daemon refused: ENOENT' });
    expect(screen.getByTestId('handoff-fallback-error').textContent).toBe('daemon refused: ENOENT');
  });

  it('renders no error line when error is null', () => {
    renderFallback();
    expect(screen.queryByTestId('handoff-fallback-error')).toBeNull();
  });
});
