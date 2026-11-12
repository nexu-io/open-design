// @vitest-environment jsdom
/**
 * Round-3 UI audit (S13): the app-level signed-out fallback must render the
 * SAME published-link block as the signed-in ShareTab — chain-icon URL row,
 * dark copy button, green check + 「已复制」 — not a bespoke monospace/grey
 * variant with the legacy 「已复制！」 label.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignedOutObservedShare } from '../../../src/components/share/SignedOutObservedShare';
import { I18nProvider } from '../../../src/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const url = 'https://viewer.example.test/cloud/artifact/project/s13';

function renderFallback(canUpdate = true) {
  return render(
    <I18nProvider initial="zh-CN">
      <SignedOutObservedShare url={url} canUpdate={canUpdate} onLoginUpdateSuccess={() => {}} />
    </I18nProvider>,
  );
}

describe('S13 signed-out observed share', () => {
  it('renders the shared chain-icon URL row and the design copy/update actions', () => {
    const { container } = renderFallback();
    const row = container.querySelector('.chrome-publish-plain .chrome-publish-url');
    expect(row).toHaveTextContent(url);
    expect(row?.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('code')).toBeNull();
    expect(screen.getByRole('switch', { name: '链接访问' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '复制链接' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '登录后更新' })).toBeVisible();
    expect(screen.getByText('文件有新改动，登录后可更新或关闭链接。')).toBeVisible();
  });

  it('shows the green-check 「已复制」 state after copying, then restores the label', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderFallback(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制链接' })); });
    expect(writeText).toHaveBeenCalledWith(url);
    const copied = screen.getByRole('button', { name: '已复制' });
    expect(copied.querySelector('svg path')).toHaveAttribute('d', 'm3 8 3 3 7-7');
    expect(copied).toBeEnabled();
    await act(async () => { vi.advanceTimersByTime(1800); });
    expect(screen.getByRole('button', { name: '复制链接' })).toBeVisible();
  });
});
