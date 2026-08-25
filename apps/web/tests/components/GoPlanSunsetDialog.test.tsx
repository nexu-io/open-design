// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoPlanSunsetDialog,
  isGoPlanSunsetDemo,
  resolveGoPlanSunsetCampaigns,
  shouldShowWhatsNewPopup,
} from '../../src/components/GoPlanSunsetDialog';

const track = vi.hoisted(() => vi.fn());

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track }),
}));

const trackingProps = {
  deliveryMode: 'demo' as const,
  currentPlanId: 'go',
  locale: 'zh-CN',
  metricsConsent: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('GoPlanSunsetDialog', () => {
  it('enables only the dedicated demo query value', () => {
    expect(isGoPlanSunsetDemo('?demo=go-plan-sunset')).toBe(true);
    expect(isGoPlanSunsetDemo('?demo=other')).toBe(false);
    expect(isGoPlanSunsetDemo('?campaign=go-plan-sunset')).toBe(false);
  });

  it('suppresses existing Home campaigns only while the sunset demo is active', () => {
    expect(resolveGoPlanSunsetCampaigns(true, 'unpaid', 'go')).toEqual({
      homeCampaignModalAudience: 'unknown',
      topRightCampaignKind: null,
    });
    expect(resolveGoPlanSunsetCampaigns(false, 'paid', 'deepseek')).toEqual({
      homeCampaignModalAudience: 'paid',
      topRightCampaignKind: 'deepseek',
    });
  });

  it('lets the sunset demo own the Home modal slot', () => {
    expect(shouldShowWhatsNewPopup(true, true)).toBe(false);
    expect(shouldShowWhatsNewPopup(true, false)).toBe(true);
    expect(shouldShowWhatsNewPopup(false, false)).toBe(false);
  });

  it('tracks one real announcement exposure with demo and plan dimensions', () => {
    const { rerender } = render(
      <GoPlanSunsetDialog active {...trackingProps} />,
    );

    expect(track).toHaveBeenCalledWith('surface_view', {
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element: 'modal',
      campaign_id: 'go_plan_sunset_202608',
      announcement_version: '2026_08_25',
      delivery_mode: 'demo',
      current_plan_id: 'go',
      locale: 'zh-CN',
    }, undefined);

    rerender(<GoPlanSunsetDialog active {...trackingProps} />);
    expect(track.mock.calls.filter(([event]) => event === 'surface_view')).toHaveLength(1);
  });

  it('tracks the subscription action and carries the same entry attribution into Pricing', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<GoPlanSunsetDialog active {...trackingProps} />);

    fireEvent.click(screen.getByRole('button', { name: '查看其他订阅' }));

    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      page_name: 'home',
      area: 'go_plan_sunset_modal',
      element: 'view_other_subscriptions',
      campaign_id: 'go_plan_sunset_202608',
      delivery_mode: 'demo',
      current_plan_id: 'go',
    }), undefined);
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      page_name: 'home',
      area: 'amr_entry',
      element: 'go_plan_sunset_modal',
      action: 'click_amr_entry',
      source_detail: 'go_plan_sunset_modal',
      campaign_id: 'go_plan_sunset_202608',
      conversion_source: 'go_plan_sunset_modal',
    }), undefined);

    const pricingUrl = new URL(open.mock.calls[0]![0] as string);
    expect(`${pricingUrl.origin}${pricingUrl.pathname}`).toBe(
      'https://open-design.ai/amr/dashboard',
    );
    expect(pricingUrl.searchParams.get('billing')).toBe('plan');
    expect(pricingUrl.searchParams.get('od_entry_source')).toBe('go_plan_sunset_modal');
    expect(pricingUrl.searchParams.get('od_campaign_id')).toBe('go_plan_sunset_202608');
    expect(pricingUrl.searchParams.get('od_conversion_source')).toBe('go_plan_sunset_modal');
    expect(pricingUrl.searchParams.get('od_entry_id')).toMatch(/^od-amr-/);
  });

  it('tracks acknowledgement separately from an implicit dialog close', () => {
    const { rerender } = render(<GoPlanSunsetDialog active {...trackingProps} />);

    fireEvent.click(screen.getByRole('button', { name: '我知道了' }));
    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      area: 'go_plan_sunset_modal',
      element: 'acknowledge',
    }), undefined);
    expect(track.mock.calls.filter(([, props]) => (
      props.area === 'go_plan_sunset_modal' && props.element === 'acknowledge'
    ))).toHaveLength(1);

    rerender(<GoPlanSunsetDialog active={false} {...trackingProps} />);
    rerender(<GoPlanSunsetDialog active {...trackingProps} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('tracks Escape as an implicit close', () => {
    render(<GoPlanSunsetDialog active {...trackingProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
      area: 'go_plan_sunset_modal',
      element: 'close',
      close_method: 'unknown',
    }), undefined);
    expect(track.mock.calls.filter(([, props]) => (
      props.area === 'go_plan_sunset_modal' && props.element === 'close'
    ))).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the announcement on an active Home demo and dismisses it', () => {
    render(<GoPlanSunsetDialog active />);

    expect(
      screen.getByRole('heading', { name: '关于停售 Go 订阅的说明' }),
    ).toBeInTheDocument();
    expect(screen.getByText('即日起停售 Go 新订阅')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看其他订阅' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '我知道了' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the subscription catalog from the secondary action', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<GoPlanSunsetDialog active />);

    fireEvent.click(screen.getByRole('button', { name: '查看其他订阅' }));

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://open-design.ai/amr/dashboard?source=open_design&billing=plan&',
      ),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('keeps an explicit dismissal for the rest of the mounted session', () => {
    const { rerender } = render(<GoPlanSunsetDialog active />);

    fireEvent.click(screen.getByRole('button', { name: '我知道了' }));
    rerender(<GoPlanSunsetDialog active={false} />);
    rerender(<GoPlanSunsetDialog active />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('focuses the modal, isolates the background, and restores focus on close', () => {
    const backgroundButton = document.createElement('button');
    document.body.appendChild(backgroundButton);
    backgroundButton.focus();

    render(<GoPlanSunsetDialog active />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveFocus();
    expect(backgroundButton).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: '我知道了' }));

    expect(backgroundButton).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(backgroundButton).toHaveFocus();
    backgroundButton.remove();
  });

  it('does not render outside the active Home view', () => {
    render(<GoPlanSunsetDialog active={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
