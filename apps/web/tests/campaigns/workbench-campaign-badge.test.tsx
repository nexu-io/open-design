// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchCampaignBadge } from '../../src/components/WorkbenchCampaignBadge';
import { I18nProvider } from '../../src/i18n';

const trackSpy = vi.fn();

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: trackSpy }),
}));

vi.mock('../../src/analytics/client', () => ({
  getResolvedDeviceId: () => null,
}));

beforeEach(() => {
  window.localStorage.clear();
  trackSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeepSeek workbench campaign badge', () => {
  it('shows the DeepSeek offer to an unpaid user and opens localized Pricing', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(
      <I18nProvider initial="zh-CN">
        <WorkbenchCampaignBadge
          audience="unpaid"
          page="home"
          metricsConsent={false}
          loggedIn
        />
      </I18nProvider>,
    );

    const badge = screen.getByRole('button', {
      name: 'DeepSeek V4 Pro 与 V4 Flash 无限免费用，查看官网 Pricing',
    });
    expect(badge).toHaveTextContent('DeepSeek V4 Pro + V4 Flash 无限免费用');
    expect(badge).not.toHaveTextContent('Go');

    fireEvent.click(badge);

    const url = new URL(String(open.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://open-design.ai/zh/pricing/');
    expect(url.searchParams.get('od_locale')).toBe('zh');
    expect(url.searchParams.get('od_entry_source')).toBe('deepseek_workbench_badge');
    expect(url.searchParams.get('od_device_id')).toBeNull();
    expect(trackSpy).toHaveBeenCalledWith(
      'surface_view',
      expect.objectContaining({ user_state: 'unpaid' }),
      undefined,
    );
    expect(trackSpy).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({ element: 'open_pricing', user_state: 'unpaid' }),
      undefined,
    );
  });
});
