// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoPlanSunsetDialog } from '../../src/components/GoPlanSunsetDialog';
import { I18nProvider } from '../../src/i18n';

const track = vi.hoisted(() => vi.fn());

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderDialog(onDismiss = vi.fn(async () => undefined)) {
  const result = render(
    <I18nProvider initial="zh-CN">
      <GoPlanSunsetDialog
        active
        currentPlanId="go"
        metricsConsent={false}
        onDismiss={onDismiss}
      />
    </I18nProvider>,
  );
  return { ...result, onDismiss };
}

describe('GoPlanSunsetDialog', () => {
  it('tracks one targeted exposure with stable campaign dimensions', () => {
    const { rerender } = renderDialog();

    expect(track).toHaveBeenCalledWith('surface_view', {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element: 'modal',
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: 'targeted',
      current_plan_id: 'go',
      locale: 'zh-CN',
    }, undefined);

    rerender(
      <I18nProvider initial="zh-CN">
        <GoPlanSunsetDialog
          active
          currentPlanId="go"
          onDismiss={async () => undefined}
        />
      </I18nProvider>,
    );
    expect(track.mock.calls.filter(([event]) => event === 'surface_view')).toHaveLength(1);
  });

  it('tracks acknowledgement and delegates the required read write', async () => {
    const { onDismiss } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '我知道了' }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('acknowledge'));
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      area: 'go_plan_sunset_modal',
      element: 'acknowledge',
      delivery_mode: 'targeted',
    }), undefined);
  });

  it('uses the final announcement copy and treats the close control as dismissal', async () => {
    const { onDismiss } = renderDialog();

    expect(screen.getByRole('heading', { name: '关于停售 Go 订阅的公告' })).toBeTruthy();
    expect(screen.getByText('即日起停售 Go 新订阅')).toBeTruthy();
    expect(screen.getByText('除 Go 之外的其他订阅计划用户不受影响')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('close'));
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      area: 'go_plan_sunset_modal',
      element: 'close',
    }), undefined);
  });

  it('tracks Pricing attribution without consuming the announcement', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { onDismiss } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '查看其他订阅' }));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      area: 'go_plan_sunset_modal',
      element: 'view_other_subscriptions',
      campaign_id: 'go_plan_sunset_202608',
    }), undefined);
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      area: 'amr_entry',
      element: 'go_plan_sunset_modal',
      conversion_source: 'go_plan_sunset_modal',
    }), undefined);
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('od_entry_source=go_plan_sunset_modal'),
      '_blank',
      'noopener,noreferrer',
    );
  });
});
