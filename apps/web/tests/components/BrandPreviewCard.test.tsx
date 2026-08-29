// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceContextFixture } from '../helpers/workspace-context';

const workspaceContextState = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
  resourceReadIdentity: undefined as
    | { context: WorkspaceCollabContext; generation: string }
    | null
    | undefined,
  loading: false,
}));
const fetchProjectFileTextMock = vi.hoisted(() => vi.fn(async () => null as string | null));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => workspaceContextState,
  workspaceResourceReadContext: (state: typeof workspaceContextState) => state.context,
}));

vi.mock('../../src/providers/registry', () => ({
  projectRawUrl: (projectId: string, filePath: string) => `/raw/${projectId}/${filePath}`,
  fetchProjectFileText: fetchProjectFileTextMock,
}));

import { BrandPreviewCard } from '../../src/components/BrandPreviewCard';
import { I18nProvider } from '../../src/i18n';

const rampBrand: BrandSummary = {
  meta: {
    id: 'brand-ramp',
    sourceUrl: 'https://ramp.com',
    createdAt: 0,
    updatedAt: 0,
    status: 'ready',
    designSystemId: 'user:brand-ramp',
    projectId: 'project-ramp',
  },
  brand: {
    name: 'Ramp',
    tagline: 'Spend smarter. Move faster.',
    description: 'Ramp is an all-in-one spend management platform.',
    sourceUrl: 'https://ramp.com',
    logo: { primary: 'logos/ramp.svg', alternates: [], notes: '' },
    colors: [
      { role: 'accent', hex: '#eaff00', oklch: '', name: 'Ramp Lime', usage: 'Primary actions' },
    ],
    typography: {
      display: { family: 'Inter', fallbacks: ['sans-serif'], weights: [600, 700] },
      body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 500] },
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
  },
};

describe('BrandPreviewCard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/brands/brand-ramp');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    );
    workspaceContextState.context = null;
    workspaceContextState.resourceReadIdentity = undefined;
    fetchProjectFileTextMock.mockClear();
    fetchProjectFileTextMock.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('re-enables panel actions after Use in new chat navigates away while the card stays mounted', async () => {
    const onApplyDesignSystem = vi.fn();
    const onOpenProject = vi.fn();

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard
          summary={rampBrand}
          variant="panel"
          onApplyDesignSystem={onApplyDesignSystem}
          onOpenProject={onOpenProject}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brand-preview-use'));

    await waitFor(() => {
      expect(onApplyDesignSystem).toHaveBeenCalledWith('user:brand-ramp');
      expect(window.location.pathname).toBe('/');
      expect((screen.getByTestId('brand-preview-use') as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTestId('brand-preview-open-project') as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByTestId('brand-preview-delete') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('closes the brand asset preview modal with Escape', async () => {
    render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={rampBrand} variant="panel" />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /landing page/i }));
    expect(screen.getByRole('dialog', { name: /landing page/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /landing page/i })).toBeNull();
    });
  });

  it('resets the real kit preview and font read when only the read generation advances', async () => {
    const context = workspaceContextFixture({
      workspaceId: 'workspace-preview',
      workspaceType: 'personal',
      workspaceMemberId: 'member-preview',
    });
    workspaceContextState.context = context;
    workspaceContextState.resourceReadIdentity = { context, generation: 'generation-a' };

    const view = render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={rampBrand} variant="panel" />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchProjectFileTextMock).toHaveBeenCalledTimes(1));
    const logo = screen.getByTestId('brand-preview-card').querySelector('img');
    expect(logo?.getAttribute('src')).toContain('/api/brands/brand-ramp/logo');
    fireEvent.error(logo!);
    expect(screen.getByTestId('brand-preview-card').querySelector('img')?.getAttribute('src'))
      .toBe('/raw/project-ramp/logos/ramp.svg');

    workspaceContextState.resourceReadIdentity = { context, generation: 'generation-b' };
    view.rerender(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={rampBrand} variant="panel" />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(fetchProjectFileTextMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('brand-preview-card').querySelector('img')?.getAttribute('src'))
        .toContain('/api/brands/brand-ramp/logo');
    });
  });

  it('keeps the card in place when a canonical scoped delete is denied', async () => {
    workspaceContextState.context = {
      workspaceId: 'workspace-delete',
      workspaceType: 'team',
      workspaceMemberId: 'member-delete',
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'platform_credits',
      seatSummary: { seatLimit: 3, usedSeats: 2, availableSeats: 1, isSeatFull: false },
      permissions: {
        canManageMembers: false,
        canManageBilling: false,
        canInviteMembers: false,
        canManageAutoRecharge: false,
        canShareProjects: true,
        canWriteSyncedFiles: false,
        canViewWorkspaceSettings: false,
        canManageSharedResources: false,
      },
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as Response);
    const onChanged = vi.fn();

    render(
      <I18nProvider initial="en">
        <BrandPreviewCard summary={rampBrand} variant="panel" onChanged={onChanged} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('brand-preview-delete'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/brands/brand-ramp', expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'x-od-workspace-id': 'workspace-delete',
          'x-od-workspace-member-id': 'member-delete',
        }),
      }));
      expect(onChanged).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/brands/brand-ramp');
      expect((screen.getByTestId('brand-preview-delete') as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
