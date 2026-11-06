// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FileViewer } from '../../src/components/FileViewer';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function baseFile(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'asset.png',
    path: 'asset.png',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'image',
    mime: 'image/png',
    ...overrides,
  };
}

function deployableHtmlFile(): ProjectFile {
  return baseFile({
    name: 'index.html',
    path: 'index.html',
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Page',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    },
  });
}

/**
 * Wires the fetch routes the Cloudflare Pages deploy modal exercises on open
 * and on submit, and reports the JSON body of the outgoing deploy POST back
 * to the caller so a test can assert what target the UI forwarded.
 */
function mockDeployFetch(onDeployBody: (body: Record<string, unknown>) => void, failDeploy = false) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    if (url === '/api/projects/project-1/deployments') {
      return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    }
    if (url === '/api/deploy/config?providerId=cloudflare-pages') {
      return new Response(JSON.stringify({
        providerId: 'cloudflare-pages',
        configured: true,
        tokenMask: 'saved-cloudflare-token',
        teamId: '',
        teamSlug: '',
        accountId: 'account-123',
        projectName: '',
        target: 'preview',
      }), { status: 200 });
    }
    if (url === '/api/deploy/cloudflare-pages/zones') {
      return new Response(JSON.stringify({ zones: [] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/deploy' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      onDeployBody(body);
      if (failDeploy) return new Response(JSON.stringify({ error: { message: 'S12 deployment unavailable' } }), { status: 503 });
      return new Response(JSON.stringify({
        id: 'cloudflare-deploy',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: 'cloudflare-pages',
        url: 'https://demo-pages.pages.dev',
        deploymentId: 'cf-dep-1',
        deploymentCount: 1,
        target: body.target ?? 'preview',
        status: 'ready',
        createdAt: 1,
        updatedAt: 2,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

async function openCloudflareDeployModal(file: ProjectFile) {
  render(
    <FileViewer projectId="project-1" projectKind="prototype" file={file}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
    />,
  );

  // Deploy providers live on the Share panel ("publish online" is sharing),
  // so reaching a provider takes Share -> More sharing options -> provider.
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
  expect(screen.queryByRole('menuitem', { name: /Deploy to Cloudflare Pages/i })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'More sharing options' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

  const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });
  await waitFor(() => {
    expect((providerSelect as HTMLSelectElement).value).toBe('cloudflare-pages');
  });
}

function clickDeploySubmitButton() {
  const deployButtons = screen.getAllByRole('button', { name: /^Deploy$/i });
  // The share-menu trigger is also labelled "Deploy to Cloudflare Pages"; the
  // modal's own submit button is the last "Deploy"-named button on screen.
  fireEvent.click(deployButtons[deployButtons.length - 1]!);
}

describe('FileViewer deploy target selector', () => {
  it.each([
    ['vercel-self', /Deploy to Vercel/i],
    ['cloudflare-pages', /Deploy to Cloudflare Pages/i],
  ] as const)('opens the existing %s modal from the HTML share menu', async (providerId, label) => {
    const fetchMock = mockDeployFetch(() => {});
    vi.stubGlobal('fetch', fetchMock);
    render(<FileViewer projectId="project-1" projectKind="prototype" file={deployableHtmlFile()}
      liveHtml="<html><body>Hello</body></html>" />);
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    expect(screen.queryByRole('menuitem', { name: label })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'More sharing options' }));
    const item = await screen.findByRole('menuitem', { name: label });
    // A browser press reaches the document's outside-dismiss listener before click.
    fireEvent.mouseDown(item.querySelector('span')!);
    fireEvent.click(item);
    const select = await screen.findByRole('combobox', { name: /Provider/i });
    await waitFor(() => expect(select).toHaveValue(providerId));
    expect(screen.queryByRole('button', { name: 'More sharing options' })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/deploy/config?providerId=${providerId}`,
    ));
  });

  it('still dismisses the share panel and its deployment submenu on an outside press', async () => {
    vi.stubGlobal('fetch', mockDeployFetch(() => {}));
    render(<FileViewer projectId="project-1" projectKind="prototype" file={deployableHtmlFile()}
      liveHtml="<html><body>Hello</body></html>" />);
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'More sharing options' }));
    expect(screen.getByRole('menuitem', { name: /Deploy to Vercel/i })).toBeVisible();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'More sharing options' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Deploy to Vercel/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Provider/i })).toBeNull();
  });

  it.each([
    ['vercel-self', /Deploy to Vercel/i],
    ['cloudflare-pages', /Deploy to Cloudflare Pages/i],
  ] as const)('opens %s during upload and lets that upload complete in the background', async (providerId, label) => {
    const workspaceContext: WorkspaceCollabContext = {
      workspaceId: 'ws', workspaceType: 'team', teamId: 'ws', workspaceMemberId: 'owner',
      role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
      planId: null, providerMode: 'platform_credits',
      seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }),
      permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
    };
    const collab: CollabContextValue = {
      workspaceContext, workspaceContextLoading: false, enabled: false, member: null,
      present: [], publishedVersion: null, syncState: null, viewerOnly: false, writerAuthority: 'allowed',
      isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false, ownerDisplayName: null,
      ownerRole: null, downloadPending: false, reportChange: () => {}, requestPublish: () => {},
      refreshPresence: () => {}, checkStatusNow: () => {},
    };
    let release!: () => void;
    const uploading = new Promise<void>(resolve => { release = resolve; });
    let uploaded = false;
    const shareUrl = 'https://example.invalid/artifact/project-1/deploy-menu';
    const deployFetch = mockDeployFetch(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/integrations/vela/status')) return new Response(JSON.stringify({ loggedIn: true, user: { id: 'owner' } }));
      if (url.includes('/share-plan')) return new Response(JSON.stringify({ fileCount: 1, totalBytes: 100, exceedsSizeLimit: false, exclusions: [] }));
      if (url.includes('/publish-public')) {
        if (init?.method === 'POST') {
          await uploading;
          uploaded = true;
          return new Response(JSON.stringify({ status: 'published', receipt: { filePath: 'index.html', slug: 'deploy-menu', publishedAt: 1, version: 1, versionId: 'v1' }, url: shareUrl }));
        }
        return new Response(JSON.stringify({ publication: uploaded ? { url: shareUrl, slug: 'deploy-menu', fileName: 'index.html' } : null, status: uploaded ? 'active' : null }));
      }
      return deployFetch(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CollabProvider value={collab}><FileViewer projectId="project-1" projectKind="prototype"
      file={deployableHtmlFile()} liveHtml="<html><body>Hello</body></html>" /></CollabProvider>);
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    const publish = await screen.findByRole('menuitem', { name: /Generate and copy link/i });
    await waitFor(() => expect(publish).toBeEnabled());
    fireEvent.click(publish);
    try {
      expect(await screen.findByRole('progressbar')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'More sharing options' }));
      const item = screen.getByRole('menuitem', { name: label });
      fireEvent.mouseDown(item.querySelector('span')!);
      fireEvent.click(item);
      expect(await screen.findByRole('combobox', { name: /Provider/i })).toHaveValue(providerId);
      expect(screen.queryByRole('button', { name: 'More sharing options' })).toBeNull();
      await act(async () => release());
      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(shareUrl));
      // The viewer owns publication; dismissing both overlays preserves the result.
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
      expect(await screen.findByText(shareUrl)).toBeVisible();
      expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/publish-public') && init?.method === 'POST')).toHaveLength(1);
    } finally {
      await act(async () => release());
    }
  });

  it('keeps deployment failure feedback in the existing modal', async () => {
    vi.stubGlobal('fetch', mockDeployFetch(() => {}, true));
    await openCloudflareDeployModal(deployableHtmlFile());
    clickDeploySubmitButton();
    expect(await screen.findByText('S12 deployment unavailable')).toBeVisible();
    expect(screen.getByRole('combobox', { name: /Provider/i })).toHaveValue('cloudflare-pages');
    expect(screen.getByRole('button', { name: /^Deploy$/i })).toBeEnabled();
  });

  it('shows a deploy target selector defaulted to Production and forwards that default on deploy', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockDeployFetch((body) => { deployBody = body; }));

    await openCloudflareDeployModal(deployableHtmlFile());

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    expect((targetSelect as HTMLSelectElement).value).toBe('production');

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    // Default semantics: the daemon already treats an absent target as
    // production (apps/daemon/src/routes/deploy.ts), so the UI's default
    // must match that and explicitly send 'production' — leaving it
    // undefined or sending 'preview' would silently deploy to preview
    // instead of updating the live site, which is the regression this test
    // guards against.
    expect(deployBody!.target).toBe('production');
  });

  it('sends target: "preview" in the deploy request when the user selects the Preview target', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockDeployFetch((body) => { deployBody = body; }));

    await openCloudflareDeployModal(deployableHtmlFile());

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    fireEvent.change(targetSelect, { target: { value: 'preview' } });
    await waitFor(() => {
      expect((targetSelect as HTMLSelectElement).value).toBe('preview');
    });

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    expect(deployBody!.target).toBe('preview');
  });

  it('sends target: "production" in the deploy request when the user selects the Production target', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockDeployFetch((body) => { deployBody = body; }));

    await openCloudflareDeployModal(deployableHtmlFile());

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    fireEvent.change(targetSelect, { target: { value: 'production' } });
    await waitFor(() => {
      expect((targetSelect as HTMLSelectElement).value).toBe('production');
    });

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    expect(deployBody!.target).toBe('production');
  });
});
