// @vitest-environment jsdom
//
// OPEND-3040 (product-confirmed): the marketing hover entry is also visible in
// the project workspace. Only the hover host is added there; the campaign
// modal and the account badge remain home-only, and the built-in DeepSeek pill
// is not duplicated.

import { cleanup, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoverProps = vi.hoisted(() => [] as Array<{ authenticated: boolean; sessionSubject: string | null }>);
vi.mock('../../src/components/ProductionCampaignHover', () => ({
  ProductionCampaignHover: (props: { authenticated: boolean; sessionSubject: string | null }) => {
    hoverProps.push(props);
    return <span data-testid="project-campaign-hover" />;
  },
}));

import {
  resetWorkspaceDirectoryCache,
  WorkspaceTopRightAccountCluster,
} from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

function freeContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-free',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'free',
    planId: null,
    displayName: 'Fixture',
    seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
    permissions: { canInviteMembers: false, canViewWorkspaceSettings: true },
  } as unknown as WorkspaceCollabContext;
}

function renderCluster(amrLoggedIn: boolean | null, amrAccountId: string | null) {
  return render(
    <I18nProvider initial="en">
      <WorkspaceTopRightAccountCluster
        workspaceContextOverride={freeContext()}
        amrLoggedIn={amrLoggedIn}
        amrAccountId={amrAccountId}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  hoverProps.length = 0;
  resetWorkspaceDirectoryCache();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [] })));
});

afterEach(() => {
  cleanup();
  resetWorkspaceDirectoryCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OPEND-3040 project workspace marketing hover', () => {
  it('mounts the hover host for the signed-in account inside the top-right cluster', () => {
    renderCluster(true, 'user-1');
    const hover = screen.getByTestId('project-campaign-hover');
    expect(hover.closest('.entry-top-right-cluster')).not.toBeNull();
    expect(hoverProps.at(-1)).toEqual({ authenticated: true, sessionSubject: 'user-1' });
  });

  it.each([
    ['signed out', false],
    ['login state unknown', null],
  ])('mounts no hover host when %s', (_label, loggedIn) => {
    renderCluster(loggedIn, 'user-1');
    expect(screen.queryByTestId('project-campaign-hover')).toBeNull();
    expect(hoverProps).toHaveLength(0);
  });

  it('follows an account swap without leaking the previous subject', () => {
    const view = renderCluster(true, 'user-1');
    view.rerender(
      <I18nProvider initial="en">
        <WorkspaceTopRightAccountCluster
          workspaceContextOverride={freeContext()}
          amrLoggedIn
          amrAccountId="user-2"
        />
      </I18nProvider>,
    );
    expect(hoverProps.at(-1)?.sessionSubject).toBe('user-2');
    view.rerender(
      <I18nProvider initial="en">
        <WorkspaceTopRightAccountCluster workspaceContextOverride={freeContext()} amrLoggedIn={false} amrAccountId={null} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('project-campaign-hover')).toBeNull();
  });

  it('keeps exactly one built-in campaign pill beside the hover', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T10:00:00.000Z'));
    renderCluster(true, 'user-1');
    expect(screen.getAllByTestId('deepseek-campaign-pricing-badge')).toHaveLength(1);
    expect(screen.getByTestId('project-campaign-hover')).toBeTruthy();
  });
});
