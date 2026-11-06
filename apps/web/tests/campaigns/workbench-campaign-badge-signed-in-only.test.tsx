// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchCampaignBadge } from '../../src/components/WorkbenchCampaignBadge';
import { I18nProvider } from '../../src/i18n';

// The DeepSeek campaign badge is an upsell pinned into the top-right account
// cluster, next to the plan chip, wallet balance and avatar — surfaces that
// only exist once the client is signed in to Vela. It must never greet a
// signed-out client, on any page that mounts the cluster.
const trackSpy = vi.fn();

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: trackSpy }),
}));

vi.mock('../../src/analytics/client', () => ({
  getResolvedDeviceId: () => null,
}));

const badgeSource = readFileSync(
  resolve(process.cwd(), 'src/components/WorkbenchCampaignBadge.tsx'),
  'utf8',
);
const entryShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryShell.tsx'),
  'utf8',
);
const entryNavRailSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryNavRail.tsx'),
  'utf8',
);

function renderBadge(loggedIn: boolean | null | undefined) {
  render(
    <I18nProvider initial="zh-CN">
      <WorkbenchCampaignBadge
        audience="unpaid"
        page="home"
        metricsConsent={false}
        loggedIn={loggedIn}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  trackSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('workbench campaign badge is signed-in only', () => {
  it('renders nothing for a signed-out client', () => {
    renderBadge(false);
    expect(screen.queryByTestId('deepseek-campaign-pricing-badge')).toBeNull();
  });

  it('renders nothing while the Vela login state is still unresolved', () => {
    renderBadge(null);
    expect(screen.queryByTestId('deepseek-campaign-pricing-badge')).toBeNull();
    cleanup();
    renderBadge(undefined);
    expect(screen.queryByTestId('deepseek-campaign-pricing-badge')).toBeNull();
  });

  it('does not burn a campaign impression on a client that cannot see the badge', () => {
    renderBadge(false);
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('still renders and reports for a signed-in client', () => {
    renderBadge(true);
    expect(screen.getByTestId('deepseek-campaign-pricing-badge')).toBeTruthy();
    expect(trackSpy).toHaveBeenCalledWith(
      'surface_view',
      expect.objectContaining({ area: 'campaign_badge' }),
      undefined,
    );
  });

  it('makes `loggedIn` a required prop so a new mount point cannot forget it', () => {
    // A future third mount point is caught by typecheck, not by review.
    expect(badgeSource).toMatch(/\n\s*loggedIn: boolean \| null \| undefined;/);
    expect(badgeSource).not.toMatch(/\n\s*loggedIn\?:/);
  });

  it('passes the Vela login state from both mount points', () => {
    // Entry shell rail: home plus every entry tab (projects, design systems,
    // plugins, community, members …). Workspace cluster: project detail.
    expect(entryShellSource).toMatch(
      /<WorkbenchCampaignBadge[\s\S]{0,400}?loggedIn=\{amrLoggedIn\}/,
    );
    expect(entryNavRailSource).toMatch(
      /<WorkbenchCampaignBadge[\s\S]{0,400}?loggedIn=\{amrLoggedIn\}/,
    );
  });
});
