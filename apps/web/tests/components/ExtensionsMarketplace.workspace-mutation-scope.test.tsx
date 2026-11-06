// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InstalledPluginRecord,
  WorkspaceCollabContext,
} from '@open-design/contracts';

import { ExtensionsMarketplace } from '../../src/components/PluginsView';
import { I18nProvider } from '../../src/i18n';
import { workspaceProjectHeaders } from '../../src/collab/workspace-identity';
import { workspaceContextFixture } from '../helpers/workspace-context';

vi.mock('../../src/analytics/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/analytics/provider')>()),
  useAnalytics: () => ({ track: vi.fn() }),
}));

let workspaceContext: WorkspaceCollabContext | null;
let workspaceContextLoading: boolean;

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceContext,
    loading: workspaceContextLoading,
  }),
  useWorkspaceBilling: () => null,
}));

const USER_PLUGIN: InstalledPluginRecord = {
  id: 'user-plugin',
  title: 'User Plugin',
  version: '1.0.0',
  sourceKind: 'github',
  source: 'github:example/user-plugin',
  trust: 'restricted',
  capabilitiesGranted: [],
  manifest: {
    name: 'user-plugin',
    version: '1.0.0',
    title: 'User Plugin',
    od: { kind: 'scenario', mode: 'prototype' },
  },
  fsPath: '/tmp/user-plugin',
  installedAt: 1,
  updatedAt: 1,
};

const MARKETPLACE = {
  id: 'official',
  url: 'https://example.test/marketplace.json',
  trust: 'official',
  manifest: {
    name: 'Official',
    plugins: [
      {
        name: 'available-plugin',
        title: 'Available Plugin',
        source: 'github:example/available-plugin',
        version: '1.0.0',
      },
    ],
  },
};

const CONTEXTS = [
  ['team owner', workspaceContextFixture({
    workspaceId: 'team-owner',
    workspaceMemberId: 'member-owner',
    role: 'owner',
  })],
  ['team admin', workspaceContextFixture({
    workspaceId: 'team-admin',
    workspaceMemberId: 'member-admin',
    role: 'admin',
  })],
  ['team member', workspaceContextFixture({
    workspaceId: 'team-member',
    workspaceMemberId: 'member-member',
    role: 'member',
  })],
  ['Personal owner', workspaceContextFixture({
    workspaceId: 'personal-owner',
    workspaceMemberId: 'member-personal',
    workspaceType: 'personal',
    role: 'owner',
  })],
] as const;

let mutationRequests: Array<{ url: string; headers: Headers }>;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function installSuccess(): Response {
  const payload = `event: success\ndata: ${JSON.stringify({
    kind: 'success',
    plugin: { ...USER_PLUGIN, id: 'available-plugin', title: 'Available Plugin' },
  })}\n\n`;
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

beforeEach(() => {
  workspaceContext = CONTEXTS[0][1];
  workspaceContextLoading = false;
  mutationRequests = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/plugins/install') {
      mutationRequests.push({ url, headers: new Headers(init?.headers) });
      return installSuccess();
    }
    if (url === '/api/plugins/user-plugin/uninstall') {
      mutationRequests.push({ url, headers: new Headers(init?.headers) });
      return jsonResponse({ ok: true });
    }
    if (url === '/api/plugins') return jsonResponse({ plugins: [USER_PLUGIN] });
    if (url === '/api/skills') return jsonResponse({ skills: [] });
    if (url === '/api/marketplaces') return jsonResponse({ marketplaces: [MARKETPLACE] });
    if (url.includes('/api/workspace/')) return jsonResponse({ ids: [], resources: [] });
    return jsonResponse({});
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderMarketplace() {
  return render(
    <I18nProvider initial="en">
      <ExtensionsMarketplace onUsePlugin={vi.fn()} />
    </I18nProvider>,
  );
}

function expectExactWorkspaceHeaders(
  actual: Headers,
  context: WorkspaceCollabContext,
): void {
  expect(Object.fromEntries(actual.entries())).toMatchObject(
    Object.fromEntries(new Headers(workspaceProjectHeaders(context)).entries()),
  );
}

describe('ExtensionsMarketplace Workspace-scoped install/uninstall', () => {
  it.each(CONTEXTS)('sends exact %s headers when installing', async (_label, context) => {
    workspaceContext = context;
    renderMarketplace();

    const install = await screen.findByRole('button', { name: 'Install' });
    fireEvent.click(install);

    await waitFor(() => expect(mutationRequests).toHaveLength(1));
    expect(mutationRequests[0]?.url).toBe('/api/plugins/install');
    expectExactWorkspaceHeaders(mutationRequests[0]!.headers, context);
  });

  it.each(CONTEXTS)('sends exact %s headers when uninstalling', async (_label, context) => {
    workspaceContext = context;
    renderMarketplace();

    fireEvent.click(await screen.findByTestId('plugins-tab-installed'));
    fireEvent.click(await screen.findByTestId('plugins-card-more-user-plugin'));
    const uninstall = await screen.findByTestId('plugins-card-uninstall-user-plugin');
    fireEvent.click(uninstall);
    fireEvent.click(uninstall);

    await waitFor(() => expect(mutationRequests).toHaveLength(1));
    expect(mutationRequests[0]?.url).toBe('/api/plugins/user-plugin/uninstall');
    expectExactWorkspaceHeaders(mutationRequests[0]!.headers, context);
  });

  it('keeps visible install and uninstall actions disabled while identity is loading', async () => {
    const view = renderMarketplace();
    const install = await screen.findByRole('button', { name: 'Install' }) as HTMLButtonElement;

    workspaceContextLoading = true;
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    expect(install.disabled).toBe(true);

    workspaceContextLoading = false;
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByTestId('plugins-tab-installed'));
    fireEvent.click(await screen.findByTestId('plugins-card-more-user-plugin'));
    const uninstall = await screen.findByTestId(
      'plugins-card-uninstall-user-plugin',
    ) as HTMLButtonElement;

    workspaceContextLoading = true;
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    expect(uninstall.disabled).toBe(true);
    expect(mutationRequests).toEqual([]);
  });
});
