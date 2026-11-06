// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { BrandLogo } from '../../src/components/DesignKitView';

const CONTEXT: WorkspaceCollabContext = {
  workspaceId: 'workspace-brand',
  workspaceType: 'team',
  workspaceMemberId: 'member-brand',
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

afterEach(cleanup);

describe('BrandLogo Workspace scope', () => {
  it('scopes the brand logo navigation because img requests cannot carry headers', () => {
    const props = {
      brandId: 'brand-nike',
      name: 'Nike',
      faviconSize: 64,
      workspaceContext: CONTEXT,
    } as ComponentProps<typeof BrandLogo> & { workspaceContext: WorkspaceCollabContext };

    const { container } = render(createElement(BrandLogo, props));

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/api/brands/brand-nike/logo?workspaceId=workspace-brand&workspaceMemberId=member-brand',
    );
  });

  it('retries the brand source when exact Workspace scope resolves after a fallback', () => {
    const view = render(
      <BrandLogo
        brandId="brand-nike"
        logoSrc="/raw/project-nike/logos/mark.svg"
        name="Nike"
        faviconSize={64}
        workspaceContext={null}
      />,
    );
    const firstImage = view.container.querySelector('img');
    expect(firstImage?.getAttribute('src')).toBe('/api/brands/brand-nike/logo');
    fireEvent.error(firstImage!);
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe(
      '/raw/project-nike/logos/mark.svg',
    );

    view.rerender(
      <BrandLogo
        brandId="brand-nike"
        logoSrc="/raw/project-nike/logos/mark.svg"
        name="Nike"
        faviconSize={64}
        workspaceContext={CONTEXT}
      />,
    );
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe(
      '/api/brands/brand-nike/logo?workspaceId=workspace-brand&workspaceMemberId=member-brand',
    );
  });
});
