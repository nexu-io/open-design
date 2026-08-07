// @vitest-environment jsdom
//
// Behavioral contract for the DeepSeek V4 Flash campaign modal
// (`DeepSeekV4FlashCampaign`). The dialog portals to `document.body` while
// EntryShell keeps every entry view mounted behind `display:none`, so these
// specs pin the behaviors the source-contract tests cannot see:
//
// 1. the modal only interrupts the ACTIVE home view (要求文档:弹窗只在
//    #/home 展示,不在编辑器或其他工作流中打断用户), and re-arms when the
//    user returns to home without having dismissed it;
// 2. frequency control fails closed — an unreadable localStorage must not
//    turn "活动期内出现一次" into "every mount";
// 3. the paid 立即使用 CTA actually moves the workbench onto the campaign
//    model (agent `amr`, model `deepseek-v4-flash`) instead of only opening
//    the model picker (产品拍板 D5);
// 4. the unpaid upgrade path carries the telemetry consent + device id the
//    other two campaign touchpoints already forward.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekV4FlashCampaign } from '../../src/components/DeepSeekV4FlashCampaign';

const trackSpy = vi.fn();

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: trackSpy }),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: null,
    resourceReadIdentity: null,
    loading: false,
    identityChangePending: false,
  }),
}));

vi.mock('../../src/analytics/client', () => ({
  getResolvedDeviceId: () => null,
}));

const DIALOG = 'deepseek-v4-flash-campaign-dialog';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  trackSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('paid 立即使用 switches the workbench onto the campaign model', () => {
  it('applies agent amr + model deepseek-v4-flash and pulses the chip without opening the picker', () => {
    vi.useFakeTimers();
    const onUseCampaignModel = vi.fn();
    // Stand in for the home composer's model-switcher chip.
    const chip = document.createElement('button');
    chip.setAttribute('data-testid', 'inline-model-switcher-chip');
    const chipClick = vi.fn();
    chip.addEventListener('click', chipClick);
    document.body.appendChild(chip);
    try {
      render(
        <DeepSeekV4FlashCampaign
          audience="paid"
          active
          onUseCampaignModel={onUseCampaignModel}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Use now' }));

      // 产品拍板 D5: the CTA performs the real switch, not a picker tour.
      expect(onUseCampaignModel).toHaveBeenCalledWith(
        'amr',
        'deepseek-v4-flash',
      );
      // The analytics element stays `use_now`.
      expect(trackSpy).toHaveBeenCalledWith(
        'ui_click',
        expect.objectContaining({ element: 'use_now' }),
        undefined,
      );

      vi.advanceTimersByTime(1);
      // Visual feedback survives as the highlight pulse alone — no
      // chip.click(), so the model popover stays closed.
      expect(chipClick).not.toHaveBeenCalled();
      expect(chip.getAttribute('data-campaign-highlight')).toBe('true');
      vi.advanceTimersByTime(1_600);
      expect(chip.hasAttribute('data-campaign-highlight')).toBe(false);
    } finally {
      chip.remove();
    }
  });
});

describe('the modal never re-opens for a seen campaign (no URL override left)', () => {
  it('stays closed once the campaign was dismissed, whatever the page URL is', () => {
    // The former ?campaign= review parameter could force a seen campaign
    // back open. That backdoor is gone: frequency control is the only input.
    window.history.replaceState({}, '', '/?campaign=deepseek-v4-flash');
    window.localStorage.setItem(
      'open-design:campaign-seen:deepseek-v4-flash-unlimited-2026',
      '1',
    );

    render(<DeepSeekV4FlashCampaign audience="paid" active />);

    expect(screen.queryByTestId(DIALOG)).toBeNull();
  });
});

describe('unpaid upgrade path carries telemetry consent', () => {
  it('forwards metricsConsent and stamps od_device_id on the plans URL', () => {
    // The other two campaign touchpoints (workbench badge, model-switcher
    // upgrade) already record the AMR entry with metricsConsent and attach
    // the consent-gated device id; the modal must match.
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(
      <DeepSeekV4FlashCampaign
        audience="unpaid"
        active
        metricsConsent
        installationId="install-abc123"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade and use' }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(String(open.mock.calls[0]?.[0]));
    expect(url.searchParams.get('od_campaign_id')).toBe('deepseek_v4_flash');
    expect(url.searchParams.get('od_conversion_source')).toBe('deepseek_unpaid_modal');
    expect(url.searchParams.get('od_device_id')).toBe('install-abc123');
  });

  it('omits od_device_id without metrics consent', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(
      <DeepSeekV4FlashCampaign
        audience="unpaid"
        active
        metricsConsent={false}
        installationId="install-abc123"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade and use' }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(String(open.mock.calls[0]?.[0]));
    expect(url.searchParams.get('od_device_id')).toBeNull();
    // Attribution itself is consent-independent.
    expect(url.searchParams.get('od_campaign_id')).toBe('deepseek_v4_flash');
  });
});

describe('campaign modal only interrupts the active home view', () => {
  it('stays silent on non-home views even when the campaign is unseen', () => {
    render(<DeepSeekV4FlashCampaign audience="paid" active={false} />);

    expect(screen.queryByTestId(DIALOG)).toBeNull();
  });

  it('opens once home becomes active while the campaign is still unseen', () => {
    const { rerender } = render(
      <DeepSeekV4FlashCampaign audience="paid" active={false} />,
    );
    expect(screen.queryByTestId(DIALOG)).toBeNull();

    rerender(<DeepSeekV4FlashCampaign audience="paid" active />);

    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();
  });

  it('fails closed when frequency-control storage is unreadable', () => {
    // Private mode / disabled localStorage: `hasSeenCampaign` cannot know
    // whether the user already saw the modal. Guessing "unseen" would show
    // it on EVERY mount — the campaign promise is 活动期内出现一次, so an
    // unreadable store must count as seen.
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('localStorage disabled');
      });
    try {
      render(<DeepSeekV4FlashCampaign audience="paid" active />);

      expect(screen.queryByTestId(DIALOG)).toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });

  it('re-arms when the user leaves home without dismissing and comes back', () => {
    const { rerender } = render(
      <DeepSeekV4FlashCampaign audience="paid" active />,
    );
    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();

    // Navigating away is not a dismissal: the dialog disappears with the
    // view but must NOT be marked seen…
    rerender(<DeepSeekV4FlashCampaign audience="paid" active={false} />);
    expect(screen.queryByTestId(DIALOG)).toBeNull();

    // …so returning to home within the window shows it again.
    rerender(<DeepSeekV4FlashCampaign audience="paid" active />);
    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();
  });
});
